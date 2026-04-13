import type { Disposer } from './disposer'
import { bind } from './bind'
import { patch } from './patch'

export const reactiveAttr = (
  el: Element,
  d: Disposer,
  root: any,
  attrName: string,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let prev: unknown = undefined
  bind(d, root, pathOrGetter, (v) => {
    prev = patch(el, 'attr', prev, v, attrName)
  })
}
