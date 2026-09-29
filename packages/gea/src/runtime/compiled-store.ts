import { GEA_PROXY_RAW, GEA_STORE_ROOT } from './symbols'
import { GEA_OBSERVE_DIRECT } from './internal-symbols'
import { GEA_DIRTY, GEA_DIRTY_PROPS } from './dirty-symbols'
import { trackRead } from './with-tracking'
import { isClassConstructorValue } from './class-constructor'
import type { Change } from '../store'

/**
 * A store observer: the changed value, and the batch of changes that
 * produced it. `S` is `CompiledStore<S>`'s own type parameter — the
 * concrete store subclass's field shape, resolved once per subclass exactly
 * the way `CompiledComponent<P>` resolves `P` for a component's props. A
 * single `Map<string, Set<Handler<S>>>` holds observers across every field
 * of `S` at once, so the exact field a given handler fires for isn't known
 * at this layer — but the closed set of types it could possibly be (every
 * member of `S`) is, which is why `value` is `S[keyof S]` rather than
 * `any`/`unknown`.
 */
type Handler<S> = (value: S[keyof S], changes: Change[]) => void

interface StoreState<S> {
  observers?: Map<string, Set<Handler<S>>>
  rootObservers?: Set<Handler<S>>
  derived?: Map<string, Set<Handler<S>>>
  direct?: Map<string, Set<(value: S[keyof S]) => void>>
  /** Queued change records, keyed by the prop they were recorded against —
   * each entry is `Change`-shaped (built by `_queue` below), not a raw
   * store value, so `Change[]` is exact rather than `any[]`. */
  pending?: Map<string, Change[]>
  scheduled?: boolean
  ready?: boolean
}

// Symbol properties, not `WeakMap`s keyed by the store object. See the same
// change in `compiled-lean-store`: geatsc marks any value reaching a weak-key
// position as a weak-handle ownership subject and then rejects it for carrying a
// dynamic representation, which every store value does. A non-enumerable symbol
// property has the same lifetime, stays out of `Object.keys` / `for...in` /
// `JSON.stringify`, and passes through the proxy traps' existing symbol
// short-circuit.
const _PRIV = Symbol('gea.store.priv')
const _NESTED = Symbol('gea.store.nested')

/**
 * `O`/`V` are generic (not `object`/`any`) — this helper hides a value under
 * a symbol key on WHATEVER object it's called with (the raw store, its
 * proxy, a Map cache, ...), so its own declaration can't pin a single
 * concrete shape; each call site supplies its own concrete `O`/`V`.
 */
function _hidden<O extends object, V>(target: O, key: symbol, value: V): void {
  Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: false })
}

/** Same shape as `_hidden`: a generic reflection probe, not tied to one type. */
function _isPlain<V>(v: V): boolean {
  if (!v || typeof v !== 'object') return false
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null || Array.isArray(v)
}

/** Unwrap a proxy value to its raw target, preserving whatever type it was. */
function _unwrap<V>(v: V): V {
  const rawTarget = v && (v as unknown as Record<symbol, unknown>)[GEA_PROXY_RAW]
  return (rawTarget as V) || v
}

function _fireBucket<S>(bucket: Set<Handler<S>>, value: S[keyof S], changes: Change[]): void {
  if (bucket.size === 0) return
  if (bucket.size === 1) {
    for (const h of bucket) {
      h(value, changes)
      return
    }
  }
  const snapshot: Handler<S>[] = []
  for (const h of bucket) snapshot.push(h)
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i](value, changes)
    } catch {
      /* isolate sibling observers */
    }
  }
}

