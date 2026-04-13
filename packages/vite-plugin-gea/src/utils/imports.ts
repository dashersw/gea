import { id, jsImport } from 'eszter'
import { t } from './babel-interop.ts'

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
  }

  const declaration = program.body.find((node) => t.isImportDeclaration(node) && node.source.value === source) as
    | t.ImportDeclaration
    | undefined

  if (!declaration) {
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

  const exists = declaration.specifiers.some((s) =>
    isDefault
      ? t.isImportDefaultSpecifier(s)
      : t.isImportSpecifier(s) && t.isIdentifier(s.local) && s.local.name === specifier,
  )
  if (exists) return false

  declaration.specifiers.push(buildSpecifier())
  return true
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
  'GEA_COMPILED',
  'GEA_EVENTS_CACHE',
  'GEA_LIFECYCLE_CALLED',
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
    if (hasImportedLocal(ast, name)) continue
    ensureImport(ast, '@geajs/core', name)
  }
}

function hasImportedLocal(ast: t.File, name: string): boolean {
  return ast.program.body.some(
    (node) =>
      t.isImportDeclaration(node) && node.specifiers.some((s) => t.isIdentifier(s.local) && s.local.name === name),
  )
}

function collectReferencedSymbols(node: any, symbols: ReadonlySet<string>, out: Set<string>): void {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) collectReferencedSymbols(child, symbols, out)
    return
  }
  if (node.type === 'ImportDeclaration') return
  if (node.type === 'Identifier' && symbols.has(node.name)) out.add(node.name)

  for (const key of Object.keys(node)) {
    if (
      key === 'type' ||
      key === 'start' ||
      key === 'end' ||
      key === 'loc' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    )
      continue
    collectReferencedSymbols(node[key], symbols, out)
  }
}
