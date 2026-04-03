/**
 * Compiler pipeline orchestration.
 *
 * Source Code (.tsx)
 *     │
 *     ▼
 * ┌──────────────┐
 * │  Quick checks │  Angle brackets present? Not node_modules?
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │    Parse      │  Babel parse → AST + FileMetadata
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │  Preprocess   │  Functional-to-class conversion (if needed)
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │   Analyze     │  Detect store/component imports
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │   CodeGen     │  transformComponentFile / transformNonComponentJSX
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │ Post-process  │  __geaTagName, HMR, XSS imports
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │    Emit       │  @babel/generator → JavaScript + source map
 * └──────────────┘
 *
 * Key principle: data flows forward. No phase reaches back.
 */

import { generate, traverse, t } from './utils/babel-interop.ts'
import { parseSource } from './parse/parser.ts'
import { convertFunctionalToClass } from './preprocess/functional-to-class.ts'
import { transformComponentFile, transformNonComponentJSX } from './codegen/generator.ts'
import { injectHMR } from './postprocess/hmr.ts'
import { ensureImport, ensureGeaCompilerSymbolImports } from './codegen/member-chain.ts'
import { isComponentTag } from './codegen/jsx-utils.ts'
import { pascalToKebabCase } from './codegen/gen-template.ts'

export interface CompilerContext {
  sourceFile: string
  code: string
  isServe: boolean
  isSSR: boolean
  hmrImportSource: string
  isStoreModule: (filePath: string) => boolean
  isComponentModule: (filePath: string) => boolean
  resolveImportPath: (importer: string, source: string) => string | null
  registerStoreModule: (filePath: string) => void
  registerComponentModule: (filePath: string) => void
}

function isComponentImportSource(source: string): boolean {
  if (source.startsWith('.')) return true
  // Skip Node built-ins and known non-component packages
  if (source.startsWith('node:')) return false
  // Package imports — could contain Gea components
  return true
}

