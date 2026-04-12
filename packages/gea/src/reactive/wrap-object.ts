/**
 * Wraps a plain object field so that sub-property mutations
 * (e.g. `this.selections[key] = value`) notify the parent signal.
 *
 * Uses Proxy because dynamic key assignment (Record<string, T> patterns)
 * cannot be intercepted with Object.defineProperty.
 *
 * Also wraps child values on access: child arrays get wrapArray
 * so mutations like `this.messages[id].push(msg)` also notify.
 */
import { type Signal } from '../signals/signal.js';
import { wrapArray } from './wrap-array.js';

const objectProxyCache = new WeakMap<object, object>();

export function wrapObject<T extends object>(obj: T, parentSignal: Signal<any>): T {
  if (obj === null || typeof obj !== 'object') return obj;

  const cached = objectProxyCache.get(obj);
  if (cached) return cached as T;

  const proxy = new Proxy(obj, {
    get(target, key) {
      const val = (target as any)[key];
      if (val !== null && typeof val === 'object' && typeof key === 'string') {
        if (Array.isArray(val)) return wrapArray(val, parentSignal);
        return wrapObject(val, parentSignal);
      }
      return val;
    },
    set(target, key, value) {
      (target as any)[key] = value;
      parentSignal._notify();
      return true;
    },
    deleteProperty(target, key) {
      delete (target as any)[key];
      parentSignal._notify();
      return true;
    },
  });

  objectProxyCache.set(obj, proxy);
  return proxy as T;
}
