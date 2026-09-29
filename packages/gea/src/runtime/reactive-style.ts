import type { Disposer } from './disposer'
import { bind } from './bind'
import { styleValue } from './style-value'

function kebab(k: string): string {
  return k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}

export function reactiveStyle(
  el: Element,
  d: Disposer,
  root: object,
  pathOrGetter: readonly string[] | (() => unknown),
): void {
  let prev: Record<string, string> = {}
  // Last string applied via cssText, or null when the value was not a string.
  let prevText: string | null = null
  const style = (el as HTMLElement).style
  bind(d, root, pathOrGetter, (v) => {
    // A string is a full declaration list, applied like a static `style="…"`.
    if (typeof v === 'string') {
      if (v !== prevText) style.cssText = v
      prevText = v
      prev = {}
      return
    }
    if (prevText !== null) {
      style.cssText = ''
      prevText = null
    }
    const next: Record<string, string> = {}
    if (v && typeof v === 'object') {
      for (const k in v as Record<string, unknown>) {
        const val = (v as Record<string, unknown>)[k]
        if (val != null && val !== false) {
          const prop = kebab(k)
          next[prop] = styleValue(prop, val)
        }
      }
    }
    for (const k in prev) if (!(k in next)) style.removeProperty(k)
    for (const k in next) if (next[k] !== prev[k]) style.setProperty(k, next[k])
    prev = next
  })
}

// Typed single-property style binding. Used by the compiler for static-key style
// objects (e.g. a moving sprite's `{ left, top, backgroundColor }`): each property
// binds on its own channel with a compile-time-kebabed name, so there is no boxed
// `next`/`prev` record allocation, no runtime kebab-casing, and tracking is
// per-property (only the property that actually changed re-applies). The generic
// `reactiveStyle` above stays for dynamic/spread style objects.
export function reactiveStyleProp(
  el: Element,
  d: Disposer,
  root: object,
  prop: string,
  pathOrGetter: readonly string[] | (() => unknown),
): void {
  const style = (el as HTMLElement).style
  let prev: string | undefined
  bind(d, root, pathOrGetter, (v) => {
    if (v == null || v === false) {
      if (prev !== undefined) {
        style.removeProperty(prop)
        prev = undefined
      }
      return
    }
    const next = styleValue(prop, v)
    if (next !== prev) {
      style.setProperty(prop, next)
      prev = next
    }
  })
}
