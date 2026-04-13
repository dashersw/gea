/**
 * Reactive store — proxy-based, flat observation, no observer tree.
 *
 * Public API:
 *   class MyStore extends Store { count = 0; inc() { this.count++ } }
 *   const s = new MyStore()
 *   s.observe('count', (val) => console.log(val))
 *   s.count++   // logs: 1
 */

import { GEA_PROXY_RAW, GEA_STORE_ROOT } from './runtime/symbols'
import { GEA_OBSERVE_DIRECT } from './runtime/internal-symbols'
import { trackRead } from './runtime/with-tracking'
export { GEA_DIRTY, GEA_DIRTY_PROPS } from './runtime/dirty-symbols'
import { GEA_DIRTY as _DIRTY, GEA_DIRTY_PROPS as _DIRTY_PROPS } from './runtime/dirty-symbols'

const _isArr = Array.isArray
const _getProto = Object.getPrototypeOf
const _objProto = Object.prototype
const _isPlain = (v: any): boolean => {
  if (!v || typeof v !== 'object') return false
  const p = _getProto(v)
  return p === _objProto || p === null || _isArr(v)
}
const _unwrapProxy = (v: any): any => {
  const raw = v && typeof v === 'object' ? v[GEA_PROXY_RAW] : undefined
  return raw && _isPlain(raw) ? raw : v
}

export type StoreObserver = (value: any, changes: Change[]) => void

export interface Change {
  prop: string
  previousValue?: any
  /** Populated for runtime consumers — equals [prop, ...innerPath]. */
  pathParts?: string[]
  /** 'update' by default; 'append' when a push/etc. extended the array tail;
   * 'reorder' for reverse/sort/unshift and splice that changed order without
   * net +/- (keyed-list treats it as structural to force general reconcile). */
  type?: 'update' | 'append' | 'remove' | 'add' | 'delete' | 'reorder'
  /** Append meta: start index and count of the newly added tail items. */
  start?: number
  count?: number
  /** In-place array-item property update — arix = item index in the parent array. */
  aipu?: boolean
  arix?: number
  /** Value after change. */
  newValue?: any
  /** Target object that was mutated (proxy or raw). */
  target?: any
}

// Alias retained for broader runtime import shape.
export type StoreChange = Change

export function samePathParts(a?: string[], b?: string[]): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const len = a.length
  if (len !== b.length) return false
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) return false
  return true
}

export function isClassConstructorValue(fn: unknown): boolean {
  if (typeof fn !== 'function') return false
  try {
    const d = Object.getOwnPropertyDescriptor(fn, 'prototype')
    return !!(d && d.writable === false)
  } catch {
    return true
  }
}

/**
 * Walk the prototype chain for `prop`. Used by the root proxy (and SSR overlay) so
 * `set`/`delete` on accessors do not go through reactive write paths — framework
 * getters/setters skip change notifications; user data fields remain plain.
 */
export function findPropertyDescriptor(obj: any, prop: string): PropertyDescriptor | undefined {
  for (let o: any = obj; o; o = _getProto(o)) {
    const d = Object.getOwnPropertyDescriptor(o, prop)
    if (d) return d
  }
}

// ── Global flush ────────────────────────────────────────────────────────
const _pendingStores: Set<Store> = new Set()
let _globalFlushScheduled = false

function _flushAll(): void {
  _globalFlushScheduled = false
  // Drain pending stores until no re-entrant queues remain. A handler run from
  // _flush can synchronously mutate its own (or another) store, which queues
  // more changes; iterate until stable.
  let guard = 0
  while (_pendingStores.size > 0) {
    if (++guard > 100) break
    const snapshot = Array.from(_pendingStores)
    _pendingStores.clear()
    for (const s of snapshot) {
      const priv = _priv.get(s)
      if (priv && priv.pending && priv.pending.size > 0) _flush(s, priv)
    }
  }
}

