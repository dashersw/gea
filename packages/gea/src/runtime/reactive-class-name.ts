import type { Disposer } from './disposer'
import { bind } from './bind'

export const reactiveClassName = (
  el: Element,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let prev: string | undefined
  bind(d, root, pathOrGetter, (v) => {
    const next = v == null || v === false ? '' : String(v)
    if (next === prev) return
    el.setAttribute('class', next)
    prev = next
  })
}
