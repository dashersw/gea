import type { Disposer } from './disposer'

const _NON_BUBBLING: Record<string, true> = {
  blur: true,
  focus: true,
  mouseenter: true,
  mouseleave: true,
  scroll: true,
}

type Handler = (e: Event) => void
type HandlerPair = [Element, Handler]

export function delegateEventFast(root: Element, type: string, pairs: HandlerPair[], _disposer: Disposer): void {
  const rt: any = typeof document !== 'undefined' ? document : root.ownerDocument
  const k = '__onf_' + type
  const flag = '__df_' + type
  if (!rt[flag]) {
    rt[flag] = 1
    rt.addEventListener(
      type,
      (e: Event) => {
        for (let n: Node | null = e.target as Node | null; n && n !== rt; n = n.parentNode) {
          const h = (n as any)[k] as Handler | undefined
          if (h !== undefined) {
            h(e)
            return
          }
        }
      },
      _NON_BUBBLING[type] === true,
    )
  }
  for (let i = 0; i < pairs.length; i++) {
    const el = pairs[i][0]
    if (el) (el as any)[k] = pairs[i][1]
  }
}
