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
export function reactiveClass(
  el: Element,
  d: Disposer,
  root: object,
  pathOrGetter: readonly string[] | (() => unknown),
): void {
  bind(d, root, pathOrGetter, classWriter(el))
}

/** The write step of `reactiveClass`: applies each value it is called with,
 * diffed against the previous one. Spread attributes reuse it per element. */
export function classWriter(el: Element): (v: unknown) => void {
  let prev: string | Set<string> | null = null
  return (v) => {
    // Single-token fast path: null/false/empty or whitespace-free string.
    // `text` carries the narrowed string in its own `string` slot so `indexOf`
    // has an exact string receiver; calling it on `v` — declared `unknown` —
    // leaves the intrinsic without one. Equivalent: every branch that reaches
    // `next` has `v` either nullish/false (→ '') or a string (→ `text`).
    const text = typeof v === 'string' ? (v as string) : ''
    if (v == null || v === false || v === '' || (typeof v === 'string' && text.indexOf(' ') === -1)) {
      const next = v == null || v === false ? '' : text
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
  }
}
