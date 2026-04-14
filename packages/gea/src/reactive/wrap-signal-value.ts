/**
 * Runtime wrapper for compiled Store field getters.
 *
 * Reads the signal's .value and wraps arrays with wrapArray
 * (for mutating method overrides — push/pop/splice/etc notify the signal).
 *
 * Objects and primitives are returned directly — the compiler handles
 * all mutation notifications via _notify() insertion and itemSignal transforms.
 */
import { type Signal } from '../signals/signal.js';
import { wrapArray } from './wrap-array.js';

export function wrapSignalValue<T>(sig: Signal<T>): T {
  const v = sig.value;
  if (v !== null && typeof v === 'object' && Array.isArray(v)) {
    return wrapArray(v as any, sig as any) as T;
  }
  return v;
}
