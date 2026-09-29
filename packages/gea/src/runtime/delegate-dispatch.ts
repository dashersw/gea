/**
 * The single per-document listener behind every delegate helper.
 *
 * `delegateClick` (`__gc`), `delegateEvent` (`__on_*` / `__onct_*`) and
 * `delegateEventFast` (`__onf_*`) only differ in which expando slot they stash
 * a handler in. They all install through `ensureDelegate`, so each event type
 * gets exactly one `document` listener that reads every slot. Two listeners
 * for the same type would each run their own matches, and `stopPropagation()`
 * in one could never stop the other, since both sit on `document`.
 *
 * Bubbling types follow DOM order: walk from `e.target` towards the document,
 * run every handler found, and stop once a handler has called
 * `stopPropagation()`. Non-bubbling types only run the target's own handler,
 * just as a listener on that element would.
 *
 * Although the real DOM listener is on the document, `__onct_*` handlers see
 * element-local semantics: while one runs, `e.currentTarget` is the element
 * that owns it. The other slots hold handlers the compiler proved never read
 * `currentTarget`, so they skip that shadowing.
 */

type Handler = (e: Event) => void

// A Set keeps the membership test native under geatsc; a Record<string, true>
// computed access has no native plan and trips the boxed-equality guard.
const _NON_BUBBLING = new Set<string>(['blur', 'focus', 'mouseenter', 'mouseleave', 'scroll'])

// Every key is built at runtime, never written as a literal `.__gc` expando:
// geatsc would collect an anonymous record whose field is callable, which it
// has no representation for. See `delegate-click.ts`.
const _GC = '__' + 'gc'
const _INSTALLED = '__' + 'gd_'

// Per-node handler stash and per-document flag, read through computed keys.
type HandlerStash = Record<string, Handler | undefined>
type FlagStash = Record<string, number | undefined>

function dispatchWithCurrentTarget(handler: Handler, event: Event, currentTarget: Element): void {
  const previous = Object.getOwnPropertyDescriptor(event, 'currentTarget')
  Object.defineProperty(event, 'currentTarget', { configurable: true, value: currentTarget })
  try {
    handler(event)
  } finally {
    if (previous) Object.defineProperty(event, 'currentTarget', previous)
    else delete (event as any).currentTarget
  }
}

/** Run every handler `n` holds for this event type. Returns whether it held any. */
function runNode(n: Node, e: Event, gc: string, on: string, ct: string, fast: string): boolean {
  const stash = n as unknown as HandlerStash
  const hg = gc ? stash[gc] : undefined
  const h = stash[on]
  const hf = stash[fast]
  const hct = stash[ct]
  let count = 0
  if (hg !== undefined) count++
  if (h !== undefined) count++
  if (hf !== undefined) count++
  if (hct !== undefined) count++
  if (count === 0) return false
  if (count > 1) {
    runSeveral(n as Element, e, hg, h, hf, hct)
    return true
  }
  if (hg !== undefined) hg(e)
  else if (h !== undefined) h(e)
  else if (hf !== undefined) hf(e)
  else if (hct !== undefined) dispatchWithCurrentTarget(hct, e, n as Element)
  return true
}

/**
 * Several slots on one element (`<button click={a} onClick={this.b}>`) act
 * like several listeners on it: `stopImmediatePropagation()` in one skips the
 * rest, `stopPropagation()` doesn't. The DOM keeps the immediate-stop flag
 * private, so watch the call while this element's handlers run. Single-slot
 * elements, the common case, never pay for this.
 */
function runSeveral(
  el: Element,
  e: Event,
  hg: Handler | undefined,
  h: Handler | undefined,
  hf: Handler | undefined,
  hct: Handler | undefined,
): void {
  let stopped = false
  const own = Object.getOwnPropertyDescriptor(e, 'stopImmediatePropagation')
  const native = e.stopImmediatePropagation
  Object.defineProperty(e, 'stopImmediatePropagation', {
    configurable: true,
    writable: true,
    value: () => {
      stopped = true
      native.call(e)
    },
  })
  try {
    if (hg !== undefined) hg(e)
    if (h !== undefined && !stopped) h(e)
    if (hf !== undefined && !stopped) hf(e)
    if (hct !== undefined && !stopped) dispatchWithCurrentTarget(hct, e, el)
  } finally {
    if (own) Object.defineProperty(e, 'stopImmediatePropagation', own)
    else delete (e as any).stopImmediatePropagation
  }
}

export function ensureDelegate(root: Element, type: string): void {
  // Prefer the live global `document` — template clones' ownerDocument may
  // differ from the adopted document (jsdom installs fresh docs per test).
  const rt: Document = typeof document !== 'undefined' ? document : (root.ownerDocument as Document)
  const flag = _INSTALLED + type
  if ((rt as unknown as FlagStash)[flag]) return
  ;(rt as unknown as FlagStash)[flag] = 1
  const gc = type === 'click' ? _GC : ''
  const on = '__on_' + type
  const ct = '__onct_' + type
  const fast = '__onf_' + type
  if (_NON_BUBBLING.has(type)) {
    // Capture: the document never sees these in the bubble phase.
    rt.addEventListener(
      type,
      (e: Event) => {
        const n = e.target as Node | null
        if (n && n !== rt) runNode(n, e, gc, on, ct, fast)
      },
      true,
    )
    return
  }
  rt.addEventListener(type, (e: Event) => {
    // Snapshot the path before running anything, as the DOM does: a handler
    // that detaches its row must not hide the row's ancestors from the walk.
    const path: Node[] = []
    for (let n: Node | null = e.target as Node | null; n && n !== rt; n = n.parentNode) path.push(n)
    for (let i = 0; i < path.length; i++) {
      if (runNode(path[i], e, gc, on, ct, fast) && e.cancelBubble) return
    }
  })
}
