import type { Disposer } from './disposer'

type Handler = (e: Event) => void
type HandlerPair = [Element, Handler]

export function ensureClickDelegate(root: Element): void {
  const rt: any = typeof document !== 'undefined' ? document : root.ownerDocument
  if (!rt.__gdc) {
    rt.__gdc = 1
    rt.addEventListener('click', (e: Event) => {
      for (let n: Node | null = e.target as Node | null; n && n !== rt; n = n.parentNode) {
        const h = (n as any).__gc as Handler | undefined
        if (h !== undefined) {
          h(e)
          return
        }
      }
    })
  }
}

export function delegateClick(root: Element, pairs: HandlerPair[], _disposer?: Disposer): void {
  ensureClickDelegate(root)
  for (let i = 0; i < pairs.length; i++) {
    const el = pairs[i][0]
    if (el) (el as any).__gc = pairs[i][1]
  }
}