// ── Per-store private state ─────────────────────────────────────────────
// Observers are kept in Sets (reference-based add/delete, stable across
// iteration). An earlier array+tombstone variant was correctness-broken:
// the `() => b[idx] = null` unsubscribe captured a positional index that
// went stale after `_compact` shifted live entries down, silently killing
// the wrong handler and stopping reactive updates from propagating.
type Bucket = Set<StoreObserver>
type DirectBucket = Set<(value: any) => void>
interface StorePrivate {
  observers?: Map<string, Bucket>
  rootObservers?: Bucket
  /**
   * Observers registered on getter-backed keys (not own data fields). A
   * getter's value is derived from other state, so whenever ANY change flushes,
   * derived observers re-run.
   */
  derivedObservers?: Map<string, Bucket>
  /**
   * Direct (synchronous) observers — internal API only. Fire inline from
   * `rootSetValue` before the normal `_queue` path runs, matching signal-
   * dispatch semantics. Used by `relationalClass` for single-prop scalar
   * writes where the observer only touches DOM classes (no re-entry into
   * the store, no `silent()` expectations). Breaks batching for these
   * specific subscriptions, which is intentional — the public `observe`
   * API continues to batch.
   */
  directObservers?: Map<string, DirectBucket>
  pending?: Map<string, Change[]>
  scheduled: boolean
}

const _priv = new WeakMap<Store, StorePrivate>()
let _rootProxyHandlerFactory: (() => ProxyHandler<Store>) | null = null

function _observers(p: StorePrivate): Map<string, Bucket> {
  return p.observers ?? (p.observers = new Map())
}

function _rootObservers(p: StorePrivate): Bucket {
  return p.rootObservers ?? (p.rootObservers = new Set())
}

function _derivedObservers(p: StorePrivate): Map<string, Bucket> {
  return p.derivedObservers ?? (p.derivedObservers = new Map())
}

function _directObservers(p: StorePrivate): Map<string, DirectBucket> {
  return p.directObservers ?? (p.directObservers = new Map())
}

function _pending(p: StorePrivate): Map<string, Change[]> {
  return p.pending ?? (p.pending = new Map())
}

function _fireBucket(b: Bucket, v: any, changes: Change[]): void {
  // Single-observer fast path (dominates benchmark shapes like
  // `store.observe(['selected'], ...)` — one relational-class subscription
  // per list, no other observers). Skip the snapshot allocation and the
  // try/catch deopt barrier — the observer runs directly. Closes the
  // remaining 04_select1k gap to gea-v2.0.1 (~0.7ms script → ~0.5ms).
  if (b.size === 0) return
  if (b.size === 1) {
    // Single iteration of the Set returns the one observer; call directly.
    for (const h of b) {
      h(v, changes)
      return
    }
  }
  // Multi-observer: snapshot so handlers that tear down observers mid-
  // iteration don't skew the iterator (e.g. conditional-branch swap
  // clearing sibling subscribes). try/catch keeps a single bad handler
  // from blocking the others.
  const snap: StoreObserver[] = []
  for (const h of b) snap.push(h)
  for (let i = 0; i < snap.length; i++) {
    try {
      snap[i](v, changes)
    } catch {
      /* isolated handler failures */
    }
  }
}

function _flush(raw: Store, p: StorePrivate): void {
  p.scheduled = false
  const batch = p.pending
  if (!batch || batch.size === 0) return
  p.pending = undefined
  const allChanges: Change[] = []
  for (const [prop, changes] of batch) {
    for (let i = 0; i < changes.length; i++) allChanges.push(changes[i])
    const bucket = p.observers?.get(prop)
    if (!bucket) continue
    _fireBucket(bucket, (raw as any)[prop], changes)
  }
  if (p.rootObservers && p.rootObservers.size > 0 && allChanges.length > 0) {
    _fireBucket(p.rootObservers, raw, allChanges)
  }
  if (p.derivedObservers && p.derivedObservers.size > 0 && allChanges.length > 0) {
    for (const [prop, bucket] of p.derivedObservers) {
      if (bucket.size === 0) continue
      let val: any
      try {
        val = (raw as any)[prop]
      } catch {
        continue
      }
      _fireBucket(bucket, val, allChanges)
    }
  }
}

