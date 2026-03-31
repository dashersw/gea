import { t } from '../utils/babel-interop.ts'
import { id, js, jsExpr } from 'eszter'
import { ensureImport } from '../utils.ts'

const hot = () =>
  t.memberExpression(
    t.metaProperty(t.identifier('import'), t.identifier('meta')),
    t.identifier('hot'),
  )

const importMeta = () => t.metaProperty(t.identifier('import'), t.identifier('meta'))

const isRelative = (p: string) => p.startsWith('./') || p.startsWith('../')

const invalidateCb = () => jsExpr`() => ${hot()}.invalidate()`

/** Fallback heuristic when the plugin does not supply `shouldProxyDep`. */
const legacyShouldProxyDep = (p: string) =>
  /\.(js|ts)$/.test(p) && !p.match(/(store|state|actions|utils|helpers?|config|constants?)/i)

/**
 * Injects HMR support into a compiled Gea component module.
 *
 * Returns `true` when HMR code was added, `false` otherwise (no component
 * class, or the file contains a `gea-auto-register plugin` comment).
 */
export function injectHMR(
  ast: t.File,
  componentClassName: string | null,
  componentImports: string[],
  componentImportsUsedAsTags: Set<string>,
  isDefaultExport: boolean,
  hmrImportSource = 'virtual:gea-hmr',
  shouldProxyDep?: (importSource: string) => boolean,
): boolean {
  // Bail out if auto-register plugin comment is present
  if (hasAutoRegisterComment(ast)) return false

  const hmrStmts: t.Statement[] = []

  if (componentClassName) {
    ensureImport(ast, hmrImportSource, 'handleComponentUpdate')
    ensureImport(ast, hmrImportSource, 'registerHotModule')
    ensureImport(ast, hmrImportSource, 'registerComponentInstance')
    ensureImport(ast, hmrImportSource, 'unregisterComponentInstance')

    const proxyDep = shouldProxyDep ?? legacyShouldProxyDep
    const proxiedDeps = rewriteComponentDeps(ast, componentImports, proxyDep)
    if (proxiedDeps.length > 0) {
      ensureImport(ast, hmrImportSource, 'createHotComponentProxy')
    }

    // Build module exports object
    const modExports = isDefaultExport
      ? t.objectExpression([
          t.objectProperty(t.identifier('default'), t.identifier(componentClassName)),
        ])
      : t.objectExpression([
          t.objectProperty(
            t.identifier(componentClassName),
            t.identifier(componentClassName),
            false,
            true,
          ),
        ])

    hmrStmts.push(js`const __moduleExports = ${modExports};`)
    hmrStmts.push(
      js`registerHotModule(${jsExpr`${importMeta()}.url`}, __moduleExports);`,
    )

    // hot.accept() for self-updates
    hmrStmts.push(js`
      ${hot()}.accept((newModule) => {
        const __updatedModule = newModule || __moduleExports;
        registerHotModule(${jsExpr`${importMeta()}.url`}, __updatedModule);
        handleComponentUpdate(${jsExpr`${importMeta()}.url`}, __updatedModule);
      });
    `)

    // hot.accept() for dependency imports (store/util invalidation)
    hmrStmts.push(...createAccepts(componentImports, proxyDep))

    // Patch created() for instance registration
    hmrStmts.push(
      js`const __origCreated = ${id(componentClassName)}.prototype.created;`,
    )
    hmrStmts.push(
      js`${id(componentClassName)}.prototype.created = function(__geaProps) {
        registerComponentInstance(this.constructor.name, this);
        return __origCreated.call(this, __geaProps);
      };`,
    )

    // Patch dispose() for instance unregistration
    hmrStmts.push(
      js`const __origDispose = ${id(componentClassName)}.prototype.dispose;`,
    )
    hmrStmts.push(
      js`${id(componentClassName)}.prototype.dispose = function() {
        unregisterComponentInstance(this.constructor.name, this);
        return __origDispose.call(this);
      };`,
    )
  }

  if (hmrStmts.length === 0) return false

  // Wrap everything in `if (import.meta.hot) { ... }`
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
): t.Statement[] {
  const stmts: t.Statement[] = []
  for (const p of imports) {
    if (!isRelative(p)) continue
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
