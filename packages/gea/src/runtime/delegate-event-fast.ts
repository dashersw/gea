import { ensureDelegate } from './delegate-dispatch'
import type { Disposer } from './disposer'

type Handler = (e: Event) => void
type HandlerPair = [Element, Handler]

export function delegateEventFast(root: Element, type: string, pairs: HandlerPair[], _disposer: Disposer): void {
  ensureDelegate(root, type)
  const k = '__onf_' + type
  for (let i = 0; i < pairs.length; i++) {
    const el = pairs[i][0]
    if (el) (el as any)[k] = pairs[i][1]
  }
}
