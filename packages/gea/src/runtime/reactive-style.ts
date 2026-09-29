import type { Disposer } from './disposer'
import { bind } from './bind'
import { styleValue } from './style-value'

/** Property → [value, priority], in declaration order. */
type Decls = Map<string, [string, string]>

function kebab(k: string): string {
  return k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}

function addDecl(out: Decls, decl: string): void {
  const colon = decl.indexOf(':')
  if (colon < 0) return
  let name = decl.slice(0, colon).trim()
  let value = decl.slice(colon + 1).trim()
  let priority = ''
  const important = /!\s*important$/i.exec(value)
  if (important) {
    value = value.slice(0, important.index).trim()
    priority = 'important'
  }
  if (!name || !value) return
  if (!name.startsWith('--')) name = name.toLowerCase()
  // A repeated property takes the last value and the last position, as in CSS.
  out.delete(name)
  out.set(name, [value, priority])
}

/** Parse a declaration list like `"color: red; margin: 0 !important"`. A `;`
 * inside quotes or brackets (`url(data:…;base64,…)`) does not end a declaration. */
function parseStyleText(text: string): Decls {
  const out: Decls = new Map()
  text = text.replace(/\/\*[\s\S]*?\*\//g, '')
  let quote = ''
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') i++
    else if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1)
    else if (c === ';' && depth === 0) {
      addDecl(out, text.slice(start, i))
      start = i + 1
    }
  }
  addDecl(out, text.slice(start))
  return out
}

function objectDecls(v: unknown): Decls {
  const out: Decls = new Map()
  if (v && typeof v === 'object') {
    for (const k in v as Record<string, unknown>) {
      const val = (v as Record<string, unknown>)[k]
      if (val != null && val !== false) {
        const prop = kebab(k)
        out.set(prop, [styleValue(prop, val), ''])
      }
    }
  }
  return out
}

/** Write `next` over `prev`, touching only the properties the binding declares,
 * so inline styles set by others (`visible`'s `display: none`, a handler's
 * `el.style.transform`) survive. A declaration that keeps its value and its
 * order is left alone unless this update overwrote it, e.g. a changed `padding`
 * before an unchanged `padding-left`. */
function applyDecls(style: CSSStyleDeclaration, prev: Decls, next: Decls): void {
  const order = [...prev.keys()]
  const kept = new Map<string, string>()
  let last = -1
  for (const [name, [value, priority]] of next) {
    const old = prev.get(name)
    const at = order.indexOf(name)
    if (old && old[0] === value && old[1] === priority && at > last) {
      kept.set(name, style.getPropertyValue(name))
      last = at
    }
  }
  for (const name of order) if (!next.has(name)) style.removeProperty(name)
  for (const [name, [value, priority]] of next) {
    const before = kept.get(name)
    if (before === undefined || style.getPropertyValue(name) !== before) style.setProperty(name, value, priority)
  }
}

export function reactiveStyle(
  el: Element,
  d: Disposer,
  root: object,
  pathOrGetter: readonly string[] | (() => unknown),
): void {
  let prev: Decls = new Map()
  // Last string value, or null when the value was not a string.
  let prevText: string | null = null
  const style = (el as HTMLElement).style
  bind(d, root, pathOrGetter, (v) => {
    // A string is a declaration list, diffed per property like an object.
    const text = typeof v === 'string' ? v : null
    if (text !== null && text === prevText) return
    prevText = text
    const next = text !== null ? parseStyleText(text) : objectDecls(v)
    applyDecls(style, prev, next)
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
