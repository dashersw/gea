/**
 * conditional(parent, anchor, disposer, root, cond, mkTrue, mkFalse?)
 *
 * Closure-compiled reactive conditional: mounts one of two branches into
 * `parent` immediately before `anchor`, and swaps when `cond()` changes.
 *
 * - Each branch gets its own child disposer scope (`disposer.child()`), so
 *   anything the branch sets up (subscriptions, nested conditionals, keyed
 *   lists, mounted components) tears down when the branch unmounts.
 * - Dep tracking on `cond` is done lexically via `withTracking(disposer, root, ...)`.
 *   `root` is the enclosing component's store proxy — proxy gets during `cond()`
 *   push paths into the active scope; on any notified path, the scope re-runs.
 * - `mkFalse` is optional; if omitted, the falsy branch renders a placeholder
 *   comment so the anchor position stays well-defined.
 * - DocumentFragment returns are handled: `insertBefore` moves a fragment's
 *   children into `parent`, so we capture `childNodes` BEFORE insertion to
 *   later remove the exact set of inserted nodes.
 */

import type { Disposer } from './disposer'
import { withTracking, untrack } from './with-tracking'

type BranchFactory = (d: Disposer) => Node

export function conditional(
  parent: Node,
  anchor: Comment,
  disposer: Disposer,
  root: any,
  cond: () => boolean,
  mkTrue: BranchFactory,
  mkFalse?: BranchFactory,
): void {
  let currentValue: boolean | null = null
  let currentNodes: Node[] | null = null
  let currentChild: Disposer | null = null

  // Install a persistent sentinel at the compiler anchor's position. The
  // original anchor is removed so downstream compiler walk indices (which
  // treat the conditional slot as a single node position) stay correct. The
  // sentinel stays in the DOM for the lifetime of this conditional and serves
  // as a stable insertion point for every swap.
  const sentinel = document.createComment('')
  const p0 = anchor.parentNode ?? parent
  p0.insertBefore(sentinel, anchor)
  p0.removeChild(anchor)

  const placeholder: BranchFactory = () => document.createComment('')
  const elseFactory = mkFalse ?? placeholder

  function unmount(): void {
    if (currentChild) {
      currentChild.dispose()
      currentChild = null
    }
    if (currentNodes) {
      for (let i = 0; i < currentNodes.length; i++) {
        const n = currentNodes[i]
        const p = n.parentNode
        if (p) p.removeChild(n)
      }
      currentNodes = null
    }
  }

  function mount(v: boolean): void {
    const childD = disposer.child()
    const factory = v ? mkTrue : elseFactory
    // Build the branch's DOM without leaking eager reads into the enclosing
    // withTracking scope. Fine-grained reactive primitives inside the branch
    // (reactiveText, reactiveAttr, keyedList, etc.) set up their own tracking
    // scopes via bind/withTracking — they don't need the outer scope.
    const node = untrack(() => factory(childD))
    // Capture child list BEFORE insertion — DocumentFragment children are
    // moved out of the fragment into `parent` on insertBefore. Use nodeType
    // (11 = DOCUMENT_FRAGMENT_NODE) so the check works regardless of whether
    // `DocumentFragment` is a global in the host environment.
    const isFragment = node.nodeType === 11
    const nodes: Node[] = isFragment ? Array.from(node.childNodes) : [node]
    const p = sentinel.parentNode ?? parent
    p.insertBefore(node, sentinel)
    currentChild = childD
    currentNodes = nodes
  }

  function swap(v: boolean): void {
    if (v === currentValue) return
    unmount()
    currentValue = v
    mount(v)
  }

  withTracking(disposer, root, () => {
    const v = !!cond()
    swap(v)
  })

  // Ensure final teardown when the parent scope disposes. `withTracking`
  // already registers its own teardown for subscriptions; we additionally
  // remove the live branch nodes + dispose the active branch scope.
  disposer.add(() => {
    unmount()
    if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel)
    currentValue = null
  })
}
