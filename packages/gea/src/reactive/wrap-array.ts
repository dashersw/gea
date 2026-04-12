/**
 * Wraps a Store array field for fine-grained item property reactivity.
 *
 * Arrays: mutating methods (push/pop/splice/etc) are overridden on the raw array.
 * Item properties are made reactive on-demand by ensureItemSignal (called by compiler).
 * No eager iteration — the compiler inserts ensureItemSignal calls at all access sites.
 */
import { signal, type Signal } from '../signals/signal.js';

const MUTATING = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

// Symbols for keyed-list integration
const RAW_ARRAY = Symbol.for('gea.rawArray');

// Markers
const WRAPPED = Symbol.for('gea.wrapped');

const _markerDesc: PropertyDescriptor = { value: true };

// Cache: raw array → wrapped (so wrapArray returns the same ref each time)
const arrayProxyCache = new WeakMap<object, any>();

// Per-property signal symbol cache — reuse the same Symbol for each property name
const signalSymbols = new Map<string, symbol>();
function signalKey(key: string): symbol {
  let s = signalSymbols.get(key);
  if (!s) {
    s = Symbol.for(`gea.sig.${key}`);
    signalSymbols.set(key, s);
  }
  return s;
}

export function ensureItemSignal(obj: any, key: string): Signal<unknown> {
  const sk = signalKey(key);
  let s: Signal<unknown> | undefined = obj[sk];
  if (!s) {
    const raw = obj[key];
    s = signal(raw);
    Object.defineProperty(obj, sk, { value: s, configurable: true });
    // If the value is an array, wrap it so that in-place mutations
    // (push/splice/etc) notify this signal automatically.
    if (Array.isArray(raw)) {
      wrapArray(raw, s as Signal<any>);
    }
    // Install getter/setter so mutations notify the signal.
    // Skip non-configurable properties (e.g. Array.length).
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc || desc.configurable) {
      Object.defineProperty(obj, key, {
        get() { return s!.value; },
        set(v: unknown) { s!.value = v; },
        enumerable: true,
        configurable: true,
      });
    }
  }
  return s;
}

export function wrapArray<T>(arr: T[], parentSignal: Signal<T[]>): T[] {
  if (!Array.isArray(arr)) return arr;

  // Return cached if already wrapped
  const cached = arrayProxyCache.get(arr);
  if (cached) return cached;

  // Mark as wrapped
  Object.defineProperty(arr, WRAPPED, _markerDesc);

  // Expose raw array for keyed-list key extraction
  Object.defineProperty(arr, RAW_ARRAY, { value: arr });

  // Override mutating methods — notify parent signal after mutation.
  for (let _m = 0; _m < MUTATING.length; _m++) { const methodName = MUTATING[_m];
    const original = (Array.prototype as any)[methodName];
    Object.defineProperty(arr, methodName, {
      value: function (this: T[], ...args: any[]) {
        const result = original.apply(arr, args);
        parentSignal._notify();
        return result;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  // No eager makeItemReactive — the compiler inserts ensureItemSignal calls
  // at all item property access sites.
  arrayProxyCache.set(arr, arr);
  return arr;
}