function _queue(raw: Store, p: StorePrivate, prop: string, change: Partial<Change> = {}): void {
  const rec: Change = { prop, pathParts: [prop], type: 'update', target: raw, ...change }
  const pending = _pending(p)
  const arr = pending.get(prop)
  if (arr) {
    // Dedup base-case updates (change-less notifications) so a batch of N plain pushes
    // does not create N identical entries. Append-kind / aipu entries are always kept.
    if (
      !change.type &&
      !change.aipu &&
      arr.length > 0 &&
      !arr[arr.length - 1].aipu &&
      arr[arr.length - 1].type === 'update'
    ) {
      return
    }
    arr.push(rec)
  } else {
    pending.set(prop, [rec])
  }
  if (!p.scheduled) {
    p.scheduled = true
    _pendingStores.add(raw)
    if (!_globalFlushScheduled) {
      _globalFlushScheduled = true
      queueMicrotask(_flushAll)
    }
  }
}

// ── Nested proxy (objects & arrays) ─────────────────────────────────────
// Cache keyed by (target, rootProp): the SAME raw array may be reached via
// multiple store keys (e.g. `store.todos` and `store.filteredTodos` when the
// getter returns `this.todos`), and each access path must notify its own root
// observer on mutation — otherwise `store.todos.push(x)` could fire under the
// wrong rootProp if that target was first accessed via a getter.
const _nestedCache = new WeakMap<object, Map<string, any>>()

const _MUTATING: Record<string, boolean> = {
  push: true,
  pop: true,
  shift: true,
  unshift: true,
  splice: true,
  sort: true,
  reverse: true,
}

