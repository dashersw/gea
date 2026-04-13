import { GEA_CREATE_TEMPLATE } from '../../../gea/src/runtime/symbols'
import { GEA_STATIC_TEMPLATE } from '../../../gea/src/runtime/compiled-static-symbols'

export function countTemplateCreates(view: any): () => number {
  let count = 0
  const key = typeof view[GEA_CREATE_TEMPLATE] === 'function' ? GEA_CREATE_TEMPLATE : GEA_STATIC_TEMPLATE
  const orig = view[key].bind(view)
  view[key] = (d: any) => {
    count++
    return orig(d)
  }
  return () => count
}
