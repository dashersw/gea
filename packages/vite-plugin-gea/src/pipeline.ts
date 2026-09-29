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
 * │  Preprocess   │  Arrow components → function declarations,
 * │               │  functional-to-class conversion (if needed)
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
import { normalizeArrowComponents } from './preprocess/arrow-components.ts'
import { transformFile, type TransformResult } from './closure-codegen/transform.ts'
import { injectHMR } from './postprocess/hmr.ts'
import { compilerError, isGeaCompileError, withSourceFile, type GeaCompileError } from './utils/compile-error.ts'
import { isComponentTag, pascalToKebabCase } from './utils/component-tags.ts'
import { ensureGeaCompilerSymbolImports } from './utils/imports.ts'
import type { GeaIrComponent, GeaIrModule } from './closure-codegen/ir.ts'

const COMPILER_BUG_HINT =
  'This is a bug in the Gea compiler. Please report it at https://github.com/dashersw/gea/issues'

export interface CompilerContext {
  sourceFile: string
  code: string
  isServe: boolean
  isSSR: boolean
  /** Compiling for the embedded/native (geatsc/IR) backend. Threaded to transformFile. */
  embedded?: boolean
  /** Fail on JSX the compiler can't compile instead of passing it to `warn`. See `GeaPluginOptions.strict`. */
  strict?: boolean
  /** Receives each warning about JSX the compiler can't compile, with the file and location added. */
  warn?: (warning: GeaCompileError) => void
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
export function transform(
  ctx: CompilerContext,
): { code: string; map: any; ir?: { module: GeaIrModule; components: GeaIrComponent[] } } | null {
  const { sourceFile, code, isServe, hmrImportSource } = ctx

  // ── Quick checks ──────────────────────────────────────────────────────
  const hasAngleBrackets = code.includes('<') && code.includes('>')
  if (!hasAngleBrackets) return null

  // ── Parse ─────────────────────────────────────────────────────────────
  let sourceParsed = false
  try {
    let parsed = parseSource(code)
    if (!parsed) return null
    sourceParsed = true

    // Each print → re-parse round trip below moves node locations into the
    // printed code. Printing with the previous step's map as `inputSourceMap`
    // gives a map from the printed code back to `code`, so the final source
    // map still points at the user's file. `sourceMap` covers `source`;
    // `astMap` covers the locations in `ast`. Neither is set while they are
    // still positions in `code`.
    const print = (node: t.Node, inputSourceMap: unknown) =>
      generate(node, { retainLines: true, sourceMaps: true, sourceFileName: sourceFile, inputSourceMap }, code)

    // ── Preprocess: arrow components → function declarations ──────────
    // transformFile only compiles `function` components. Rewrite arrow
    // components first so every later phase (metadata, functional → class,
    // codegen) works on the same source. `retainLines` keeps the line numbers
    // of compile errors pointing at the user's file.
    let source = code
    let sourceMap: unknown
    if (parsed.hasJSX && normalizeArrowComponents(parsed.ast, sourceFile)) {
      const printed = print(parsed.ast, undefined)
      source = printed.code
      sourceMap = printed.map
      parsed = parseSource(source)
      if (!parsed) return null
    }
    let astMap = sourceMap

    const { functionalComponentInfo, hasJSX } = parsed
    let { ast, imports } = parsed
    let { componentClassNames } = parsed

    if (!hasJSX) return null

    // ── Preprocess: functional → class ────────────────────────────────
    if (functionalComponentInfo) {
      convertFunctionalToClass(ast, functionalComponentInfo, imports)
      componentClassNames = [functionalComponentInfo.name]
      const fresh = print(ast, astMap)
      const freshParsed = parseSource(fresh.code)
      if (freshParsed) {
        ast = freshParsed.ast
        imports = freshParsed.imports
        astMap = fresh.map
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
    let ir: { module: GeaIrModule; components: GeaIrComponent[] } | undefined
    if (hasJSX) {
      const transformOptions = {
        directClassComponents: knownClassComponentImports,
        directFactoryComponents: knownFactoryComponentImports,
        enableTinyReactiveComponents: !isServe,
        embedded: ctx.embedded,
        sourceMaps: true,
        inputSourceMap: sourceMap,
        strict: ctx.strict,
      }
      const emitted = transformFile(source, sourceFile, transformOptions)
      for (const warning of emitted.warnings) ctx.warn?.(withSourceFile(warning, sourceFile))
      if (emitted.changed) {
        ir = emitted.ir
        // Re-parse the transformed code so the downstream passes (HMR, __geaTagName
        // injection, symbol imports, source-map generation) run against the new AST.
        let reparsed: ReturnType<typeof parseSource>
        try {
          reparsed = parseSource(emitted.code)
        } catch (error) {
          throw invalidEmitError(error, emitted.decodedMap)
        }
        if (reparsed) {
          ast.program.body = reparsed.ast.program.body
          astMap = emitted.map
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
    const output = generate(ast, { sourceMaps: true, sourceFileName: sourceFile, inputSourceMap: astMap }, code)
    return { code: output.code, map: output.map, ir }
  } catch (error: any) {
    // The only soft failure: Babel can't parse the file's own source. Its
    // jsx+typescript parser rejects some valid TypeScript (`<T>value` in a .ts
    // file), and Vite's own parser still reports real syntax errors.
    if (!sourceParsed) return null
    if (isGeaCompileError(error)) throw withSourceFile(error, sourceFile)
    const err = compilerError(`Internal compiler error: ${reasonOf(error)}`, null, COMPILER_BUG_HINT)
    err.cause = error
    throw withSourceFile(err, sourceFile)
  }
}

/** The error message without Babel's ` (line:column)` suffix, which may be a position in generated code. */
function reasonOf(error: any): string {
  return String(error?.message ?? error).replace(/ \(\d+:\d+\)$/, '')
}

/**
 * Babel rejected the code transformFile emitted, so its position is in that
 * code, not the user's. Map it back through the emit's source map.
 */
function invalidEmitError(error: any, decodedMap: TransformResult['decodedMap']): GeaCompileError {
  const err = compilerError(`The compiled output is invalid JavaScript: ${reasonOf(error)}`, null, COMPILER_BUG_HINT)
  err.cause = error
  const at = error?.loc
  if (!at) return err
  const segments = decodedMap?.mappings[at.line - 1] ?? []
  // Last segment starting at or before the error column; a segment is
  // [generatedColumn, sourceIndex, sourceLine (0-based), sourceColumn].
  const segment = segments.filter((s) => s.length >= 4 && s[0] <= at.column).pop()
  if (segment) err.loc = { line: segment[2] + 1, column: segment[3] }
  return err
}