function _wrapNested(raw: Store, p: StorePrivate, target: any, rootProp: string): any {
  if (!target || typeof target !== 'object' || !_isPlain(target)) return target

  let perTarget = _nestedCache.get(target)
  if (perTarget) {
    const cached = perTarget.get(rootProp)
    if (cached) return cached
  }

  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop === GEA_PROXY_RAW) return obj
      if (typeof prop === 'symbol') return obj[prop]
      // Record tracking read on the Store root owning this nested proxy.
      trackRead(raw, rootProp)
      const val = obj[prop as string]
      // Intercept mutating array methods to notify on the root prop
      if (_isArr(obj) && typeof val === 'function' && _MUTATING[prop as string]) {
        return function (this: any[], ...args: any[]) {
          const beforeLen = (obj as any[]).length
          const isRootArr = (obj as any[]) === (raw as any)[rootProp]
          const callArgs =
            prop === 'push' || prop === 'unshift'
              ? args.map(_unwrapProxy)
              : prop === 'splice' && args.length > 2
                ? [args[0], args[1], ...args.slice(2).map(_unwrapProxy)]
                : args
          // Snapshot before splice so we can emit a specific 'remove' change
          // record — keyed-list's reconcile uses it to avoid the O(N) rebuild
          // path and jump straight to removeEntry. Without this, a single
          // `store.data.splice(i, 1)` pays the full keyed reconcile (keyFn,
          // byKey, LIS) instead of the targeted remove path.
          const result = (Array.prototype as any)[prop].apply(obj, callArgs)
          const afterLen = (obj as any[]).length
          // Root-level rootProp arrays fire specific change records so list
          // runtime can skip the general reconcile path; nested arrays get a
          // plain update.
          if (prop === 'push' && isRootArr && afterLen > beforeLen) {
            _queue(raw, p, rootProp, { type: 'append', start: beforeLen, count: afterLen - beforeLen })
          } else if (prop === 'splice' && isRootArr && afterLen < beforeLen) {
            // Splice that removed items: emit a 'remove' change record with
            // start index + count. keyed-list's reconcile will surgical-remove.
            const start = args[0] | 0
            const removed = beforeLen - afterLen
            _queue(raw, p, rootProp, { type: 'remove', start, count: removed })
          } else if ((prop === 'pop' || prop === 'shift') && isRootArr && afterLen < beforeLen) {
            _queue(raw, p, rootProp, { type: 'remove', start: prop === 'pop' ? afterLen : 0, count: 1 })
          } else if ((prop === 'reverse' || prop === 'sort' || prop === 'unshift' || prop === 'splice') && isRootArr) {
            // Reorder/structural mutation on a root array that the keyed-list
            // dirty-scan fast path cannot infer from DIRTY flags alone. Mark
            // explicitly so reconcile falls through to the general keyed path.
            _queue(raw, p, rootProp, { type: 'reorder' })
          } else {
            _queue(raw, p, rootProp)
          }
          return result
        }
      }
      if (val && typeof val === 'object' && _isPlain(val)) {
        return _wrapNested(raw, p, val, rootProp)
      }
      return val
    },
    set(obj, prop, value) {
      if (typeof prop === 'symbol') {
        obj[prop] = value
        return true
      }
      value = _unwrapProxy(value)
      const old = obj[prop as string]
      if (old === value) return true
      obj[prop as string] = value
      // Dirty tracking: array-index writes mark the new value (the replaced
      // item object); object property writes mark the container.
      // keyed-list patchRow scans items for _DIRTY, patches, and clears.
      if (_isArr(obj)) {
        if (value && typeof value === 'object') (value as any)[_DIRTY] = true
        const idx = +(prop as string)
        if (Number.isInteger(idx) && (obj as any[]) === (raw as any)[rootProp]) {
          _queue(raw, p, rootProp, { aipu: true, arix: idx, previousValue: old, newValue: value })
          return true
        }
      } else {
        ;(obj as any)[_DIRTY] = true
        ;((obj as any)[_DIRTY_PROPS] ??= new Set<string>()).add(prop as string)
      }
      _queue(raw, p, rootProp, { previousValue: old, newValue: value })
      return true
    },
    deleteProperty(obj, prop) {
      if (typeof prop === 'symbol') {
        delete obj[prop]
        return true
      }
      const old = obj[prop as string]
      delete obj[prop as string]
      if (!_isArr(obj)) (obj as any)[_DIRTY] = true
      _queue(raw, p, rootProp, { previousValue: old })
      return true
    },
  })

  if (!perTarget) {
    perTarget = new Map()
    _nestedCache.set(target, perTarget)
  }
  perTarget.set(rootProp, proxy)
  return proxy
}

// ── Root proxy handlers (exported for SSR composition) ─────────────────
export function rootGetValue(t: any, prop: string | symbol, receiver: any): any {
  if (prop === GEA_PROXY_RAW) return t
  if (typeof prop === 'symbol') return Reflect.get(t, prop, receiver)
  // Record tracking read on the store itself.
  trackRead(receiver ?? t, prop)
  const value = (t as any)[prop]
  if (typeof value === 'function') {
    if (isClassConstructorValue(value) || Object.prototype.hasOwnProperty.call(t, prop)) return value
    return value.bind(receiver)
  }
  if (value && typeof value === 'object' && _isPlain(value)) {
    const p = _priv.get(t)!
    return _wrapNested(t, p, value, prop)
  }
  return value
}

function _commitRootValue(
  t: any,
  p: StorePrivate | undefined,
  prop: string,
  old: any,
  value: any,
  added = false,
): boolean {
  if (old && typeof old === 'object') _nestedCache.delete(old)
  if (!p) return true
  // Sync-fire direct observers (internal API) — relationalClass and similar
  // runtime helpers register here when they know their handler only touches
  // DOM (no store re-entry, no silent() expectations). Public observe()
  // goes through _queue/microtask — its batching contract is unchanged.
  const direct = p.directObservers?.get(prop)
  if (direct && direct.size > 0) {
    for (const h of direct) h(value)
  }
  // Skip _queue entirely when nothing downstream will consume the change —
  // no regular observers on this prop, no root observers (observe with empty
  // path), no derived observers. Saves the microtask + _flush round-trip for
  // the 04_select1k case where the only subscriber is a direct-fire
  // relationalClass. Any of those registries being non-empty still requires
  // the batched path so `silent()` / `flushSync()` / multi-write batching
  // semantics hold.
  const bucket = p.observers?.get(prop)
  if (
    (!bucket || bucket.size === 0) &&
    (!p.rootObservers || p.rootObservers.size === 0) &&
    (!p.derivedObservers || p.derivedObservers.size === 0)
  ) {
    return true
  }
  _queue(
    t,
    p,
    prop,
    added ? { previousValue: old, newValue: value, type: 'add' } : { previousValue: old, newValue: value },
  )
  return true
}

