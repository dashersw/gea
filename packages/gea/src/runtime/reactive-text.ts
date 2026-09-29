import type { Disposer } from './disposer'
import { bind } from './bind'
import { patch } from './patch'

// A prop thunk tags the nodes a nested function built for one read
// (`.map((r) => <Row />)` in `children`) with a record of that read's
// disposer and nodes. A slot that drops one of them disposes the record once
// none of its nodes is attached any more, so siblings it still shows keep
// their bindings. A slot that is torn down disposes it right away.
const JSX_OWNER = Symbol.for('gea.jsx.owner')

type JsxOwner = { d: Disposer; nodes: Node[] }

function release(n: Node, force = false): void {
  const owner = (n as any)[JSX_OWNER] as JsxOwner | undefined
  if (!owner) return
  const owns = (m: Node): boolean => (m as any)[JSX_OWNER] === owner
  if (!force && owner.nodes.some((m) => owns(m) && m.parentNode)) return
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
  let releasesOnDispose = false
  const adopt = (n: Node): void => {
    if (releasesOnDispose || !(n as any)[JSX_OWNER]) return
    releasesOnDispose = true
    d.add(() => {
      if (liveChildren) for (const c of liveChildren) release(c, true)
      release(live, true)
    })
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
    // Scalar value arriving after an array — clear the array first, keeping
    // a node that is shown next.
    if (liveChildren) {
      for (const n of liveChildren) {
        if (n === v) continue
        if (n.parentNode) n.parentNode.removeChild(n)
        release(n)
      }
      liveChildren = null
    }
    if (v && typeof (v as Node).nodeType === 'number') {
      if (v === live) return
      const p = live.parentNode
      if (p) p.replaceChild(v as Node, live)
      release(live)
      live = v as Node
      adopt(live)
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
