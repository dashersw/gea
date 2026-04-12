/**
 * Shared helpers for the gea compiler.
 */

/** Returns true when the first character of `name` is uppercase → component tag. */
export function isUpperCase(name: string): boolean {
  return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()
}

/** JSX attribute names that map to DOM property names instead of HTML attributes. */
export const ATTR_TO_PROP: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
}

/** Attributes that should be set as DOM properties rather than via setAttribute. */
export const DOM_PROPERTIES = new Set([
  'checked',
  'value',
  'disabled',
  'selected',
  'className',
  'htmlFor',
])

/**
 * Lowercase event names recognised by the compiler.
 * JSX `click={handler}` → `on(el, "click", handler)`.
 */
export const DOM_EVENTS = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseenter',
  'mouseleave',
  'mouseover',
  'mouseout',
  'keydown',
  'keyup',
  'keypress',
  'input',
  'change',
  'blur',
  'focus',
  'submit',
  'scroll',
  'resize',
  'reset',
  'wheel',
  'touchstart',
  'touchend',
  'touchmove',
  'contextmenu',
  'drag',
  'dragstart',
  'dragend',
  'dragover',
  'dragenter',
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
  'animationstart',
  'animationend',
  'animationiteration',
  'transitionstart',
  'transitionend',
  'transitionrun',
  'transitioncancel',
])

/**
 * Convert a JSX attribute name to a DOM event type.
 * Handles React-style `on`-prefix: `onMouseOver` -> `mouseover`
 */
export function toEventName(attrName: string): string | null {
  // Direct match (lowercase)
  if (DOM_EVENTS.has(attrName)) return attrName;

  // on-prefix: onMouseOver -> mouseover, onclick -> click
  if (attrName.startsWith('on') && attrName.length > 2) {
    const lowered = attrName.slice(2).toLowerCase();
    if (DOM_EVENTS.has(lowered)) return lowered;
  }

  return null;
}

/** Runtime helpers importable from "@geajs/core/runtime". */
export type RuntimeHelper =
  | 'createElement'
  | 'reactiveText'
  | 'reactiveAttr'
  | 'staticAttr'
  | 'conditional'
  | 'keyedList'
  | 'mount'
  | 'effect'
  | 'signal'
  | 'batch'
  | 'wrapArray'
  | 'template'
  | 'delegateEvent'
  | 'ensureDelegation'
  | 'computation'
  | 'selectorAttr'
  | 'selectorRemove'
  | 'reactiveContent'
  | 'mergedComputation'
  | 'itemSignal'
  | 'wrapObject'
  | 'wrapSignalValue'
  | 'signalEffect'
  | 'GEA_PROPS'
  | 'GEA_CREATE_TEMPLATE'
  | 'GEA_SET_PROPS'
  | 'GEA_COMPILED'
