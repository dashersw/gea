import type { Slot } from './generator-types.ts'
import { EVENT_NAMES, toGeaEventType } from '../../utils/events.ts'

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function escapeUnquotedAttr(s: string): string {
  return s.replace(/&/g, '&amp;')
}

export function canOmitAttrQuotes(value: string): boolean {
  return value !== '' && !/[\s"'=<>`]/.test(value)
}

export function normalizeAttrName(name: string): string {
  if (name === 'className') return 'class'
  if (name === 'htmlFor') return 'for'
  return name
}

/**
 * Classify a JSX attribute name into a reactive slot kind.
 * Event names can be either bare (`click`, `input`) or prefixed (`onClick`).
 */
export function classifyAttrKind(name: string): Slot['kind'] {
  if (EVENT_NAMES.has(name)) return 'event'
  if (name.startsWith('on') && name.length > 2) return 'event'
  if (name === 'class' || name === 'className') return 'class'
  if (name === 'style') return 'style'
  if (name === 'value') return 'value'
  if (name === 'visible') return 'bool'
  if (name === 'ref') return 'ref'
  if (name === 'dangerouslySetInnerHTML') return 'html'
  if (BOOL_ATTRS.has(name)) return 'bool'
  return 'attr'
}

const BOOL_ATTRS = new Set([
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

/** HTML void elements — allowed to use self-closing `<tag/>` syntax. Other
 * elements must emit explicit `<tag></tag>` since the browser's HTML parser
 * silently ignores `/>` on non-void tags. */
export const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** Normalize event attribute name to DOM event type (`onClick` → `click`, `click` → `click`). */
export function normalizeEventAttrName(name: string): string {
  return toGeaEventType(name)
}
