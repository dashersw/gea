/**
 * Closure-compiled core: the 8 surviving symbols.
 *
 * Descriptors match packages/gea/src/symbols.ts entries so `Symbol.for`
 * interning keeps shared symbol identity across entrypoints.
 */

// Identity (6)
export const GEA_ELEMENT = Symbol.for('gea.element')
export const GEA_STORE_ROOT = Symbol.for('gea.store.rootProxy')
export const GEA_PROXY_RAW = Symbol.for('gea.proxy.raw')
export const GEA_DOM_COMPONENT = Symbol.for('gea.dom.component')
export const GEA_PARENT_COMPONENT = Symbol.for('gea.component.parentComponent')
export const GEA_ITEM_KEY = Symbol.for('gea.itemKey')

// Proxy detection (1)
export const GEA_PROXY_IS_PROXY = Symbol.for('gea.proxy.isProxy')

// Protocol dispatch (1) — compiler emits `instance[GEA_CREATE_TEMPLATE](disposer)`.
export const GEA_CREATE_TEMPLATE = Symbol.for('gea.component.createTemplate')
export const GEA_ON_PROP_CHANGE = Symbol.for('gea.onPropChange')
