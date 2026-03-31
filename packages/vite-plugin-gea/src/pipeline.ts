/**
 * Compiler pipeline orchestration.
 *
 * Source Code (.tsx)
 *     │
 *     ▼
 * ┌──────────────┐
 * │  Preprocess   │  Functional-to-class conversion (if needed)
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │    Parse      │  Babel parse → AST + FileMetadata
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │   Analyze     │  AST → analysis results per component
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │   CodeGen     │  Analysis → AST mutations (methods, imports)
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │ Post-process  │  HMR, XSS imports, JSX cleanup, map join
 * └──────┬───────┘
 *        │
 *        ▼
 * ┌──────────────┐
 * │    Emit       │  @babel/generator → JavaScript + source map
 * └──────────────┘
 *
 * Key principle: data flows forward. No phase reaches back.
 */

import { generate, t } from './utils/babel-interop.ts'
import { parseSource, type ParseResult } from './parse/parser.ts'
import { collectStateReferences } from './parse/state-refs.ts'
import { resolveImportPath } from './parse/store-analysis.ts'
import { convertFunctionalToClass } from './preprocess/functional-to-class.ts'
import { transformComponentFile, transformNonComponentJSX } from './codegen/generator.ts'
import { injectHMR } from './postprocess/hmr.ts'
import { ensureXSSImports } from './postprocess/xss-imports.ts'
import { transformRemainingJSX } from './postprocess/jsx-cleanup.ts'
import { addJoinToMapCalls } from './postprocess/map-join.ts'
import { isComponentTag } from './codegen/ast-helpers.ts'
import { pascalToKebabCase } from './codegen/gen-template.ts'

export interface TransformOptions {
  sourceFile: string
  isServe: boolean
  hmrImportSource?: string
  storeModules: Set<string>
  componentModules: Set<string>
  shouldProxyDep?: (importSource: string) => boolean
}

export interface TransformResult {
  code: string
  map: any
}

export function transform(
  code: string,
  options: TransformOptions,
): TransformResult | null {
  // ── Parse ──────────────────────────────────────────────────────────────
  const parseResult = parseSource(code)
  if (!parseResult || !parseResult.hasJSX) return null

  let ast = parseResult.ast
  let componentClassName = parseResult.componentClassName
  const componentClassNames = [...parseResult.componentClassNames]
  const imports = parseResult.imports
  const importKinds = parseResult.importKinds

  // ── Preprocess: functional → class ─────────────────────────────────────
  if (parseResult.functionalComponentInfo && !componentClassName) {
    convertFunctionalToClass(ast, parseResult.functionalComponentInfo, imports)
    // Re-parse after conversion
    const reParsed = parseSource(generate(ast).code)
    if (!reParsed) return null
    ast = reParsed.ast
    componentClassName = reParsed.componentClassName
    if (componentClassName && !componentClassNames.includes(componentClassName)) {
      componentClassNames.push(componentClassName)
    }
  }

  // ── Detect store/component imports ─────────────────────────────────────
  const storeImports = new Map<string, string>()
  const componentImports: string[] = []
  const knownComponentImports = new Set<string>()

  for (const [localName, source] of imports) {
    const resolved = resolveImportToAbsolute(source, options.sourceFile)
    if (resolved) {
      if (options.storeModules.has(resolved)) {
        storeImports.set(localName, source)
      }
      if (options.componentModules.has(resolved)) {
        componentImports.push(source)
        knownComponentImports.add(localName)
      }
    } else if (isLikelyStoreImport(source)) {
      storeImports.set(localName, source)
    }
  }

  // ── Analyze + CodeGen per component ────────────────────────────────────
  let isDefaultExport = false

  for (const className of componentClassNames) {
    // Determine export style
    for (const node of ast.program.body) {
      if (t.isExportDefaultDeclaration(node)) {
        if (
          (t.isClassDeclaration(node.declaration) && node.declaration.id?.name === className) ||
          (t.isIdentifier(node.declaration) && node.declaration.name === className)
        ) {
          isDefaultExport = true
        }
      }
    }

    transformComponentFile(
      ast,
      imports,
      storeImports,
      className,
      options.sourceFile,
      ast,
      new Set<string>(),
      knownComponentImports,
      false,
    )
  }

  // Transform JSX outside component classes
  if (componentClassNames.length > 0) {
    transformNonComponentJSX(ast)
  }

  // ── Post-process ───────────────────────────────────────────────────────

  // HMR injection (dev only)
  if (options.isServe && componentClassName) {
    const componentImportsUsedAsTags = new Set<string>()
    for (const name of knownComponentImports) {
      componentImportsUsedAsTags.add(name)
    }

    injectHMR(
      ast,
      componentClassName,
      componentImports,
      componentImportsUsedAsTags,
      isDefaultExport,
      options.hmrImportSource,
      options.shouldProxyDep,
    )
  }

  // XSS helper imports
  if (componentClassNames.length > 0) {
    ensureXSSImports(ast)
  }

  // ── Emit ───────────────────────────────────────────────────────────────
  const output = generate(ast, { sourceMaps: true, sourceFileName: options.sourceFile }, code)

  return {
    code: output.code,
    map: output.map,
  }
}

function resolveImportToAbsolute(source: string, currentFile: string): string | null {
  if (!source.startsWith('./') && !source.startsWith('../')) return null
  try {
    return resolveImportPath(source, currentFile)
  } catch {
    return null
  }
}

function isLikelyStoreImport(source: string): boolean {
  return /store|state/i.test(source) && !source.includes('node_modules')
}
