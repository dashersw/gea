export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

export const EVENT_TYPES = new Set([
  'click', 'dblclick', 'change', 'input', 'keydown', 'keyup', 'keypress',
  'blur', 'focus', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 'mousemove',
  'mouseenter', 'mouseleave', 'contextmenu',
  'submit', 'scroll', 'resize', 'reset', 'wheel',
  'touchstart', 'touchmove', 'touchend',
  'tap', 'longTap', 'swipeRight', 'swipeUp', 'swipeLeft', 'swipeDown',
  'dragstart', 'dragend', 'dragover', 'dragleave', 'drop',
  'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave',
  'pointerover', 'pointerout', 'pointercancel',
  'animationstart', 'animationend', 'animationiteration',
  'transitionstart', 'transitionend', 'transitionrun', 'transitioncancel',
])

export const URL_ATTRIBUTES = new Set(['href', 'src', 'action'])

export const BOOLEAN_HTML_ATTRS = new Set([
  'disabled', 'hidden', 'readonly', 'required', 'checked', 'selected',
  'multiple', 'autofocus', 'autoplay', 'controls', 'loop', 'muted',
  'open', 'novalidate', 'formnovalidate', 'defer', 'async',
])

export const INTERNAL_PROPS = new Set(['key', 'ref', 'dangerouslySetInnerHTML'])

export const RESERVED_HTML_TAG_NAMES = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio',
  'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button',
  'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
  'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html',
  'i', 'iframe', 'img', 'input', 'ins',
  'kbd',
  'label', 'legend', 'li', 'link',
  'main', 'map', 'mark', 'menu', 'meta', 'meter',
  'nav', 'noscript',
  'object', 'ol', 'optgroup', 'option', 'output',
  'p', 'param', 'picture', 'pre', 'progress',
  'q',
  'rp', 'rt', 'ruby',
  's', 'samp', 'script', 'section', 'select', 'slot', 'small', 'source',
  'span', 'strong', 'style', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead',
  'time', 'title', 'tr', 'track',
  'u', 'ul',
  'var', 'video', 'view',
  'wbr',
])