export function transform(ctx: CompilerContext): { code: string; map: any } | null {
  const { sourceFile, code, isServe, isSSR, hmrImportSource } = ctx

  // ── Quick checks ──────────────────────────────────────────────────────
  const hasAngleBrackets = code.includes('<') && code.includes('>')
  if (!hasAngleBrackets) return null

  // ── Parse ─────────────────────────────────────────────────────────────
  try {
    const parsed = parseSource(code)
    if (!parsed) return null
    const { functionalComponentInfo, hasJSX } = parsed
    let { ast, componentClassName, imports } = parsed
    let { componentClassNames } = parsed

    if (!hasJSX) return null

    // ── Preprocess: functional → class ────────────────────────────────
    if (functionalComponentInfo) {
      convertFunctionalToClass(ast, functionalComponentInfo, imports)
      componentClassName = functionalComponentInfo.name
      componentClassNames = [functionalComponentInfo.name]
      const freshCode = generate(ast, { retainLines: true }).code
      const freshParsed = parseSource(freshCode)
      if (freshParsed) {
        ast = freshParsed.ast
        imports = freshParsed.imports
      }
    }

    // ── Detect store/component imports ────────────────────────────────
    if (componentClassNames.length > 0) {
      ctx.registerComponentModule(sourceFile)
    }

    let transformed = false
    const componentImportSet = new Set<string>()
    const componentImportsUsedAsTags = new Set<string>()
    let isDefaultExport = false

    imports.forEach((source) => {
      if (!isComponentImportSource(source)) return
      componentImportSet.add(source)
    })
    const componentImports = Array.from(componentImportSet)

    const storeImports = new Map<string, string>()
    const knownComponentImports = new Set<string>()
    const namedImportSources = new Map<string, string>()
    traverse(ast, {
      ExportDefaultDeclaration() {
        isDefaultExport = true
      },
      ImportDeclaration(path) {
        const source = path.node.source.value
        if (!isComponentImportSource(source)) return
        const resolvedImport = source.startsWith('.') ? ctx.resolveImportPath(sourceFile, source) : null
        const isComp = resolvedImport ? ctx.isComponentModule(resolvedImport) : false
        path.node.specifiers.forEach(
          (spec: { type: string; imported?: { name?: string }; local: { name: string } }) => {
            if (isComp) knownComponentImports.add(spec.local.name)
            if (spec.type === 'ImportDefaultSpecifier') {
              if (resolvedImport && !ctx.isStoreModule(resolvedImport)) return
              storeImports.set(spec.local.name, source)
            } else if (spec.type === 'ImportSpecifier') {
              namedImportSources.set(spec.local.name, source)
              if (resolvedImport && ctx.isStoreModule(resolvedImport)) {
                storeImports.set(spec.local.name, source)
              } else if (!resolvedImport && source.startsWith('@geajs/core') && spec.local.name === 'router') {
                storeImports.set(spec.local.name, source)
              }
              // Recognize PascalCase exports from @geajs/core as components
              // (exclude base classes — they're not child component tags)
              const importedName = spec.imported?.name ?? spec.local.name
              const geaCoreBaseClasses = ['Component', 'Store']
              if (
                source === '@geajs/core' &&
                isComponentTag(importedName) &&
                !geaCoreBaseClasses.includes(importedName)
              ) {
                knownComponentImports.add(spec.local.name)
              }
            }
          },
        )
      },
      VariableDeclarator(path: any) {
        const init = path.node.init
        if (
          init &&
          init.type === 'NewExpression' &&
          init.callee?.type === 'Identifier' &&
          namedImportSources.has(init.callee.name) &&
          path.node.id?.type === 'Identifier'
        ) {
          const source = namedImportSources.get(init.callee.name)!
          storeImports.set(path.node.id.name, source)
        }
      },
    })

    // ── CodeGen per component ─────────────────────────────────────────
    if (hasJSX) {
      const originalAST = parseSource(code)!.ast
      if (componentClassNames.length > 0) {
        for (const cn of componentClassNames) {
          if (!imports.has(cn)) imports.set(cn, sourceFile)
        }
        for (const cn of componentClassNames) {
          const result = transformComponentFile(
            ast,
            imports,
            storeImports,
            cn,
            sourceFile,
            originalAST,
            componentImportsUsedAsTags,
            knownComponentImports,
            isSSR,
          )
          if (result) transformed = true
        }
        // ── Inject __geaTagName static property ───────────────────────
        for (const cn of componentClassNames) {
          const kebab = pascalToKebabCase(cn)
          traverse(ast, {
            noScope: true,
            ClassDeclaration(path: any) {
              if (!path.node.id || path.node.id.name !== cn) return
              const prop = t.classProperty(t.identifier('__geaTagName'), t.stringLiteral(kebab))
              prop.static = true
              path.node.body.body.unshift(prop)
              path.stop()
            },
          })
          transformed = true
        }
      } else {
        transformed = transformNonComponentJSX(ast, imports)
      }
    }

    // ── HMR injection (dev only) ──────────────────────────────────────
    if (isServe && componentClassName) {
      const shouldProxyDep = (source: string): boolean => {
        if (!source.startsWith('.')) return false
        const resolved = ctx.resolveImportPath(sourceFile, source)
        if (!resolved) return false
        if (ctx.isStoreModule(resolved)) return false
        if (ctx.isComponentModule(resolved)) return true
        return false
      }
      const hmrAdded = injectHMR(
        ast,
        componentClassName,
        componentImports,
        componentImportsUsedAsTags,
        isDefaultExport,
        hmrImportSource,
        shouldProxyDep,
      )
      if (hmrAdded) transformed = true
    }

    if (!transformed) return null

    // ── GEA symbol + XSS import injection ──────────────────────────────
    ensureGeaCompilerSymbolImports(ast)

    // ── Emit ──────────────────────────────────────────────────────────
    const output = generate(ast, { sourceMaps: true, sourceFileName: sourceFile }, code)
    return { code: output.code, map: output.map }
  } catch (error: any) {
    if (error?.__geaCompileError) {
      throw error
    }
    console.warn(`[gea-plugin] Failed to transform ${sourceFile}:`, error.message, '\n', error.stack)
    return null
  }
}
