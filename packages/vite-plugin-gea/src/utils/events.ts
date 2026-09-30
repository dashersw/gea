export const EVENT_NAMES = new Set([
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

export function toGeaEventType(attrName: string): string {
  if (attrName.startsWith('on') && attrName.length > 2) return attrName.slice(2).toLowerCase()
  return attrName
}

/**
 * Element events that EVENT_NAMES leaves out: the rest of the element event
 * maps in TypeScript's lib.dom.d.ts (a test keeps the two in step). React has
 * an `on…Capture` handler for most of them, so `captureEventType` needs them
 * too.
 */
const OTHER_DOM_EVENTS = new Set([
  'auxclick',
  'beforeinput',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'copy',
  'cut',
  'paste',
  'dragenter',
  'dragexit',
  'focusin',
  'focusout',
  'invalid',
  'select',
  'toggle',
  'load',
  'error',
  'abort',
  'touchcancel',
  'canplay',
  'canplaythrough',
  'durationchange',
  'emptied',
  'encrypted',
  'ended',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'pause',
  'play',
  'playing',
  'progress',
  'ratechange',
  'seeked',
  'seeking',
  'stalled',
  'suspend',
  'timeupdate',
  'volumechange',
  'waiting',
  'waitingforkey',
  'enterpictureinpicture',
  'leavepictureinpicture',
  'animationcancel',
  'beforematch',
  'beforetoggle',
  'cancel',
  'close',
  'command',
  'contextlost',
  'contextrestored',
  'cuechange',
  'formdata',
  'fullscreenchange',
  'fullscreenerror',
  'gotpointercapture',
  'lostpointercapture',
  'pointerrawupdate',
  'scrollend',
  'securitypolicyviolation',
  'selectionchange',
  'selectstart',
  'slotchange',
  'webkitanimationend',
  'webkitanimationiteration',
  'webkitanimationstart',
  'webkittransitionend',
])

/** Each event type by its lowercased name, which is what `toGeaEventType` gives (`longtap` for `longTap`). */
const CAPTURE_EVENT_TYPES = new Map([...EVENT_NAMES, ...OTHER_DOM_EVENTS].map((type) => [type.toLowerCase(), type]))

/** React's names that lowercase to a type no browser fires: `onDoubleClick` is `dblclick`. */
const REACT_EVENT_TYPES = new Map([['doubleclick', 'dblclick']])

/**
 * The event type of a React-style capture-phase handler (`onClickCapture`, or
 * `onclickcapture`), or null for any other attribute. `toGeaEventType` would
 * turn them into event types that don't exist (`clickcapture`). Only an event
 * Gea knows or an element event followed by "capture" counts, so a custom
 * event such as `onScreenCapture` compiles, and so do the real
 * `gotpointercapture` and `lostpointercapture` events.
 */
export function captureEventType(attrName: string): string | null {
  if (!attrName.startsWith('on')) return null
  const type = toGeaEventType(attrName)
  if (!type.endsWith('capture')) return null
  const bubbling = type.slice(0, -'capture'.length)
  return CAPTURE_EVENT_TYPES.get(REACT_EVENT_TYPES.get(bubbling) ?? bubbling) ?? null
}
