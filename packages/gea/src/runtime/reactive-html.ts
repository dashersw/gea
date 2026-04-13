/**
 * reactiveHtml — sets `el.innerHTML` reactively from a store path or getter.
 * Mirror of `reactiveAttr` but targets `.innerHTML` instead of an attribute.
 * Used by the closure-codegen compiler when a JSX attribute is
 * `dangerouslySetInnerHTML={expr}` — renders rich-text / markup content
 * provided by the app into the element without per-character text-node
 * reconciliation.
 *
 * Writes `''` when the bound value is nullish, matching the gea convention
 * for text-like bindings.
 */

import type { Disposer } from './disposer'
import { bind } from './bind'

export const reactiveHtml = (
  el: Element,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let prev: unknown = undefined
  bind(d, root, pathOrGetter, (v) => {
    if (v === prev) return
    const s = v == null ? '' : String(v)
    if ((el as any).innerHTML !== s) (el as any).innerHTML = s
    prev = v
  })
}
