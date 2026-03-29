import * as t from '@babel/types'
import { id, js, jsExpr } from 'eszter'
import { ensureImport } from './utils.ts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const hot = () => t.memberExpression(t.metaProperty(t.identifier('import'), t.identifier('meta')), t.identifier('hot'))
const importMeta = () => t.metaProperty(t.identifier('import'), t.identifier('meta'))
const isRelative = (p: string) => p.startsWith('./') || p.startsWith('../')
const normalize = (p: string) => p
const invalidateCb = () => jsExpr`() => ${hot()}.invalidate()`
/** Fallback when the plugin does not pass `shouldProxyDep` (e.g. unit tests). */
const legacyShouldProxyDep = (p: string) =>
  /\.(js|ts)$/.test(p) && !p.match(/(store|state|actions|utils|helpers?|config|constants?)/i)

export function injectHMR(
  ast: t.File,
  componentClassName: string | null,
  componentImports: string[],
  componentImportsUsedAsTags: Set<string>,
  isDefaultExport: boolean,
  hmrImportSource = 'virtual:gea-hmr',
  /**
   * When set by the Vite plugin: resolve each relative import to disk and use
   * `extends Store` vs `extends Component` (see `isStoreModule` / `isComponentModule`
   * in `index.ts`) instead of filename heuristics.
   */
  shouldProxyDep?: (importSource: string) => boolean,
): boolean {
  if (
    ast.program.body.some((n) => {
      const src = generate(n)
      return typeof src === 'string' && src.includes('gea-auto-register plugin')
    })
  )
    return false

  const hmrStmts: t.Statement[] = []

  if (componentClassName) {
    ensureImport(ast, hmrImportSource, 'handleComponentUpdate')
    ensureImport(ast, hmrImportSource, 'registerHotModule')
    ensureImport(ast, hmrImportSource, 'registerComponentInstance')
    ensureImport(ast, hmrImportSource, 'unregisterComponentInstance')

    const proxyDep = shouldProxyDep ?? legacyShouldProxyDep
    const proxiedComponentDeps = rewriteComponentDeps(ast, componentImports, proxyDep)
    if (proxiedComponentDeps.length > 0) {
      ensureImport(ast, hmrImportSource, 'createHotComponentProxy')
    }

    const modExports = isDefaultExport
      ? t.objectExpression([t.objectProperty(t.identifier('default'), t.identifier(componentClassName))])
      : t.objectExpression([
          t.objectProperty(t.identifier(componentClassName), t.identifier(componentClassName), false, true),
        ])

    hmrStmts.push(js`const __moduleExports = ${modExports};`)
    hmrStmts.push(js`registerHotModule(${jsExpr`${importMeta()}.url`}, __moduleExports);`)
    hmrStmts.push(js`
      ${hot()}.accept((newModule) => {
        const __updatedModule = newModule || __moduleExports;
        registerHotModule(${jsExpr`${importMeta()}.url`}, __updatedModule);
        handleComponentUpdate(${jsExpr`${importMeta()}.url`}, __updatedModule);
      });
    `)
    hmrStmts.push(...createAccepts(componentImports, proxyDep))

    hmrStmts.push(js`const __origCreated = ${id(componentClassName)}.prototype.created;`)
    hmrStmts.push(
      js`${id(componentClassName)}.prototype.created = function(__geaProps) {
        registerComponentInstance(this.constructor.name, this);
        return __origCreated.call(this, __geaProps);
      };`,
    )
    hmrStmts.push(js`const __origDispose = ${id(componentClassName)}.prototype.dispose;`)
    hmrStmts.push(
      js`${id(componentClassName)}.prototype.dispose = function() {
        unregisterComponentInstance(this.constructor.name, this);
        return __origDispose.call(this);
      };`,
    )
  }

  if (hmrStmts.length === 0) return false
  ast.program.body.push(t.ifStatement(hot(), t.blockStatement(hmrStmts)))
  return true
}

type MutableDep = { source: string; localName: string }

function rewriteComponentDeps(
  ast: t.File,
  imports: string[],
  proxyDep: (importSource: string) => boolean,
): MutableDep[] {
  const deps: MutableDep[] = []
  for (const p of imports) {
    const np = normalize(p)
    if (!proxyDep(np)) continue

    for (const node of ast.program.body) {
      if (!t.isImportDeclaration(node)) continue
      if (node.source.value !== p && node.source.value !== np) continue

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
            ${jsExpr`new URL(${np}, ${importMeta()}.url).href`},
            ${id(hmrName)}
          );
        ` as t.VariableDeclaration,
      )

      deps.push({ source: np, localName })
      break
    }
  }
  return deps
}

function createAccepts(imports: string[], proxyDep: (importSource: string) => boolean): t.Statement[] {
  const stmts: t.Statement[] = []

  for (const p of imports) {
    if (!isRelative(p)) continue
    const np = normalize(p)
    if (!proxyDep(np)) {
      stmts.push(js`${hot()}.accept(${np}, ${invalidateCb()});`)
    }
  }
  return stmts
}

function generate(node: t.Node): string {
  try {
    const gen = require('@babel/generator').default
    return gen(node).code
  } catch (err) {
    console.warn('[gea] Failed to generate code from AST node:', err instanceof Error ? err.message : err)
    return ''
  }
}
