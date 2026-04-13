import type { Disposer } from './disposer'
import { bind } from './bind'
import { patch } from './patch'

export const reactiveTextValue = (
  node: Text | Element,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let prev: unknown = undefined
  bind(d, root, pathOrGetter, (v) => {
    prev = patch(node, 'text', prev, v)
  })
}

export const reactiveText = (
  node: Text | Element,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let prev: unknown = undefined
  let live: Node = node
  // For array children (`.map(...)` returning DOM nodes), remember the live
  // set so we can replace on subsequent renders.
  let liveChildren: Node[] | null = null
  bind(d, root, pathOrGetter, (v) => {
    // Array of Nodes (e.g. from `.map(item => <Node/>)`) → wrap in a fragment.
    if (Array.isArray(v)) {
      const frag = document.createDocumentFragment()
      const nodes: Node[] = []
      for (const item of v) {
        if (item == null) continue
        if (typeof (item as any).nodeType === 'number') {
          frag.appendChild(item as Node)
          nodes.push(item as Node)
        } else {
          const tn = document.createTextNode(String(item))
          frag.appendChild(tn)
          nodes.push(tn)
        }
      }
      // Tear down previous array.
      if (liveChildren) {
        for (const n of liveChildren) if (n.parentNode) n.parentNode.removeChild(n)
        liveChildren = null
      }
      const parent = live.parentNode
      if (parent) parent.insertBefore(frag, live)
      liveChildren = nodes
      return
    }
    // Scalar value arriving after an array — clear the array first.
    if (liveChildren) {
      for (const n of liveChildren) if (n.parentNode) n.parentNode.removeChild(n)
      liveChildren = null
    }
    if (v && typeof (v as any).nodeType === 'number') {
      if (v === live) return
      const p = live.parentNode
      if (p) p.replaceChild(v as Node, live)
      live = v as Node
      prev = v
      return
    }
    if (live.nodeType !== 3 && live.nodeType !== 8 && live !== node) {
      const text = document.createTextNode('')
      if (live.parentNode) live.parentNode.replaceChild(text, live)
      live = text
      prev = undefined
    }
    prev = patch(live, 'text', prev, v)
  })
}