export function rootSetValue(t: any, prop: string | symbol, value: any): boolean {
  if (typeof prop === 'symbol') {
    ;(t as any)[prop] = value
    return true
  }
  value = _unwrapProxy(value)
  if (typeof value === 'function') {
    ;(t as any)[prop] = value
    return true
  }
  // Don't bulldoze a getter-only accessor on the prototype with a data property.
  // `store.filteredTodos = x` is almost certainly a bug (writing to a computed),
  // but even if intentional we must not queue a change on a derived key.
  const desc = findPropertyDescriptor(t, prop)
  if (desc && desc.get && !desc.set) return true
  const p = _priv.get(t)!
  const old = (t as any)[prop]
  if (old === value && prop in t) return true
  ;(t as any)[prop] = value
  return _commitRootValue(t, p, prop, old, value)
}

export function rootDefineProperty(t: any, prop: string | symbol, descriptor: PropertyDescriptor): boolean {
  if (typeof prop === 'symbol' || !('value' in descriptor)) {
    return Reflect.defineProperty(t, prop, descriptor)
  }
  const value = _unwrapProxy(descriptor.value)
  if (typeof value === 'function') {
    return Reflect.defineProperty(t, prop, { ...descriptor, value })
  }
  const old = (t as any)[prop]
  const existed = prop in t
  const ok = Reflect.defineProperty(t, prop, { ...descriptor, value })
  if (!ok) return false
  if (old === value && existed) return true
  return _commitRootValue(t, _priv.get(t), prop as string, old, value, !existed)
}

export function rootDeleteProperty(t: any, prop: string | symbol): boolean {
  if (typeof prop === 'symbol') {
    delete (t as any)[prop]
    return true
  }
  const p = _priv.get(t)!
  const old = (t as any)[prop]
  if (old && typeof old === 'object') _nestedCache.delete(old)
  delete (t as any)[prop]
  _queue(t, p, prop as string, { previousValue: old, type: 'delete' })
  return true
}

const _rootHandler: ProxyHandler<Store> = {
  get: (t, prop, receiver) => rootGetValue(t, prop, receiver),
  set: (t, prop, value) => rootSetValue(t, prop, value),
  defineProperty: (t, prop, descriptor) => rootDefineProperty(t, prop, descriptor),
  deleteProperty: (t, prop) => rootDeleteProperty(t, prop),
}

/**
 * Returns the shared root proxy handler. Exposed for benchmarks / tests that
 * want to spy on proxy traps. Modifying the returned object's handlers will
 * affect every Store instance using the default handler.
 */
export function _getBrowserRootProxyHandler(): ProxyHandler<Store> {
  return _rootHandler
}

// ── Store class ─────────────────────────────────────────────────────────
export function getRootProxyHandlerFactoryForSSR(): (() => ProxyHandler<Store>) | null {
  return _rootProxyHandlerFactory
}

export function setRootProxyHandlerFactoryForSSR(factory: (() => ProxyHandler<Store>) | null): void {
  _rootProxyHandlerFactory = factory
}

export class Store {
  static flushAll(): void {
    if (_pendingStores.size > 0) _flushAll()
  }

