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
 * React's capture-phase handler names (`onClickCapture`). `toGeaEventType`
 * would turn them into event types that don't exist (`clickcapture`).
 * `gotpointercapture` and `lostpointercapture` are real events.
 */
export function isCaptureEventAttr(attrName: string): boolean {
  if (!/^on[A-Z]\w*Capture$/.test(attrName)) return false
  return attrName !== 'onGotPointerCapture' && attrName !== 'onLostPointerCapture'
}
