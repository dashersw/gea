// Dirty markers shared by the store and compiler-emitted keyed-list kernels.
// These stay on Symbol.for because store modules and compiled component modules
// can be evaluated through different Vite module instances during tests/dev.
const _DIRTY: unique symbol = Symbol.for('gea.d.dirty') as any
const _DIRTY_PROPS: unique symbol = Symbol.for('gea.d.dirtyProps') as any

export { _DIRTY as GEA_DIRTY, _DIRTY_PROPS as GEA_DIRTY_PROPS }
