/**
 * reactiveSpread — the attributes of an element written with `{...obj}`.
 *
 * The compiler passes the element's sources in source order: each spread
 * argument, with the attributes written before the last spread grouped into
 * object literals. `<a class="x" {...rest} title="t">` binds
 * `() => [{ class: 'x' }, rest]` and skips `title`, which the element sets on
 * its own. A later key wins over an earlier one, as in JSX.
 *
 * Every run reads every key again: a rest object keeps its identity while its
 * values change, so the sources can't be compared as a whole. Only keys whose
 * value changed are written, and a key that is gone is removed.
 *
 * Keys are classified the way the compiler classifies attribute names:
 * - events (`onClick`, `click`) go in the `__onct_<type>` slot the document
 *   delegate reads, as `delegateEvent` does. Only functions are installed;
 *   an event key never becomes an attribute.
 * - `class`/`className`, `style`, `value` and `visible` write the way their
 *   own helpers do, boolean attributes toggle, and the rest are attributes.
 * - `children`, `key`, `ref` and `dangerouslySetInnerHTML` are not attributes
 *   and are skipped, as are keys that are not valid attribute names.
 *
 * The spread object, not the template, picks the attribute names, so every
 * value written as a plain attribute goes through `sanitizeAttr`, which
 * checks the value of a URL attribute.
 */

import type { Disposer } from './disposer'
import { bind } from './bind'
import { ensureDelegate } from './delegate-dispatch'
import { classWriter } from './reactive-class'
import { styleWriter } from './reactive-style'
import { valueWriter } from './reactive-value'
import { sanitizeAttr } from '../xss'

type Write = (v: unknown) => void

interface SpreadState {
  /** Name (see `spreadKeyName`) → value last applied. */
  values: Map<string, unknown>
  /** Stateful writers for `class`, `style` and `value`, created on first use. */
  writers: Map<string, Write>
}

// The compiler's EVENT_NAMES (vite-plugin-gea/src/utils/events.ts). A test
// keeps the two lists equal.
export const SPREAD_EVENT_NAMES: ReadonlySet<string> = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mouseover',
  'mouseout',
  'mousemove',
  'mouseenter',
  'mouseleave',
  'contextmenu',
  'keydown',
  'keyup',
  'keypress',
  'focus',
  'blur',
  'input',
  'change',
  'submit',
  'scroll',
  'touchstart',
  'touchmove',
  'touchend',
  'tap',
  'longTap',
  'swipeRight',
  'swipeUp',
  'swipeLeft',
  'swipeDown',
  'drag',
  'dragstart',
  'dragend',
  'dragover',
  'dragleave',
  'drop',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerenter',
  'pointerleave',
  'pointerover',
  'pointerout',
  'pointercancel',
  'resize',
  'reset',
  'wheel',
  'animationstart',
  'animationend',
  'animationiteration',
  'transitionstart',
  'transitionend',
  'transitionrun',
  'transitioncancel',
])

// The compiler's BOOL_ATTRS (generator-attrs.ts), kept equal by the same test.
export const SPREAD_BOOL_ATTRS: ReadonlySet<string> = new Set([
  'disabled',
  'checked',
  'readonly',
  'readOnly',
  'hidden',
  'required',
  'autofocus',
  'multiple',
  'selected',
  'open',
  'indeterminate',
  'contenteditable',
  'contentEditable',
])

const NOT_ATTRIBUTES = new Set(['children', 'key', 'ref', 'dangerouslySetInnerHTML'])

// A valid attribute name (the XML Name production, as React checks it).
// `setAttribute` throws on other names, and an HTML serializer would write
// them out unchanged.
const ATTRIBUTE_NAME_START =
  ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD'
// The combining marks come first in their class, where no character precedes
// them (`no-misleading-character-class`).
const ATTRIBUTE_NAME = new RegExp(
  '^[' + ATTRIBUTE_NAME_START + '][\\u0300-\\u036F' + ATTRIBUTE_NAME_START + '\\-.0-9\\u00B7\\u203F-\\u2040]*$',
)

/**
 * The name a spread key is applied under: `on:<event type>` for an event,
 * `class` and `for` for `className` and `htmlFor`, the key itself otherwise,
 * or null for a key that is not an attribute. The compiler names the
 * attributes it skips the same way.
 *
 * An `on*` key is an event in any letter case: `setAttribute` lowercases an
 * HTML attribute name, so `ONCLICK` must not reach it.
 */
