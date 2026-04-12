/**
 * Runtime wrapper for compiled Store field getters.
 *
 * Reads the signal's .value and wraps it based on its runtime type:
 * - Arrays → wrapArray (fine-grained item reactivity)
 * - Objects → wrapObject (nested mutation notification)
 * - Primitives → returned directly
 *
 * This eliminates the need for static type analysis in the compiler.
 */
import { type Signal } from '../signals/signal.js';
import { wrapArray } from './wrap-array.js';
import { wrapObject } from './wrap-object.js';

export function wrapSignalValue<T>(sig: Signal<T>): T {
  const v = sig.value;
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return wrapArray(v as any, sig as any) as T;
  if (typeof Node !== 'undefined' && v instanceof Node) return v;
  return wrapObject(v as any, sig as any) as T;
}
