import type { Disposer } from './disposer'
import { bind } from './bind'
import { patch } from './patch'

export const reactiveBoolAttr = (
  el: Element,
  d: Disposer,
  root: any,
  target: string,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let prev: unknown = undefined
  bind(d, root, pathOrGetter, (v) => {
    prev = patch(el, 'bool', prev, v, target)
  })
}

export const reactiveBool = (
  el: Element,
  d: Disposer,
  root: any,
  target: string,
  pathOrGetter: readonly string[] | (() => unknown),
  mode: 'attr' | 'visible' = 'attr',
): void => {
  if (mode === 'attr') {
    reactiveBoolAttr(el, d, root, target, pathOrGetter)
    return
  }
  let prev: unknown = undefined
  bind(d, root, pathOrGetter, (v) => {
    const b = !!v
    if (b === prev) return
    ;(el as HTMLElement).style.display = b ? '' : 'none'
    prev = b
  })
}
