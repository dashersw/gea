import type { Disposer } from './disposer'
import { bind } from './bind'

const kebab = (k: string): string => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

export const reactiveStyle = (
  el: Element,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let prev: Record<string, string> = {}
  const style = (el as HTMLElement).style
  bind(d, root, pathOrGetter, (v) => {
    const next: Record<string, string> = {}
    if (v && typeof v === 'object') {
      for (const k in v as Record<string, unknown>) {
        const val = (v as Record<string, unknown>)[k]
        if (val != null && val !== false) next[kebab(k)] = String(val)
      }
    }
    for (const k in prev) if (!(k in next)) style.removeProperty(k)
    for (const k in next) if (next[k] !== prev[k]) style.setProperty(k, next[k])
    prev = next
  })
}
