/**
 * Wraps a Store array field for fine-grained item property reactivity.
 *
 * Arrays: mutating methods (push/pop/splice/etc) are overridden on the raw array
 * to call parentSignal._notify() after mutation. This is a plain property override,
 * NOT a Proxy.
 *
 * Item properties are made reactive on-demand by ensureItemSignal (called by compiler).
 * No eager iteration — the compiler inserts ensureItemSignal calls at all access sites.
 */
import { signal, type Signal } from '../signals/signal.js';
import { batch } from '../signals/batch.js';

const MUTATING = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];

// Markers
const WRAPPED = Symbol.for('gea.wrapped');

const _markerDesc: PropertyDescriptor = { value: true };

const SIG_PREFIX = '$$gea_s$';

// Item → parent array signal mapping.  When an item property signal fires,
// we also notify the parent array so that dependents (keyed-list effects
// calling .filter() etc.) re-evaluate without needing per-property
// compiler transforms on every call site.
const _itemParent = new WeakMap<object, Signal<unknown>>();

function registerItems(arr: any[], parentSignal: Signal<unknown>): void {
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === 'object' && item !== null) {
      _itemParent.set(item, parentSignal);
    }
  }
}

export function ensureItemSignal(obj: any, key: string): Signal<unknown> {
  const sk = SIG_PREFIX + key;
  let s: Signal<unknown> | undefined = obj[sk];
  if (!s) {
    const raw = obj[key];
    s = signal(raw);
    obj[sk] = s;
    // If the value is an array, wrap it so that in-place mutations
    // (push/splice/etc) notify this signal automatically.
    if (Array.isArray(raw)) {
      wrapArray(raw, s as Signal<any>);
    }
    // Install getter/setter so mutations notify the signal.
    Object.defineProperty(obj, key, {
      get() { return s!.value; },
      set(v: unknown) {
        // Bubble to the parent array signal (if any) so that dependents
        // of the array (e.g. keyed-list effects whose itemsFn calls
        // .filter(i => i.status === ...)) re-evaluate.
        const parentSig = _itemParent.get(obj);
        if (parentSig) {
          batch(() => {
            s!.value = v;
            parentSig._notify();
          });
        } else {
          s!.value = v;
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  return s;
}

export function wrapArray<T>(arr: T[], parentSignal: Signal<T[]>): T[] {
  if (!Array.isArray(arr)) return arr;

  // Already wrapped — don't double-override methods
  if ((arr as any)[WRAPPED]) return arr;

  // Mark as wrapped
  Object.defineProperty(arr, WRAPPED, _markerDesc);

  // Register current items so ensureItemSignal setters bubble to parent
  registerItems(arr, parentSignal as Signal<unknown>);

  // Override mutating methods — notify parent signal after mutation.
  for (let _m = 0; _m < MUTATING.length; _m++) { const methodName = MUTATING[_m];
    const original = (Array.prototype as any)[methodName];
    Object.defineProperty(arr, methodName, {
      value: function (this: T[], ...args: any[]) {
        const result = original.apply(arr, args);
        parentSignal._notify();
        // Register any newly added items (push, unshift, splice)
        registerItems(arr, parentSignal as Signal<unknown>);
        return result;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  return arr;
}