function _flush<S>(raw: S, state: StoreState<S>): void {
  state.scheduled = false
  const pending = state.pending
  if (!pending || pending.size === 0) return
  state.pending = undefined
  let allChanges: Change[] | null = null
  for (const entry of pending) {
    const prop = entry[0]
    const changes = entry[1]
    if (state.rootObservers || state.derived) {
      allChanges ??= []
      for (let i = 0; i < changes.length; i++) allChanges.push(changes[i])
    }
    const bucket = state.observers?.get(prop)
    if (!bucket || bucket.size === 0) continue
    _fireBucket(bucket, raw[prop as keyof S], changes)
  }
  if (allChanges && state.rootObservers) {
    _fireBucket(state.rootObservers, raw as S[keyof S], allChanges)
  }
  if (allChanges && state.derived) {
    for (const entry of state.derived) {
      const prop = entry[0]
      const bucket = entry[1]
      if (bucket.size === 0) continue
      let value: S[keyof S]
      try {
        value = raw[prop as keyof S]
      } catch {
        continue
      }
      _fireBucket(bucket, value, allChanges)
    }
  }
}

function _hasQueuedConsumers<S>(state: StoreState<S>, prop: string): boolean {
  const bucket = state.observers?.get(prop)
  return !!(
    (bucket && bucket.size > 0) ||
    (state.rootObservers && state.rootObservers.size > 0) ||
    (state.derived && state.derived.size > 0)
  )
}

function _queue<S>(raw: S, state: StoreState<S>, prop: string, change: Partial<Change> = {}): void {
  if (!state.ready || !_hasQueuedConsumers(state, prop)) return
  const rec: Change = { prop, pathParts: [prop], type: 'update', target: raw, ...change }
  const pending = state.pending ?? (state.pending = new Map())
  const arr = pending.get(prop)
  if (arr) arr.push(rec)
  else pending.set(prop, [rec])
  if (!state.scheduled) {
    state.scheduled = true
    queueMicrotask(() => _flush(raw, state))
  }
}

/**
 * Nested object/array traversal INSIDE one of `S`'s own fields (e.g.
 * `store.list[0].name`): once inside a field's own substructure, the shape
 * is no longer described by `S` (a field's element/property types aren't
 * modeled recursively here) — `V` is a genuinely open per-call type at this
 * depth, kept as a type parameter rather than `any` so it's at least
 * threaded through instead of erased, but this is the one spot in this file
 * that's honestly a dynamic-JS-object-graph boundary: how deep a nested
 * value's shape goes isn't knowable without walking `S` structurally.
 */
