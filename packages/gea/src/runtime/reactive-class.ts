import type { Disposer } from './disposer'
import { bind } from './bind'

/**
 * Reactive class binding.
 *
 * Fast path: when the value is a single token (string without whitespace, or
 * null/false/empty), skip Set allocation. The JSX pattern
 * `class={cond ? 'danger' : ''}` dominates keyed-list rows; under the old
 * per-fire Set allocation it burned 1000 Sets per 04_select1k click. Now:
 * single-token → direct classList.add/remove with a string `prev`.
 *
 * Slow path (multi-token strings, arrays, objects) still uses Set-diff.
 */
export const reactiveClass = (
  el: Element,
  d: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
): void => {
  let prev: string | Set<string> | null = null
  bind(d, root, pathOrGetter, (v) => {
    // Single-token fast path: null/false/empty or whitespace-free string.
    if (v == null || v === false || v === '' || (typeof v === 'string' && v.indexOf(' ') === -1)) {
      const next = v == null || v === false ? '' : (v as string)
      if (typeof prev === 'string') {
        if (prev === next) return
        if (prev) el.classList.remove(prev)
        if (next) el.classList.add(next)
      } else {
        if (prev) for (const c of prev) el.classList.remove(c)
        if (next) el.classList.add(next)
      }
      if (!next && !el.hasAttribute('class')) el.setAttribute('class', '')
      prev = next
      return
    }
    // Slow path: multi-token string / array / object → Set diff.
    const next = new Set<string>()
    if (typeof v === 'string') {
      for (const t of v.split(/\s+/)) if (t) next.add(t)
    } else if (Array.isArray(v)) {
      for (const t of v) if (t) next.add(String(t))
    } else if (typeof v === 'object') {
      for (const k in v as Record<string, unknown>) {
        if ((v as Record<string, unknown>)[k]) next.add(k)
      }
    }
    if (typeof prev === 'string') {
      if (prev) el.classList.remove(prev)
    } else if (prev) {
      for (const c of prev) if (!next.has(c)) el.classList.remove(c)
    }
    if (typeof prev === 'string' || !prev) {
      for (const c of next) el.classList.add(c)
    } else {
      for (const c of next) if (!prev.has(c)) el.classList.add(c)
    }
    if (next.size === 0 && !el.hasAttribute('class')) el.setAttribute('class', '')
    prev = next
  })
}
