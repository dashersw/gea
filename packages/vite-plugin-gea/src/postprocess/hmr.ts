import { t } from '../utils/babel-interop.ts'
import { id, js, jsExpr } from 'eszter'
import { ensureImport } from '../utils/imports.ts'

const hot = () => t.memberExpression(t.metaProperty(t.identifier('import'), t.identifier('meta')), t.identifier('hot'))

const importMeta = () => t.metaProperty(t.identifier('import'), t.identifier('meta'))

const isRelative = (p: string) => p.startsWith('./') || p.startsWith('../')

const invalidateCb = () => jsExpr`() => ${hot()}.invalidate()`

/** Fallback heuristic when the plugin does not supply `shouldProxyDep`. */
const defaultShouldProxyDep = (p: string) =>
  /\.(js|ts)$/.test(p) && !p.match(/(store|state|actions|utils|helpers?|config|constants?)/i)

/**
 * Injects HMR support into a compiled Gea component module.
 *
 * Returns `true` when HMR code was added, `false` otherwise (no component
 * class, or the file contains a `gea-auto-register plugin` comment).
 */
export function injectHMR(
  ast: t.File,
  componentClassNames: string[],
  defaultExportClassName: string | null,
  componentImports: string[],
  componentImportsUsedAsTags: Set<string>,
  hmrImportSource = 'virtual:gea-hmr',
  shouldProxyDep?: (importSource: string) => boolean,
  shouldSkipDepAccept?: (importSource: string) => boolean,
): boolean {
  if (hasAutoRegisterComment(ast)) return false
  if (componentClassNames.length === 0) return false

  const hmrStmts: t.Statement[] = []

  ensureImport(ast, hmrImportSource, 'handleComponentUpdate')
  ensureImport(ast, hmrImportSource, 'registerHotModule')
  ensureImport(ast, hmrImportSource, 'registerComponentInstance')
  ensureImport(ast, hmrImportSource, 'unregisterComponentInstance')

  const proxyDep = shouldProxyDep ?? defaultShouldProxyDep
  const proxiedDeps = rewriteComponentDeps(ast, componentImports, proxyDep)
  if (proxiedDeps.length > 0) {
    ensureImport(ast, hmrImportSource, 'createHotComponentProxy')
  }

  // Build module exports object covering all component classes
  const exportProperties: t.ObjectProperty[] = []
  for (const cn of componentClassNames) {
    if (cn === defaultExportClassName) {
      exportProperties.push(t.objectProperty(t.identifier('default'), t.identifier(cn)))
    } else {
      exportProperties.push(t.objectProperty(t.identifier(cn), t.identifier(cn), false, true))
    }
  }

  hmrStmts.push(js`const __moduleExports = ${t.objectExpression(exportProperties)};`)
  hmrStmts.push(js`registerHotModule(${jsExpr`${importMeta()}.url`}, __moduleExports);`)

  // hot.accept() — call handleComponentUpdate for every component class
  const acceptBody: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__updatedModule'),
        t.logicalExpression('||', t.identifier('newModule'), t.identifier('__moduleExports')),
      ),
    ]),
    t.expressionStatement(
      t.callExpression(t.identifier('registerHotModule'), [
        t.memberExpression(importMeta(), t.identifier('url')),
        t.identifier('__updatedModule'),
      ]),
    ),
  ]
  for (const cn of componentClassNames) {
    const key = cn === defaultExportClassName ? 'default' : cn
    acceptBody.push(
      t.expressionStatement(
        t.callExpression(t.identifier('handleComponentUpdate'), [
          t.memberExpression(importMeta(), t.identifier('url')),
          t.objectExpression([
            t.objectProperty(
              t.identifier('default'),
              t.memberExpression(t.identifier('__updatedModule'), t.identifier(key)),
            ),
          ]),
        ]),
      ),
    )
  }
  hmrStmts.push(
    t.expressionStatement(
      t.callExpression(t.memberExpression(hot(), t.identifier('accept')), [
        t.arrowFunctionExpression([t.identifier('newModule')], t.blockStatement(acceptBody)),
      ]),
    ),
  )

  // hot.accept() for dependency imports (store/util invalidation)
  hmrStmts.push(...createAccepts(componentImports, proxyDep, shouldSkipDepAccept))

  // Patch created()/dispose() for every component class
  for (const cn of componentClassNames) {
    const suffix = componentClassNames.length > 1 ? `_${cn}` : ''
    hmrStmts.push(js`const ${id('__origCreated' + suffix)} = ${id(cn)}.prototype.created;`)
    hmrStmts.push(
      js`${id(cn)}.prototype.created = function(__geaProps) {
        registerComponentInstance(${cn}, this);
        return ${id('__origCreated' + suffix)}.call(this, __geaProps);
      };`,
    )
    hmrStmts.push(js`const ${id('__origDispose' + suffix)} = ${id(cn)}.prototype.dispose;`)
    hmrStmts.push(
      js`${id(cn)}.prototype.dispose = function() {
        unregisterComponentInstance(${cn}, this);
        return ${id('__origDispose' + suffix)}.call(this);
      };`,
    )
  }

  ast.program.body.push(t.ifStatement(hot(), t.blockStatement(hmrStmts)))
  return true
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MutableDep {
  source: string
  localName: string
}

/**
 * For each component dependency import whose default specifier passes
 * `proxyDep`, rename the original import and insert a
 * `createHotComponentProxy(...)` wrapper.
 */
function rewriteComponentDeps(
  ast: t.File,
  imports: string[],
  proxyDep: (importSource: string) => boolean,
): MutableDep[] {
  const deps: MutableDep[] = []

  for (const source of imports) {
    if (!proxyDep(source)) continue

    for (const node of ast.program.body) {
      if (!t.isImportDeclaration(node)) continue
      if (node.source.value !== source) continue

      const defaultSpec = node.specifiers.find((s) => t.isImportDefaultSpecifier(s))
      if (!defaultSpec) continue

      const localName = defaultSpec.local.name
      const hmrName = `__hmr_${localName}`
      defaultSpec.local.name = hmrName

      const idx = ast.program.body.indexOf(node)
      ast.program.body.splice(
        idx + 1,
        0,
        js`
          const ${id(localName)} = createHotComponentProxy(
            ${jsExpr`new URL(${source}, ${importMeta()}.url).href`},
            ${id(hmrName)}
          );
        ` as t.VariableDeclaration,
      )

      deps.push({ source, localName })
      break
    }
  }

  return deps
}

/**
 * For each relative dependency that is NOT a component proxy candidate,
 * add `hot.accept(dep, () => hot.invalidate())` so the page reloads when
 * stores/utils change.
 */
function createAccepts(
  imports: string[],
  proxyDep: (importSource: string) => boolean,
  shouldSkip?: (importSource: string) => boolean,
): t.Statement[] {
  const stmts: t.Statement[] = []
  for (const p of imports) {
    if (!isRelative(p)) continue
    if (shouldSkip?.(p)) continue
    if (!proxyDep(p)) {
      stmts.push(js`${hot()}.accept(${p}, ${invalidateCb()});`)
    }
  }
  return stmts
}

/**
 * Checks whether the AST contains a comment mentioning 'gea-auto-register plugin'.
 */
function hasAutoRegisterComment(ast: t.File): boolean {
  for (const node of ast.program.body) {
    const comments = node.leadingComments ?? []
    if (comments.some((c) => c.value.includes('gea-auto-register plugin'))) {
      return true
    }
  }
  return false
}
