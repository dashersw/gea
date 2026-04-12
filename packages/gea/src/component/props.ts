import { signal, resetReadEpoch, getReadEpoch } from '../signals/signal.js';

export type PropThunks = Record<string, () => unknown>;

/**
 * Creates a reactive props proxy implementing gea's binding model:
 *
 * - Object/array props: two-way via shared references. Mutations via the parent's
 *   wrapped object go to the parent's signal automatically.
 * - Primitive props: one-way. Writing child.props.count = 99 creates a local override.
 * - Parent reclaim: when the parent updates a prop value (even in-place mutation of
 *   the same object reference), the child's local override is cleared.
 */
export function createPropsProxy<T extends Record<string, unknown>>(
  thunks: PropThunks,
): T {
  const obj = {} as T;
  for (const key of Object.keys(thunks)) {
    const thunk = thunks[key];
    let sig: ReturnType<typeof signal> | null = null;
    let overridden = false;
    let parentEpoch = 0;

    /** Read the thunk and capture the accumulated epoch of all signals read. */
    function readParent(): [unknown, number] {
      resetReadEpoch();
      const val = thunk();
      return [val, getReadEpoch()];
    }

    Object.defineProperty(obj, key, {
      get() {
        const [parentVal, epoch] = readParent();
        if (overridden) {
          // Parent reclaim: if any signal read during the thunk has been
          // notified since the override was set, clear the override.
          // This detects both reference changes AND in-place mutations
          // (wrapObject/wrapArray call signal._notify() on mutation).
          if (epoch !== parentEpoch) {
            overridden = false;
            parentEpoch = epoch;
            sig!._v = parentVal;
          }
        } else {
          parentEpoch = epoch;
          if (!sig) {
            sig = signal(parentVal);
          } else {
            sig._v = parentVal;
          }
        }
        return sig!.value;
      },
      set(v: unknown) {
        overridden = true;
        // Capture current parent epoch so we detect future changes
        resetReadEpoch();
        thunk();
        parentEpoch = getReadEpoch();
        if (!sig) {
          sig = signal(v);
        } else {
          sig.value = v;
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  return obj;
}
