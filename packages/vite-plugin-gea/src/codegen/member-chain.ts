import { t } from '../utils/babel-interop.ts'
import { id, jsImport } from 'eszter'
import type { PathParts } from '../ir/types.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'

// ─── Import management ──────────────────────────────────────────────

export function ensureImport(ast: t.File, source: string, specifier: string, isDefault = false): boolean {
  const program = ast.program

  const buildSpecifier = () =>
    isDefault ? t.importDefaultSpecifier(id(specifier)) : t.importSpecifier(id(specifier), id(specifier))

  if (isDefault) {
    const alreadyHasDefault = program.body.some(
      (node) =>
        t.isImportDeclaration(node) &&
        node.source.value === source &&
        node.specifiers.some((s) => t.isImportDefaultSpecifier(s)),
    )
    if (alreadyHasDefault) return false
    const insertIndex = Math.max(
      0,
      program.body.reduce((idx, node, i) => (t.isImportDeclaration(node) ? i + 1 : idx), 0),
    )
    program.body.splice(
      insertIndex,
      0,
      isDefault
        ? jsImport`import ${id(specifier)} from ${source};`
        : jsImport`import { ${id(specifier)} } from ${source};`,
    )
    return true
  }

  const declaration = program.body.find((node) => t.isImportDeclaration(node) && node.source.value === source) as
    | t.ImportDeclaration
    | undefined

  if (!declaration) {
    const insertIndex = Math.max(
      0,
      program.body.reduce((idx, node, i) => (t.isImportDeclaration(node) ? i + 1 : idx), 0),
    )
    program.body.splice(insertIndex, 0, jsImport`import { ${id(specifier)} } from ${source};`)
    return true
  }

  const exists = declaration.specifiers.some(
    (s) => t.isImportSpecifier(s) && t.isIdentifier(s.local) && s.local.name === specifier,
  )

  if (!exists) {
    declaration.specifiers.push(buildSpecifier())
    return true
  }

  return false
}

// ─── GEA Symbol helpers ─────────────────────────────────────────────

/** `this[GEA_*]` — compiler output; identifier imported from `@geajs/core`. */
export function buildThisGeaMember(symExportName: string): t.MemberExpression {
  return t.memberExpression(t.thisExpression(), id(symExportName), true)
}

export function buildThisGeaCall(symExportName: string, args: t.Expression[] = []): t.CallExpression {
  return t.callExpression(buildThisGeaMember(symExportName), args)
}

/** `expr[GEA_*]` (e.g. `el[GEA_DOM_KEY]`). */
export function buildExprGeaMember(expr: t.Expression, symExportName: string): t.MemberExpression {
  return t.memberExpression(expr, id(symExportName), true)
}

/** `geaListItemsSymbol(arrayPropName)` — the call expression for the items Symbol. */
export function buildListItemsSymbol(arrayPropName: string): t.CallExpression {
  return t.callExpression(t.identifier('geaListItemsSymbol'), [t.stringLiteral(arrayPropName)])
}

/** `this[geaListItemsSymbol(arrayPropName)]` — computed member access for the items array. */
export function buildThisListItems(arrayPropName: string): t.MemberExpression {
  return t.memberExpression(t.thisExpression(), buildListItemsSymbol(arrayPropName), true)
}