function _wrapNested<S, V>(raw: S, state: StoreState<S>, target: V, rootProp: string): V {
  if (!_isPlain(target)) return target
  const targetObj = target as unknown as Record<PropertyKey, unknown>
  let perTarget: Map<string, unknown> | undefined = (targetObj as unknown as Record<symbol, Map<string, unknown>>)[
    _NESTED
  ]
  if (perTarget) {
    const cached = perTarget.get(rootProp)
    if (cached) return cached as V
  }
  const proxy = new Proxy(targetObj, {
    get(obj, prop) {
      if (prop === GEA_PROXY_RAW) return obj
      if (typeof prop === 'symbol') return obj[prop]
      trackRead(raw as object, rootProp)
      const val = obj[prop]
      if (Array.isArray(obj) && typeof val === 'function') {
        if (prop === 'push') {
          return (...args: unknown[]) => {
            const start = (obj as unknown[]).length
            const result = Array.prototype.push.apply(obj, args.map(_unwrap))
            if (obj === (raw as Record<string, unknown>)[rootProp] && (obj as unknown[]).length > start) {
              _queue(raw, state, rootProp, { type: 'append', start, count: (obj as unknown[]).length - start })
            } else {
              _queue(raw, state, rootProp)
            }
            return result
          }
        }
        if (prop === 'splice') {
          return (...args: unknown[]) => {
            const before = (obj as unknown[]).length
            const start = (args[0] as number) | 0
            const result = Array.prototype.splice.apply(
              obj,
              args.length > 2
                ? ([args[0], args[1], ...args.slice(2).map(_unwrap)] as [number, number, ...unknown[]])
                : (args as [number, number]),
            )
            if (obj === (raw as Record<string, unknown>)[rootProp]) {
              const after = (obj as unknown[]).length
              if (after < before) _queue(raw, state, rootProp, { type: 'remove', start, count: before - after })
              else _queue(raw, state, rootProp, { type: 'reorder' })
            } else {
              _queue(raw, state, rootProp)
            }
            return result
          }
        }
        if (prop === 'pop' || prop === 'shift') {
          return (...args: unknown[]) => {
            const before = (obj as unknown[]).length
            const result = (Array.prototype as unknown as Record<string, (...a: unknown[]) => unknown>)[prop].apply(
              obj,
              args,
            )
            const after = (obj as unknown[]).length
            if (obj === (raw as Record<string, unknown>)[rootProp] && after < before) {
              _queue(raw, state, rootProp, { type: 'remove', start: prop === 'pop' ? after : 0, count: 1 })
            } else {
              _queue(raw, state, rootProp)
            }
            return result
          }
        }
        if (prop === 'unshift' || prop === 'sort' || prop === 'reverse') {
          return (...args: unknown[]) => {
            const callArgs = prop === 'unshift' ? args.map(_unwrap) : args
            const result = (Array.prototype as unknown as Record<string, (...a: unknown[]) => unknown>)[prop].apply(
              obj,
              callArgs,
            )
            if (obj === (raw as Record<string, unknown>)[rootProp]) {
              _queue(raw, state, rootProp, { type: 'reorder' })
            } else {
              _queue(raw, state, rootProp)
            }
            return result
          }
        }
      }
      return _isPlain(val) ? _wrapNested(raw, state, val, rootProp) : val
    },
    set(obj, prop, value) {
      if (typeof prop === 'symbol') {
        obj[prop] = value
        return true
      }
      value = _unwrap(value)
      const old = obj[prop]
      if (old === value) return true
      obj[prop] = value
      if (Array.isArray(obj)) {
        if (value && typeof value === 'object') (value as Record<symbol, unknown>)[GEA_DIRTY] = true
        const idx = +prop
        if (Number.isInteger(idx) && obj === (raw as Record<string, unknown>)[rootProp]) {
          _queue(raw, state, rootProp, { aipu: true, arix: idx, previousValue: old, newValue: value })
          return true
        }
      } else {
        ;(obj as Record<symbol, unknown>)[GEA_DIRTY] = true
        const dirtyProps = ((obj as Record<symbol, unknown>)[GEA_DIRTY_PROPS] ??= new Set()) as Set<string>
        dirtyProps.add(prop)
      }
      _queue(raw, state, rootProp, { previousValue: old, newValue: value })
      return true
    },
    deleteProperty(obj, prop) {
      if (typeof prop === 'symbol') {
        delete obj[prop]
        return true
      }
      const old = obj[prop]
      delete obj[prop]
      if (!Array.isArray(obj)) (obj as Record<symbol, unknown>)[GEA_DIRTY] = true
      _queue(raw, state, rootProp, { previousValue: old, type: 'delete' })
      return true
    },
  })
  if (!perTarget) {
    perTarget = new Map()
    _hidden(targetObj, _NESTED, perTarget)
  }
  perTarget.set(rootProp, proxy)
  return proxy as V
}

