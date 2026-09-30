import type { Disposer } from './disposer'
import { bind } from './bind'
import { patch } from './patch'

// A prop thunk tags the nodes a nested function built for one read
// (`.map((r) => <Row />)` in `children`) with a record of that read's
// disposer and nodes. A slot that drops one of them, or is torn down,
// disposes the record once none of its nodes is still shown, so nodes that
// this or another slot still shows keep their bindings.
const JSX_OWNER = Symbol.for('gea.jsx.owner')

type JsxOwner = { d: Disposer; nodes: Node[] }

// The slot that last showed each tagged node, or null once that slot is torn
// down: its nodes can still sit in its detached DOM, but they aren't shown.
const shownBy = new WeakMap<Node, object | null>()

function release(n: Node): void {
  const owner = (n as any)[JSX_OWNER] as JsxOwner | undefined
  if (!owner) return
  const owns = (m: Node): boolean => (m as any)[JSX_OWNER] === owner
  if (owner.nodes.some((m) => owns(m) && m.parentNode && shownBy.get(m) !== null)) return
  for (const m of owner.nodes) if (owns(m)) (m as any)[JSX_OWNER] = undefined
  owner.d.dispose()
}

export function reactiveTextValue(
  node: Text | Element,
  d: Disposer,
  root: object,
  pathOrGetter: readonly string[] | (() => unknown),
): void {
  let prev: unknown = undefined
  bind(d, root, pathOrGetter, (v) => {
    prev = patch(node, 'text', prev, v)
  })
}

export function reactiveText(
  node: Text | Element,
  d: Disposer,
  root: object,
  pathOrGetter: readonly string[] | (() => unknown),
): void {
  let prev: unknown = undefined
  let live: Node = node
  // For array children (`.map(...)` returning DOM nodes), remember the live
  // set so we can replace on subsequent renders.
  let liveChildren: Node[] | null = null
  let slot: object | null = null
  const adopt = (n: Node): void => {
    if (!(n as any)[JSX_OWNER]) return
    if (!slot) {
      const self = {}
      slot = self
      d.add(() => {
        // Nodes another slot has shown since stay shown by it.
        const mine = liveChildren ? [...liveChildren, live] : [live]
        for (const c of mine) if (shownBy.get(c) === self) shownBy.set(c, null)
        for (const c of mine) release(c)
      })
    }
    shownBy.set(n, slot)
  }
  bind(d, root, pathOrGetter, (v) => {
    // Array of Nodes (e.g. from `.map(item => <Node/>)`) → wrap in a fragment.
    if (Array.isArray(v)) {
      const frag = document.createDocumentFragment()
      const nodes: Node[] = []
      for (const item of v) {
        if (item == null) continue
        if (typeof (item as Node).nodeType === 'number') {
          frag.appendChild(item as Node)
          nodes.push(item as Node)
          adopt(item as Node)
        } else {
          const tn = document.createTextNode(String(item))
          frag.appendChild(tn)
          nodes.push(tn)
        }
      }
      // Tear down previous array, keeping the nodes the new one shows again.
      if (liveChildren) {
        for (const n of liveChildren) {
          if (n.parentNode === frag) continue
          if (n.parentNode) n.parentNode.removeChild(n)
          release(n)
        }
        liveChildren = null
      }
      const parent = live.parentNode
      if (parent) parent.insertBefore(frag, live)
      liveChildren = nodes
      return
    }
    // Show a node before releasing what it replaces: they can share a record
    // that nothing else shows, e.g. when its last slot was torn down.
    const shows = v && typeof (v as Node).nodeType === 'number' ? (v as Node) : null
    if (shows && shows !== live) {
      adopt(shows)
      const p = live.parentNode
      if (p) p.replaceChild(shows, live)
    }
    // Scalar value arriving after an array — clear the array, keeping a node
    // that is shown next.
    if (liveChildren) {
      for (const n of liveChildren) {
        if (n === shows) continue
        if (n.parentNode) n.parentNode.removeChild(n)
        release(n)
      }
      liveChildren = null
    }
    if (shows) {
      if (shows === live) return
      release(live)
      live = shows
      prev = v
      return
    }
    if (live.nodeType !== 3 && live.nodeType !== 8 && live !== node) {
      const text = document.createTextNode('')
      if (live.parentNode) live.parentNode.replaceChild(text, live)
      release(live)
      live = text
      prev = undefined
    }
    prev = patch(live, 'text', prev, v)
  })
}