export function spreadKeyName(key: string): string | null {
  if (NOT_ATTRIBUTES.has(key) || !ATTRIBUTE_NAME.test(key)) return null
  if (/^on./i.test(key)) return 'on:' + key.slice(2).toLowerCase()
  if (SPREAD_EVENT_NAMES.has(key)) return 'on:' + key
  if (key === 'className') return 'class'
  if (key === 'htmlFor') return 'for'
  return key
}

/** `skip` names (see `spreadKeyName`) the attributes written after the last
 * spread, which the element sets itself. */
export function reactiveSpread(
  el: Element,
  d: Disposer,
  root: object,
  skip: readonly string[] | null,
  pathOrGetter: readonly string[] | (() => unknown),
): void {
  const state: SpreadState = { values: new Map(), writers: new Map() }
  bind(d, root, pathOrGetter, (sources) => patchSpread(el, state, sources, skip))
}

/** `reactiveSpread` for sources that never change: apply them once. */
export function spreadAttrs(el: Element, skip: readonly string[] | null, sources: unknown): void {
  patchSpread(el, { values: new Map(), writers: new Map() }, sources, skip)
}

function patchSpread(el: Element, state: SpreadState, sources: unknown, skip: readonly string[] | null): void {
  const next = new Map<string, unknown>()
  if (Array.isArray(sources)) {
    for (let i = 0; i < sources.length; i++) collect(next, sources[i], skip)
  }
  const prev = state.values
  for (const name of prev.keys()) {
    if (!next.has(name)) clear(el, state, name)
  }
  for (const [name, v] of next) {
    // Objects (style and class objects) can change in place, so they are
    // always written; their writers diff against what they applied.
    if (prev.has(name) && prev.get(name) === v && (v === null || typeof v !== 'object')) continue
    write(el, state, name, v)
  }
  state.values = next
}

function collect(out: Map<string, unknown>, source: unknown, skip: readonly string[] | null): void {
  if (source === null || typeof source !== 'object') return
  const obj = source as Record<string, unknown>
  // Own keys only, as JSX spread copies them (`Object.assign`): an inherited
  // key is not one of the object's attributes.
  for (const key of Object.keys(obj)) {
    const name = spreadKeyName(key)
    if (name === null || (skip !== null && skip.indexOf(name) !== -1)) continue
    out.set(name, obj[key])
  }
}

function writerFor(el: Element, state: SpreadState, name: string): Write {
  let w = state.writers.get(name)
  if (!w) {
    w = name === 'class' ? classWriter(el) : name === 'style' ? styleWriter(el) : valueWriter(el as HTMLInputElement)
    state.writers.set(name, w)
  }
  return w
}

function write(el: Element, state: SpreadState, name: string, v: unknown): void {
  if (name.startsWith('on:')) {
    const type = name.slice(3)
    if (typeof v === 'function') {
      ensureDelegate(el, type)
      ;(el as unknown as Record<string, unknown>)['__onct_' + type] = v
    } else {
      ;(el as unknown as Record<string, unknown>)['__onct_' + type] = undefined
    }
    return
  }
  if (name === 'class' || name === 'style' || name === 'value') {
    writerFor(el, state, name)(v)
    return
  }
  if (name === 'visible') {
    ;(el as HTMLElement).style.display = v ? '' : 'none'
    return
  }
  if (SPREAD_BOOL_ATTRS.has(name)) {
    el.toggleAttribute(name, !!v)
    return
  }
  // A function is a callback prop passed through, not an attribute value.
  if (v == null || typeof v === 'function') el.removeAttribute(name)
  else el.setAttribute(name, sanitizeAttr(localName(name), v))
}

/** `xlink:href` → `href`: `sanitizeAttr` knows URL attributes by local name. */
function localName(name: string): string {
  const colon = name.indexOf(':')
  return colon === -1 ? name : name.slice(colon + 1)
}

function clear(el: Element, state: SpreadState, name: string): void {
  if (name === 'class' || name === 'style' || name === 'value') {
    writerFor(el, state, name)(undefined)
    state.writers.delete(name)
    return
  }
  if (name === 'visible') {
    ;(el as HTMLElement).style.display = ''
    return
  }
  write(el, state, name, undefined)
}
