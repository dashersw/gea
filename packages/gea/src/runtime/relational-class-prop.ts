import type { Disposer } from './disposer'
import { GEA_OBSERVE_DIRECT } from './internal-symbols'

export function relationalClassProp(
  d: Disposer,
  root: any,
  prop: string,
  map: Record<string, Element> | ((key: any) => Element | undefined),
  cls: string,
  initial: unknown,
): void {
  const lookup: (k: any) => Element | undefined =
    typeof map === 'function' ? (map as any) : (k) => (map as Record<string, Element>)[k]
  let prev: any = initial
  const flip = (val: unknown): void => {
    if (val === prev) return
    const p = lookup(prev)
    if (p) (p as any).className = ''
    const n = lookup(val)
    if (n) (n as any).className = cls
    prev = val
  }
  const observeDirect = root?.[GEA_OBSERVE_DIRECT]
  if (typeof observeDirect === 'function') {
    d.add(observeDirect.call(root, prop, flip) as () => void)
  } else if (root && typeof root.observe === 'function') {
    d.add(root.observe(prop, (val: unknown) => flip(val)))
  }
}
