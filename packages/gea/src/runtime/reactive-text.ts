import type { Disposer } from './disposer'
import { bind } from './bind'
import { patch } from './patch'

// A prop thunk tags the nodes a nested function built for one read
// (`.map((r) => <Row />)` in `children`) with the disposer that owns them.
// The slot showing them disposes it once it drops them or is torn down.
const JSX_OWNER = Symbol.for('gea.jsx.owner')

function release(n: Node): void {
  const owner = (n as any)[JSX_OWNER] as Disposer | undefined
  if (!owner) return
  ;(n as any)[JSX_OWNER] = undefined
  owner.dispose()
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
      if (liveChildren) for (const c of liveChildren) release(c)
      release(live)
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
    // Scalar value arriving after an array — clear the array first.
    if (liveChildren) {
      for (const n of liveChildren) {
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
