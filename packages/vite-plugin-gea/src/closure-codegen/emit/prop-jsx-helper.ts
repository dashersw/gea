import { parse } from '@babel/parser'
import type { Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

/**
 * Name of the helper behind prop thunks with JSX in them. Emitters add it to
 * `importsNeeded`, and `ensureCoreImports` emits the helper into the module
 * instead of importing it, so compiled code doesn't depend on the runtime
 * build it runs against.
 */
export const PROP_JSX_HELPER = '__geaPropJsx'

/**
 * `__geaPropJsx(d, sites, perRead)` keeps the JSX one prop thunk builds whose
 * only way out is the thunk's value.
 *
 * - `site(i, build)` builds JSX site `i` with its own disposer the first time a
 *   read selects it and returns that Node while it stays selected. A read
 *   that doesn't select a built site disposes it, so it builds again when
 *   selected again, as an in-template conditional does. The site's root is
 *   an element, so disposing it before the reader swaps it out is safe.
 * - `item(build)` builds JSX that a function the read runs returns
 *   (`xs.map((x) => <Row />)`) on the running read's disposer, or on `d` when
 *   no read is running.
 * - `read(fn)` runs one read. With `perRead`, each read gets a disposer for
 *   its items. The nodes the read returns that its items built are tagged
 *   with a `{ d, nodes }` record, and the slot that shows them disposes it
 *   once it has dropped all of them (see `reactiveText`). A read none of whose
 *   nodes is attached by the next read, like the child's first read when it
 *   installs its props, is disposed then. Items a read builds but doesn't
 *   return as nodes, as in `[[<Row />]]`, can't be tracked and stay until `d`
 *   is disposed. A read that throws disposes what it built.
 */
const PROP_JSX_HELPER_SOURCE = `function ${PROP_JSX_HELPER}(d, sites, perRead) {
  const owner = Symbol.for('gea.jsx.owner')
  const built = []
  const picked = []
  const scopes = []
  for (let i = 0; i < sites; i++) scopes.push(d.child())
  let reads = 0
  let shown = []
  let running = null
  if (perRead) {
    d.add(() => {
      for (const s of shown) s.d.dispose()
      shown = []
    })
  }
  return {
    site(i, build) {
      picked[i] = reads
      return built[i] ?? (built[i] = build(scopes[i]))
    },
    item(build) {
      if (!running) return build(d)
      const n = build(running.d)
      running.items.add(n)
      return n
    },
    read(fn) {
      const id = ++reads
      const run = perRead ? { d: createDisposer(), items: new Set() } : null
      const outer = running
      running = run
      let v
      try {
        v = fn()
      } catch (e) {
        if (run) run.d.dispose()
        throw e
      } finally {
        running = outer
      }
      for (let i = 0; i < sites; i++) {
        if (built[i] !== undefined && picked[i] !== id) {
          built[i] = undefined
          scopes[i].dispose()
        }
      }
      if (run) {
        shown = shown.filter(
          (s) => s.nodes.length === 0 || s.nodes.some((n) => n[owner] === s && n.parentNode) || (s.d.dispose(), false),
        )
        if (run.items.size > 0) {
          const rec = { d: run.d, nodes: (Array.isArray(v) ? v : [v]).filter((n) => run.items.has(n)) }
          for (const n of rec.nodes) n[owner] = rec
          shown.push(rec)
        }
      }
      return v
    },
  }
}`

export function propJsxHelperDecl(): Statement {
  return parse(PROP_JSX_HELPER_SOURCE, { sourceType: 'module' }).program.body[0]
}

export function isPropJsxHelperDecl(stmt: Statement): boolean {
  return t.isFunctionDeclaration(stmt) && !!stmt.id && stmt.id.name === PROP_JSX_HELPER
}
