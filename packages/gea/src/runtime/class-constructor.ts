/**
 * True for a class constructor, which store proxies must return unbound:
 * binding one would break identity (`store.view === Home`) and drop its
 * static members. Shared by the runtime `Store` and the compiled store bases.
 */
export function isClassConstructorValue(fn: unknown): boolean {
  if (typeof fn !== 'function') return false
  // The dev HMR component proxy must report its own `prototype` as writable,
  // so test the class it forwards to: `prototype.constructor`.
  try {
    const proto = (fn as { prototype?: { constructor?: { prototype?: unknown } } }).prototype
    const owner = proto?.constructor
    const ctor = typeof owner === 'function' && owner.prototype === proto ? owner : fn
    const d = Object.getOwnPropertyDescriptor(ctor, 'prototype')
    return !!(d && d.writable === false)
  } catch {
    return true
  }
}
