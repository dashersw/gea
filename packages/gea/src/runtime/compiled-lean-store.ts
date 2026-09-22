import { GEA_PROXY_RAW } from './symbols'
import { GEA_OBSERVE_DIRECT } from './internal-symbols'
import { GEA_DIRTY, GEA_DIRTY_PROPS } from './dirty-symbols'
import { trackRead } from './with-tracking'
import type { Change } from '../store'

/**
 * A store observer: the changed value, and the batch of changes that
 * produced it. `S` is `CompiledLeanStore<S>`'s own type parameter — the
 * concrete store subclass's field shape, resolved once per subclass exactly
 * the way `CompiledComponent<P>` resolves `P` for a component's props. A
 * single `Map<string, Set<Handler<S>>>` holds observers across every field
 * of `S` at once, so the exact field a given handler fires for isn't known
 * at this layer — but the closed set of types it could possibly be (every
 * member of `S`) is, which is why `value` is `S[keyof S]` rather than
 * `any`/`unknown`.
 */
type Handler<S> = (value: S[keyof S], changes: Change[]) => void

interface LeanState<S> {
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
  /** The store's own proxy — literally an `S`, not `any`. */
  proxy?: S
}

// Private state and the nested-proxy cache hang off the object itself under a
// non-enumerable symbol, rather than living in a `WeakMap` keyed by it. geatsc
// marks every value that reaches a weak-container key as a weak-handle
// ownership subject and then rejects it for having a dynamic carrier ("Weak-handle
// ownership subject ... reached unsupported callable, dynamic, or mixed carrier
// dynamic:declared-dynamic") — and the store's values are dynamic by nature, so
// there is no type that satisfies it. A symbol property has the same lifetime as
// the WeakMap entry (it dies with the object), is invisible to `Object.keys`,
// `for...in` and `JSON.stringify`, and reaches the raw target through the proxy's
// existing symbol pass-through in both traps.
const _PRIV = Symbol('gea.lean.priv')
const _NESTED = Symbol('gea.lean.nested')

/**
 * `O`/`V` are generic (not `object`/`any`) — this helper hides a value under
 * a symbol key on WHATEVER object it's called with (the raw store, its
 * proxy, a Map cache, ...), so its own declaration can't pin a single
 * concrete shape; each call site supplies its own concrete `O`/`V`.
 */
function _hidden<O extends object, V>(target: O, key: symbol, value: V): void {
  Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: false })
}

/**
 * Browser fallback for the tracked-proxy plain-value v1 contract. The embedded
 * compiler replaces this exact exported coordinate with its native predicate.
 * V1 assumes pristine builtins and ordinary Gea values (including Gea-owned,
 * non-revoked proxies); monkey-patched prototypes and custom/revoked proxies
 * are outside the contract.
 */
export function _plain<V>(v: V): boolean {
  if (!v || typeof v !== 'object') return false
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null || Array.isArray(v)
}

