import { signal } from '../signals/signal.js';

export type PropThunks = Record<string, () => unknown>;

export function createPropsProxy<T extends Record<string, unknown>>(
  thunks: PropThunks,
): T {
  const obj = {} as T;
  for (const key of Object.keys(thunks)) {
    const thunk = thunks[key];
    let localSig: ReturnType<typeof signal> | null = null;
    let overridden = false;

    Object.defineProperty(obj, key, {
      get() {
        if (overridden) return localSig!.value;
        return thunk();
      },
      set(v: unknown) {
        overridden = true;
        if (!localSig) {
          localSig = signal(v);
        } else {
          localSig.value = v;
        }
      },
      enumerable: true,
      configurable: true,
    });
  }
  return obj;
}
