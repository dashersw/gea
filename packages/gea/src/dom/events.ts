import { batch } from '../signals/index.js';

// Delegated events: single document-level listener per event type.
// All handlers run inside batch() so multiple store mutations in one
// event handler flush as a single update pass.
const KEY_PREFIX = '$$gea_';
const installed = new Set<string>();

// Non-bubbling events that must be attached directly to the element.
const NON_BUBBLING = new Set([
  'mouseenter', 'mouseleave',
  'focus', 'blur',
  'scroll', 'resize',
  'animationstart', 'animationend', 'animationiteration',
  'transitionstart', 'transitionend', 'transitionrun', 'transitioncancel',
  'pointerenter', 'pointerleave',
]);

// Module-level currentTarget — avoids Object.defineProperty on event objects
// which deoptimizes their V8 hidden class.
let _currentTarget: Node | null = null;
// Reusable descriptor — mutated per event instead of allocating a new object
const _ctDesc: PropertyDescriptor = { value: null, configurable: true };

export function getCurrentTarget(): Node | null {
  return _currentTarget;
}

export function ensureDelegation(event: string): void {
  if (NON_BUBBLING.has(event)) return;
  if (installed.has(event)) return;
  installed.add(event);
  document.addEventListener(event, (e) => {
    let n = e.target as any;
    const key = KEY_PREFIX + event;
    while (n) {
      const h = n[key];
      if (h) {
        _currentTarget = n;
        _ctDesc.value = n;
        Object.defineProperty(e, 'currentTarget', _ctDesc);
        batch(h, e);
        _currentTarget = null;
        return;
      }
      n = n.parentNode;
    }
  });
}

// Reset for testing
export function resetDelegation(): void {
  installed.clear();
}

export function delegateEvent(el: Node, event: string, handler: EventListener): void {
  if (NON_BUBBLING.has(event)) {
    (el as EventTarget).addEventListener(event, (e) => batch(handler, e));
    return;
  }
  ensureDelegation(event);
  (el as any)[KEY_PREFIX + event] = handler;
}
