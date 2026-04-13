import type { Disposer } from './disposer'
import { withTracking, untrack } from './with-tracking'

type BranchFactory = (d: Disposer) => Node

export function conditionalTruthy(
  parent: Node,
  anchor: Comment,
  disposer: Disposer,
  root: any,
  cond: () => boolean,
  mkTrue: BranchFactory,
): void {
  let currentNodes: Node[] | null = null
  let currentChild: Disposer | null = null
  let active = false

  const sentinel = document.createComment('')
  const p0 = anchor.parentNode ?? parent
  p0.insertBefore(sentinel, anchor)
  p0.removeChild(anchor)

  function clear(): void {
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

  function mount(): void {
    const childD = disposer.child()
    const node = untrack(() => mkTrue(childD))
    currentNodes = node.nodeType === 11 ? Array.from(node.childNodes) : [node]
    const p = sentinel.parentNode ?? parent
    p.insertBefore(node, sentinel)
    currentChild = childD
  }

  withTracking(disposer, root, () => {
    const next = !!cond()
    if (next === active) return
    clear()
    active = next
    if (next) mount()
  })

  disposer.add(() => {
    clear()
    if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel)
    active = false
  })
}