/** Unwrap a proxy value to its raw target, preserving whatever type it was. */
function _raw<V>(v: V): V {
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

function _flush<S>(state: LeanState<S>): void {
  state.scheduled = false
  const pending = state.pending
  if (!pending || pending.size === 0) return
  state.pending = undefined
  let all: Change[] | null = null
  for (const entry of pending) {
    const prop = entry[0]
    const changes = entry[1]
    if (state.rootObservers || state.derived) {
      all ??= []
      for (let i = 0; i < changes.length; i++) all.push(changes[i])
    }
    const bucket = state.observers?.get(prop)
    if (bucket) _fireBucket(bucket, (state.proxy as S)[prop as keyof S], changes)
  }
  if (all && state.rootObservers) {
    _fireBucket(state.rootObservers, state.proxy as S[keyof S], all)
  }
  if (all && state.derived) {
    for (const entry of state.derived) {
      const prop = entry[0]
      const bucket = entry[1]
      if (bucket.size === 0) continue
      let value: S[keyof S]
      try {
        value = (state.proxy as S)[prop as keyof S]
      } catch {
        continue
      }
      _fireBucket(bucket, value, all)
    }
  }
}

function _hasQueuedConsumers<S>(state: LeanState<S>, prop: string): boolean {
  const bucket = state.observers?.get(prop)
  return !!(
    (bucket && bucket.size > 0) ||
    (state.rootObservers && state.rootObservers.size > 0) ||
    (state.derived && state.derived.size > 0)
  )
}

function _queue<S>(state: LeanState<S>, prop: string, change: Partial<Change> = {}): void {
  if (!state.ready) return
  if (!_hasQueuedConsumers(state, prop)) return
  const rec: Change = { prop, pathParts: [prop], type: 'update', target: state.proxy, ...change }
  const pending = state.pending ?? (state.pending = new Map())
  const arr = pending.get(prop)
  if (arr) arr.push(rec)
  else pending.set(prop, [rec])
  if (!state.scheduled) {
    state.scheduled = true
    queueMicrotask(() => _flush(state))
  }
}

/**
 * Nested nested-object/array traversal INSIDE one of `S`'s own fields (e.g.
 * `store.list[0].name`): once inside a field's own substructure, the shape
 * is no longer described by `S` (a field's element/property types aren't
 * modeled recursively here) — `V` is a genuinely open per-call type at this
 * depth, kept as a type parameter rather than `any` so it's at least
 * threaded through instead of erased, but this is the one spot in this file
 * that's honestly a dynamic-JS-object-graph boundary: how deep a nested
 * value's shape goes isn't knowable without walking `S` structurally.
 */
function _wrap<S, V>(state: LeanState<S>, target: V, rootProp: string): V {
  if (!_plain(target)) return target
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
      trackRead(state.proxy as object, rootProp)
      const value = obj[prop]
      if (Array.isArray(obj) && typeof value === 'function') {
        if (prop === 'push') {
          return (...items: unknown[]) => {
            const start = (obj as unknown[]).length
            const result = Array.prototype.push.apply(obj, items.map(_raw))
            if ((obj as unknown[]).length > start) {
              _queue(state, rootProp, { type: 'append', start, count: (obj as unknown[]).length - start })
            }
            return result
          }
        }
      }
      return _plain(value) ? _wrap(state, value, rootProp) : value
    },
    set(obj, prop, value) {
      if (typeof prop === 'symbol') {
        obj[prop] = value
        return true
      }
      value = _raw(value)
      const old = obj[prop]
      if (old === value) return true
      obj[prop] = value
      if (Array.isArray(obj)) {
        if (value && typeof value === 'object') (value as Record<symbol, unknown>)[GEA_DIRTY] = true
        const idx = +prop
        if (Number.isInteger(idx)) {
          _queue(state, rootProp, { aipu: true, arix: idx, previousValue: old, newValue: value })
          return true
        }
      } else {
        ;(obj as Record<symbol, unknown>)[GEA_DIRTY] = true
        const dirtyProps = ((obj as Record<symbol, unknown>)[GEA_DIRTY_PROPS] ??= new Set()) as Set<string>
        dirtyProps.add(prop)
      }
      _queue(state, rootProp, { previousValue: old, newValue: value })
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
      _queue(state, rootProp, { previousValue: old, type: 'delete' })
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

export function createLeanProxy<S extends object>(raw: S): S {
  const state: LeanState<S> = {}
  _hidden(raw, _PRIV, state)
  // The trap parameters are spelled out rather than left to `ProxyHandler<T>`'s
  // contextual typing. geatsc plans a parameter from its OWN declaration, so an
  // unannotated trap formal seals no carrier at all (`representation-plan
  // coverage gap for Parameter`) even though the checker knows the contextual
  // type. `receiver` is `object`, not `any`/`unknown` — per the Proxy spec it's
  // always the object the property access was initiated on (the proxy itself,
  // or a subclass instance), never a primitive. `prop`/`value` stay as the
  // genuinely dynamic boundary (whatever the app read or wrote); those are
  // narrowed before use below.
  const proxy = new Proxy(raw, {
    get(target: S, prop: string | symbol, receiver: object) {
      if (prop === GEA_PROXY_RAW) return target
      if (typeof prop === 'symbol') return (target as Record<symbol, unknown>)[prop]
      trackRead(receiver ?? target, prop)
      const value = target[prop as keyof S]
      if (typeof value === 'function') return (value as (...args: unknown[]) => unknown).bind(receiver)
      return _plain(value) ? _wrap(state, value, prop) : value
    },
    set(target: S, prop: string | symbol, value: unknown) {
      if (typeof prop === 'symbol') {
        ;(target as Record<symbol, unknown>)[prop] = value
        return true
      }
      value = _raw(value)
      if (Array.isArray(value)) value = value.map(_raw)
      const old = target[prop as keyof S]
      if (old === value && prop in target) return true
      if (old && typeof old === 'object') delete (old as Record<symbol, unknown>)[_NESTED]
      ;(target as Record<string, unknown>)[prop] = value
      const direct = state.direct?.get(prop)
      if (direct) for (const h of direct) h(value as S[keyof S])
      _queue(state, prop, { previousValue: old, newValue: value })
      return true
    },
  })
  state.proxy = proxy
  _hidden(proxy, _PRIV, state)
  return proxy
}

export function leanObserve<S>(
  self: S | null | undefined,
  pathOrProp: string | readonly string[],
  handler: Handler<S>,
): () => void {
  const state: LeanState<S> | undefined = self == null ? undefined : (self as Record<symbol, LeanState<S>>)[_PRIV]
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
  if (!prop) return () => {}
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
  const target = Object.prototype.hasOwnProperty.call(_raw(self), prop)
    ? (state.observers ?? (state.observers = new Map()))
    : (state.derived ?? (state.derived = new Map()))
  let bucket = target.get(prop)
  if (!bucket) target.set(prop, (bucket = new Set()))
  bucket.add(finalHandler)
  return () => {
    bucket!.delete(finalHandler)
  }
}

export function leanObserveDirect<S>(
  self: S | null | undefined,
  prop: string,
  handler: (value: S[keyof S]) => void,
): () => void {
  const state: LeanState<S> | undefined = self == null ? undefined : (self as Record<symbol, LeanState<S>>)[_PRIV]
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

export class CompiledLeanStore<S extends Record<string, any> = Record<string, any>> {
  constructor() {
    return createLeanProxy(this as unknown as S) as unknown as this
  }

  observe(pathOrProp: string | readonly string[], handler: Handler<S>): () => void {
    return leanObserve(this as unknown as S, pathOrProp, handler)
  }

  [GEA_OBSERVE_DIRECT](prop: string, handler: (value: S[keyof S]) => void): () => void {
    return leanObserveDirect(this as unknown as S, prop, handler)
  }
}

export default CompiledLeanStore