export class CompiledStore<S extends Record<string, any> = Record<string, any>> {
  constructor() {
    const state: StoreState<S> = { ready: false }
    _hidden(this, _PRIV, state)
    const proxy = new Proxy(this as unknown as S, {
      get(target: S, prop: string | symbol, receiver: object) {
        if (prop === GEA_PROXY_RAW) return target
        if (typeof prop === 'symbol') return (target as Record<symbol, unknown>)[prop]
        trackRead(receiver ?? target, prop)
        const value = target[prop as keyof S]
        if (typeof value === 'function') {
          if (isClassConstructorValue(value)) return value
          return (value as (...args: unknown[]) => unknown).bind(receiver)
        }
        return _isPlain(value) ? _wrapNested(target, state, value, prop) : value
      },
      set(target: S, prop: string | symbol, value: unknown) {
        if (typeof prop === 'symbol') {
          ;(target as Record<symbol, unknown>)[prop] = value
          return true
        }
        value = _unwrap(value)
        const old = target[prop as keyof S]
        if (old === value && prop in target) {
          if (Array.isArray(value)) _queue(target, state, prop, { previousValue: old, newValue: value })
          return true
        }
        if (old && typeof old === 'object') delete (old as Record<symbol, unknown>)[_NESTED]
        ;(target as Record<string, unknown>)[prop] = value
        const direct = state.direct?.get(prop)
        if (direct) for (const h of direct) h(value as S[keyof S])
        _queue(target, state, prop, { previousValue: old, newValue: value })
        return true
      },
    })
    _hidden(proxy as unknown as object, _PRIV, state)
    ;(this as unknown as Record<symbol, unknown>)[GEA_STORE_ROOT] = proxy
    return proxy as unknown as this
  }

  observe(pathOrProp: string | readonly string[], handler: Handler<S>): () => void {
    const state: StoreState<S> | undefined = (this as unknown as Record<symbol, StoreState<S>>)[_PRIV]
    if (!state) return () => {}
    state.ready = true
    const isArr = Array.isArray(pathOrProp)
    // `path` / `text` carry the two alternatives in their own exact slots so
    // `.length` / `[0]` / `.slice` have a `readonly string[]` receiver: called on
    // `pathOrProp` — declared `string | readonly string[]` — the intrinsic has no
    // single receiver carrier and `pathOrProp.slice(1)` fail-closed with
    // `representation-plan coverage gap for CallExpression`. Each read is already
    // guarded by `isArr`, so neither default is ever observed.
    let path: readonly string[] = []
    let text = ''
    if (typeof pathOrProp === 'string') text = pathOrProp
    else path = pathOrProp
    if ((isArr && path.length === 0) || (!isArr && text === '')) {
      const bucket = state.rootObservers ?? (state.rootObservers = new Set())
      bucket.add(handler)
      return () => {
        bucket.delete(handler)
      }
    }
    const prop = isArr ? (path[0] ?? '') : text
    const tail = isArr && path.length > 1 ? path.slice(1) : null
    const finalHandler: Handler<S> = tail
      ? (value, changes) => {
          let next: unknown = value
          for (let i = 0; i < tail.length; i++) {
            if (next == null) return
            next = (next as Record<string, unknown>)[tail[i]]
          }
          handler(next as S[keyof S], changes)
        }
      : handler
    let isDerived = false
    if (!Object.prototype.hasOwnProperty.call(this, prop)) {
      for (
        let proto = Object.getPrototypeOf(this);
        proto && proto !== Object.prototype;
        proto = Object.getPrototypeOf(proto)
      ) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, prop)
        if (descriptor) {
          isDerived = !!descriptor.get
          break
        }
      }
    }
    const observers = isDerived
      ? (state.derived ?? (state.derived = new Map()))
      : (state.observers ?? (state.observers = new Map()))
    let bucket = observers.get(prop)
    if (!bucket) observers.set(prop, (bucket = new Set()))
    bucket.add(finalHandler)
    return () => {
      bucket!.delete(finalHandler)
    }
  }

  [GEA_OBSERVE_DIRECT](prop: string, handler: (value: S[keyof S]) => void): () => void {
    const state: StoreState<S> | undefined = (this as unknown as Record<symbol, StoreState<S>>)[_PRIV]
    if (!state) return () => {}
    state.ready = true
    const direct = state.direct ?? (state.direct = new Map())
    let bucket = direct.get(prop)
    if (!bucket) direct.set(prop, (bucket = new Set()))
    bucket.add(handler)
    return () => {
      bucket!.delete(handler)
    }
  }
}

export default CompiledStore