const GEA_COMPILER_SYMBOL_IMPORTS = [
  'GEA_RENDERED',
  'GEA_PARENT_COMPONENT',
  'GEA_ELEMENT',
  'GEA_MAPS',
  'GEA_CONDS',
  'GEA_RESET_ELS',
  'GEA_OBSERVE',
  'GEA_OBSERVE_LIST',
  'GEA_EL',
  'GEA_UPDATE_TEXT',
  'GEA_REQUEST_RENDER',
  'GEA_UPDATE_PROPS',
  'GEA_SYNC_MAP',
  'GEA_REGISTER_MAP',
  'GEA_PATCH_COND',
  'GEA_PATCH_NODE',
  'GEA_REGISTER_COND',
  'GEA_REFRESH_LIST',
  'GEA_RECONCILE_LIST',
  'GEA_ENSURE_ARRAY_CONFIGS',
  'GEA_APPLY_LIST_CHANGES',
  'GEA_INSTANTIATE_CHILD_COMPONENTS',
  'GEA_MOUNT_COMPILED_CHILD_COMPONENTS',
  'GEA_SWAP_CHILD',
  'GEA_SWAP_STATE_CHILDREN',
  'GEA_CHILD',
  'GEA_LIST_CONFIG_REFRESHING',
  'GEA_DOM_KEY',
  'GEA_DOM_ITEM',
  'GEA_DOM_PROPS',
  'GEA_HANDLE_ITEM_HANDLER',
  'GEA_MAP_CONFIG_TPL',
  'GEA_MAP_CONFIG_PREV',
  'GEA_MAP_CONFIG_COUNT',
  'GEA_CLONE_ITEM',
  'GEA_CLONE_TEMPLATE',
  'GEA_ON_PROP_CHANGE',
  'GEA_SETUP_LOCAL_STATE_OBSERVERS',
  'GEA_SETUP_REFS',
  'GEA_SYNC_DOM_REFS',
  'GEA_CTOR_TAG_NAME',
  'GEA_PROXY_RAW',
  'GEA_PROXY_GET_TARGET',
  'GEA_STORE_ROOT',
  'geaCondPatchedSymbol',
  'geaCondValueSymbol',
  'geaPrevGuardSymbol',
  'geaSanitizeAttr',
  'geaEscapeHtml',
  'geaListItemsSymbol',
] as const

export function ensureGeaCompilerSymbolImports(ast: t.File): void {
  const symbolSet: ReadonlySet<string> = new Set(GEA_COMPILER_SYMBOL_IMPORTS)
  const used = new Set<string>()

  for (const node of ast.program.body) {
    collectReferencedSymbols(node, symbolSet, used)
  }

  for (const name of used) {
    ensureImport(ast, '@geajs/core', name)
  }
}

function collectReferencedSymbols(node: any, symbols: ReadonlySet<string>, out: Set<string>): void {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) collectReferencedSymbols(child, symbols, out)
    return
  }

  if (node.type === 'ImportDeclaration') return

  if (node.type === 'Identifier' && symbols.has(node.name)) {
    out.add(node.name)
  }

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue
    collectReferencedSymbols(node[key], symbols, out)
  }
}

// ─── Member-chain builders ──────────────────────────────────────────

export function buildMemberChain(base: t.Expression, path: string): t.Expression {
  return buildMemberChainFromParts(base, path ? path.split('.') : [])
}

export function buildMemberChainFromParts(base: t.Expression, parts: PathParts): t.Expression {
  if (parts.length === 0) return base
  return parts.reduce<t.Expression>((acc, prop) => {
    const isIndex = /^\d+$/.test(prop)
    return t.memberExpression(acc, isIndex ? t.numericLiteral(Number(prop)) : id(prop), isIndex)
  }, base)
}

export function buildOptionalMemberChain(base: t.Expression, path: string): t.Expression {
  return buildOptionalMemberChainFromParts(base, path ? path.split('.') : [])
}

export function buildOptionalMemberChainFromParts(base: t.Expression, parts: PathParts): t.Expression {
  if (parts.length === 0) return base
  return parts.reduce<t.Expression>((acc, prop) => {
    const isIndex = /^\d+$/.test(prop)
    return t.optionalMemberExpression(acc, isIndex ? t.numericLiteral(Number(prop)) : id(prop), isIndex, true)
  }, base)
}

// ─── Observe key/method names ───────────────────────────────────────

function sanitizeObserveName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_$]/g, '_')
}

export function normalizePathParts(path: string | PathParts): PathParts {
  return Array.isArray(path) ? path : path ? path.split('.') : []
}

export function pathPartsToString(parts: string | PathParts): string {
  return normalizePathParts(parts).join('.')
}