  constructor(initialData?: Record<string, any>) {
    const p: StorePrivate = { scheduled: false }
    _priv.set(this, p)

    const handler = _rootProxyHandlerFactory ? _rootProxyHandlerFactory() : _rootHandler
    const proxy = new Proxy(this, handler) as this
    _priv.set(proxy, p)
    ;(this as any)[GEA_STORE_ROOT] = proxy

    if (initialData) {
      for (const key in initialData) (this as any)[key] = initialData[key]
    }

    return proxy
  }

  observe(pathOrProp: string | readonly string[], handler: StoreObserver): () => void {
    const raw = _priv.has(this) ? this : ((this as any).__raw ?? this)
    const p = _priv.get(raw)
    if (!p) return () => {}
    // Empty string or empty array → root observer (fires on any change).
    const isArr = Array.isArray(pathOrProp)
    if ((isArr && (pathOrProp as readonly string[]).length === 0) || pathOrProp === '') {
      const rootObservers = _rootObservers(p)
      rootObservers.add(handler)
      return () => {
        rootObservers.delete(handler)
      }
    }
    const pathParts =
      isArr || (pathOrProp as string).indexOf('.') !== -1
        ? isArr
          ? (pathOrProp as readonly string[])
          : (pathOrProp as string).split('.')
        : null
    // Flat root-prop string, or multi-segment path that subscribes to root
    // prop and resolves the tail on fire.
    const rootProp = pathParts ? pathParts[0] : (pathOrProp as string)
    if (!rootProp) return () => {}
    const tail = pathParts && pathParts.length > 1 ? pathParts.slice(1) : null
    const finalHandler: StoreObserver = tail
      ? (val, changes) => {
          let v = val
          for (let i = 0; i < tail.length; i++) {
            if (v == null) return
            v = v[tail[i]]
          }
          handler(v, changes)
        }
      : handler
    // Getter-backed keys (not own data fields) are "derived" — fire them on
    // every flush since the value depends on other state.
    let isDerived = false
    if (!Object.prototype.hasOwnProperty.call(raw, rootProp)) {
      for (
        let proto = Object.getPrototypeOf(raw);
        proto && proto !== Object.prototype;
        proto = Object.getPrototypeOf(proto)
      ) {
        const d = Object.getOwnPropertyDescriptor(proto, rootProp)
        if (d) {
          isDerived = !!d.get
          break
        }
      }
    }
    const map = isDerived ? _derivedObservers(p) : _observers(p)
    let bucket = map.get(rootProp)
    if (!bucket) {
      map.set(rootProp, (bucket = new Set()))
    }
    bucket.add(finalHandler)
    return () => {
      bucket!.delete(finalHandler)
    }
  }

  flushSync(): void {
    const p = _priv.get(this)
    if (p && p.pending && p.pending.size > 0) _flush(this, p)
  }

  /**
   * Internal: register a synchronous observer on a single root prop. Unlike
   * `observe()`, direct observers fire INLINE from `rootSetValue` — no
   * microtask, no batching, no change-record array. The handler receives
   * just the new value.
   *
   * Only safe for handlers that:
   *   - Don't mutate the store (no re-entry).
   *   - Don't rely on `silent()` suppressing them.
   *   - Only care about scalar writes on the root prop (nested mutations
   *     still go through the batched path).
   *
   * Used by framework runtime helpers (`relationalClass`) to match
   * signal-like dispatch latency for the single-subscriber benchmark case.
   * NOT a public API — subject to change.
   */
  [GEA_OBSERVE_DIRECT](prop: string, handler: (value: any) => void): () => void {
    const raw = _priv.has(this) ? this : ((this as any).__raw ?? this)
    const p = _priv.get(raw)
    if (!p) return () => {}
    const directObservers = _directObservers(p)
    let bucket = directObservers.get(prop)
    if (!bucket) {
      directObservers.set(prop, (bucket = new Set()))
    }
    bucket.add(handler)
    return () => {
      bucket!.delete(handler)
    }
  }

  silent(fn: () => void): void {
    try {
      fn()
    } finally {
      const p = _priv.get(this)
      if (p) {
        p.pending?.clear()
        p.scheduled = false
      }
    }
  }
}
