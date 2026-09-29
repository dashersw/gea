import { ensureDelegate } from './delegate-dispatch'
import type { Disposer } from './disposer'

type Handler = (e: Event) => void
type HandlerPair = [Element, Handler]

// Computed key, exactly as in `delegate-event-fast`. A literal `.__gc` expando
// makes geatsc collect an anonymous record whose field is callable, which it has
// no representation for ("Anonymous record expando __gc has no Representation
// for Handler"). Reading and writing through a computed key keeps the property
// dynamic, so no record shape is inferred for the host Element.
const _GC = '__' + 'gc'

// The per-node handler stash is a dynamic expando on host objects;
// `Record<string, ...>` through the computed key is the same sanctioned
// spelling `compiled-lean-store.ts` uses for its symbol stashes.
type HandlerStash = Record<string, Handler | undefined>

export function ensureClickDelegate(root: Element): void {
  ensureDelegate(root, 'click')
}

export function delegateClick(root: Element, pairs: HandlerPair[], disposer?: Disposer): void {
  ensureClickDelegate(root)
  for (let i = 0; i < pairs.length; i++) {
    const el = pairs[i][0]
    if (el) (el as unknown as HandlerStash)[_GC] = pairs[i][1]
  }
  // Disposer-contained storage: one registration per call (not per pair), so
  // the live-path cost stays a single push. The `noop` check runs here, not
  // inside `add`, so the noop fast path (keyed-list rows with no cleanup)
  // allocates nothing — not even the teardown closure. Clearing on dispose
  // bounds every stashed handler's lifetime to the owning component: the
  // handlers capture the component's `this`, and under refcounted ownership
  // an uncleared stash would keep the component alive through its own DOM
  // (component → element → handler → component).
  if (disposer && !disposer.noop) disposer.add(_clearHandlers(pairs))
}

function _clearHandlers(pairs: HandlerPair[]): () => void {
  return () => {
    for (let i = 0; i < pairs.length; i++) {
      const el = pairs[i][0]
      if (el) (el as unknown as HandlerStash)[_GC] = undefined
    }
  }
}