export function buildObserveKey(parts: string | PathParts, storeVar?: string): string {
  return JSON.stringify({
    storeVar: storeVar || null,
    parts: normalizePathParts(parts),
  })
}

export function parseObserveKey(key: string): { parts: PathParts; storeVar?: string } {
  const parsed = JSON.parse(key) as {
    storeVar: string | null
    parts: PathParts
  }
  return {
    parts: parsed.parts,
    ...(parsed.storeVar ? { storeVar: parsed.storeVar } : {}),
  }
}

export function getObserveMethodName(parts: string | PathParts, storeVar?: string): string {
  const owner = sanitizeObserveName(storeVar || 'local')
  const normalized = normalizePathParts(parts)
  const observePath = sanitizeObserveName(normalized.length > 0 ? normalized.join('__') : 'root')
  return `__observe_${owner}_${observePath}`
}

// ─── Path resolution ────────────────────────────────────────────────

export function resolvePath(
  expr: t.MemberExpression | t.Identifier | t.ThisExpression | t.CallExpression,
  stateRefs: Map<string, StateRefMeta>,
  context: { inMap?: boolean; mapItemVar?: string } = {},
): {
  parts: PathParts | null
  isImportedState?: boolean
  storeVar?: string
} | null {
  if (t.isIdentifier(expr)) {
    if (context.inMap && context.mapItemVar === expr.name) {
      return { parts: null }
    }
    if (stateRefs.has(expr.name)) {
      const ref = stateRefs.get(expr.name)!
      if (ref.kind === 'derived') return { parts: null }
      if (ref.kind === 'local-destructured' && ref.propName) {
        return { parts: [ref.propName] }
      }
      if (ref.kind === 'store-alias' && ref.storeVar && ref.propName) {
        return {
          parts: [ref.propName],
          isImportedState: true,
          storeVar: ref.storeVar,
        }
      }
      if (ref.kind === 'imported-destructured' && ref.storeVar && ref.propName) {
        return {
          parts: [ref.propName],
          isImportedState: true,
          storeVar: ref.storeVar,
        }
      }
      return {
        parts: [],
        isImportedState: ref.kind === 'imported',
        storeVar: ref.kind === 'imported' ? expr.name : undefined,
      }
    }
    return { parts: null }
  }

  if (t.isThisExpression(expr)) return { parts: [] }

  if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee)) {
    return resolvePath(expr.callee.object as t.MemberExpression | t.Identifier | t.ThisExpression, stateRefs, context)
  }

  if (t.isMemberExpression(expr)) {
    const objectResult = resolvePath(
      expr.object as t.MemberExpression | t.Identifier | t.ThisExpression,
      stateRefs,
      context,
    )
    if (!objectResult || !objectResult.parts) {
      if (context.inMap && t.isIdentifier(expr.object) && expr.object.name === context.mapItemVar) {
        if (t.isIdentifier(expr.property)) {
          return { parts: [expr.property.name] }
        }
      }
      return { parts: null }
    }

    if (
      objectResult.isImportedState &&
      objectResult.storeVar &&
      objectResult.parts.length === 0 &&
      t.isIdentifier(expr.property)
    ) {
      const ref = stateRefs.get(objectResult.storeVar)
      const propName = expr.property.name
      if (ref?.reactiveFields) {
        if (ref.reactiveFields.has(propName) || ref.getterDeps?.has(propName)) {
          return {
            parts: [propName],
            isImportedState: true,
            storeVar: objectResult.storeVar,
          }
        }
        return null
      }
      return {
        parts: [propName],
        isImportedState: true,
        storeVar: objectResult.storeVar,
      }
    }

    if (t.isIdentifier(expr.property)) {
      return {
        parts: [...objectResult.parts, expr.property.name],
        isImportedState: objectResult.isImportedState,
        storeVar: objectResult.storeVar,
      }
    } else if (t.isNumericLiteral(expr.property)) {
      return {
        parts: [...objectResult.parts, String(expr.property.value)],
        isImportedState: objectResult.isImportedState,
        storeVar: objectResult.storeVar,
      }
    }
  }

  return { parts: null }
}
