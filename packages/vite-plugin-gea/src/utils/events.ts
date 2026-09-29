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
 * DOM events that EVENT_NAMES leaves out. React has an `on…Capture` handler
 * for each, so `isCaptureEventAttr` needs them too.
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
])

/**
 * React's capture-phase handler names (`onClickCapture`, or `onclickcapture`).
 * `toGeaEventType` would turn them into event types that don't exist
 * (`clickcapture`). Only a DOM event followed by "capture" counts, so a custom
 * event such as `onScreenCapture` compiles, and so do the real
 * `gotpointercapture` and `lostpointercapture` events.
 */
export function isCaptureEventAttr(attrName: string): boolean {
  if (!attrName.startsWith('on')) return false
  const type = toGeaEventType(attrName)
  if (!type.endsWith('capture')) return false
  const bubbling = type.slice(0, -'capture'.length)
  return EVENT_NAMES.has(bubbling) || OTHER_DOM_EVENTS.has(bubbling)
}
