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
 * │   CodeGen     │  closure-codegen transformFile
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
import { transformFile } from './closure-codegen/transform.ts'
import { injectHMR } from './postprocess/hmr.ts'
import { isComponentTag, pascalToKebabCase } from './utils/component-tags.ts'
import { ensureGeaCompilerSymbolImports } from './utils/imports.ts'

export interface CompilerContext {
  sourceFile: string
  code: string
  isServe: boolean
  isSSR: boolean
  hmrImportSource: string
  isStoreModule: (filePath: string) => boolean
  isComponentModule: (filePath: string) => boolean
  isClassComponentModule: (filePath: string) => boolean
  isFunctionComponentModule: (filePath: string) => boolean
  resolveImportPath: (importer: string, source: string) => string | null
  registerStoreModule: (filePath: string) => void
  registerComponentModule: (filePath: string) => void
}

function isComponentImportSource(source: string): boolean {
  if (source.startsWith('.')) return true
  if (source.startsWith('node:')) return false
  return true
}

/**
 * In dev mode, convert relative store imports (e.g. `import { router } from '../router'`)
 * to `const { router } = await import('../router')` placed after all class declarations.
 *
 * This breaks circular-dependency TDZ during HMR: classes are fully initialized
 * before the store module is loaded, so the store can safely import the component
 * classes back without hitting the temporal dead zone.
 */
export function transform(ctx: CompilerContext): { code: string; map: any } | null {
  const { sourceFile, code, isServe, hmrImportSource } = ctx

  // ── Quick checks ──────────────────────────────────────────────────────
  const hasAngleBrackets = code.includes('<') && code.includes('>')
  if (!hasAngleBrackets) return null

  // ── Parse ─────────────────────────────────────────────────────────────
  try {
    const parsed = parseSource(code)
    if (!parsed) return null
    const { functionalComponentInfo, hasJSX } = parsed
    let { ast, imports } = parsed
    let { componentClassNames } = parsed

    if (!hasJSX) return null

    // ── Preprocess: functional → class ────────────────────────────────
    if (functionalComponentInfo) {
      convertFunctionalToClass(ast, functionalComponentInfo, imports)
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
    imports.forEach((source) => {
      if (!isComponentImportSource(source)) return
      componentImportSet.add(source)
    })
    const componentImports = Array.from(componentImportSet)

    const storeImports = new Map<string, string>()
    const knownComponentImports = new Set<string>()
    const knownClassComponentImports = new Set<string>()
    const knownFactoryComponentImports = new Set<string>()
    const namedImportSources = new Map<string, string>()
    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value
        if (!isComponentImportSource(source)) return
        const resolvedImport = source.startsWith('.') ? ctx.resolveImportPath(sourceFile, source) : null
        const isComp = resolvedImport ? ctx.isComponentModule(resolvedImport) : false
        const isClassComp = resolvedImport ? ctx.isClassComponentModule(resolvedImport) : false
        const isFunctionComp = resolvedImport ? ctx.isFunctionComponentModule(resolvedImport) : false
        path.node.specifiers.forEach(
          (spec: { type: string; imported?: { name?: string }; local: { name: string } }) => {
            if (isComp) knownComponentImports.add(spec.local.name)
            if (isClassComp) knownClassComponentImports.add(spec.local.name)
            if (isFunctionComp) knownFactoryComponentImports.add(spec.local.name)
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
    // NEW PATH: transformFile — closure-compiled emission (cloneNode + runtime helpers).
    // No fallback. If transformFile can't rewrite this file's JSX, leave it.
    if (hasJSX) {
      const emitted = transformFile(code, sourceFile, {
        directClassComponents: knownClassComponentImports,
        directFactoryComponents: knownFactoryComponentImports,
        enableTinyReactiveComponents: !isServe,
      })
      if (emitted.changed) {
        // Re-parse the transformed code so the downstream passes (HMR, __geaTagName
        // injection, symbol imports, source-map generation) run against the new AST.
        const reparsed = parseSource(emitted.code)
        if (reparsed) {
          ast.program.body = reparsed.ast.program.body
          transformed = true
          // Dev/HMR-only component tag metadata. Production bundles do not need it.
          if (isServe) {
            for (const cn of emitted.rewritten) {
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
            }
          }
        }
      }
    }

    // ── HMR injection (dev only) ──────────────────────────────────────
    if (isServe && componentClassNames.length > 0) {
      let defaultExportClassName: string | null = null
      for (const node of ast.program.body) {
        if (t.isExportDefaultDeclaration(node)) {
          const decl = node.declaration
          if ((t.isClassDeclaration(decl) || t.isFunctionDeclaration(decl)) && decl.id) {
            defaultExportClassName = decl.id.name
          }
        }
      }

      const shouldProxyDep = (source: string): boolean => {
        if (!source.startsWith('.')) return false
        const resolved = ctx.resolveImportPath(sourceFile, source)
        if (!resolved) return false
        if (ctx.isStoreModule(resolved)) return false
        if (ctx.isComponentModule(resolved)) return true
        return false
      }
      const shouldSkipDepAccept = (source: string): boolean => {
        if (!source.startsWith('.')) return false
        const resolved = ctx.resolveImportPath(sourceFile, source)
        if (!resolved) return false
        return ctx.isStoreModule(resolved)
      }
      const hmrAdded = injectHMR(
        ast,
        componentClassNames,
        defaultExportClassName,
        componentImports,
        componentImportsUsedAsTags,
        hmrImportSource,
        shouldProxyDep,
        shouldSkipDepAccept,
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
