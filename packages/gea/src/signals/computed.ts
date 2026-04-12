import { signal, type Signal } from './signal.js';
import { effect } from './effect.js';

export interface Computed<T> {
  readonly value: T;
  peek(): T;
  dispose(): void;
}

// Class-based computed — V8 stable hidden class for getter, better than object literal
class ComputedImpl<T> implements Computed<T> {
  _s: Signal<T>;
  _dispose: () => void;

  constructor(s: Signal<T>, dispose: () => void) {
    this._s = s;
    this._dispose = dispose;
  }

  get value(): T {
    return this._s.value;
  }

  peek(): T {
    return this._s.peek();
  }

  dispose(): void {
    this._dispose();
  }
}

export function computed<T>(fn: () => T): Computed<T> {
  const s = signal<T>(undefined as T);
  const dispose = effect(() => {
    s.value = fn();
  }, true);

  return new ComputedImpl(s, dispose);
}
