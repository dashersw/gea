import { GEA_PROXY_RAW, GEA_STORE_ROOT } from './symbols'
import { GEA_OBSERVE_DIRECT } from './internal-symbols'
import { GEA_DIRTY, GEA_DIRTY_PROPS } from './dirty-symbols'
import { trackRead } from './with-tracking'

type Handler = (value: any, changes?: any[]) => void

interface StoreState {
  observers?: Map<string, Set<Handler>>
  rootObservers?: Set<Handler>
  derived?: Map<string, Set<Handler>>
  direct?: Map<string, Set<(value: any) => void>>
  pending?: Map<string, any[]>
  scheduled?: boolean
  ready?: boolean
}

const _priv = new WeakMap<any, StoreState>()
const _nestedCache = new WeakMap<object, Map<string, any>>()
const _isArr = Array.isArray

function _isPlain(v: any): boolean {
  if (!v || typeof v !== 'object') return false
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null || _isArr(v)
}

function _unwrap(v: any): any {
  return (v && v[GEA_PROXY_RAW]) || v
}

function _fireBucket(bucket: Set<Handler>, value: any, changes: any[]): void {
  if (bucket.size === 0) return
  if (bucket.size === 1) {
    for (const h of bucket) {
      h(value, changes)
      return
    }
  }
  const snapshot: Handler[] = []
  for (const h of bucket) snapshot.push(h)
  for (let i = 0; i < snapshot.length; i++) {
    try {
      snapshot[i](value, changes)
    } catch {
      /* isolate sibling observers */
    }
  }
}

function _flush(raw: any, state: StoreState): void {
  state.scheduled = false
  const pending = state.pending
  if (!pending || pending.size === 0) return
  state.pending = undefined
  let allChanges: any[] | null = null
  for (const [prop, changes] of pending) {
    if (state.rootObservers || state.derived) {
      allChanges ??= []
      for (let i = 0; i < changes.length; i++) allChanges.push(changes[i])
    }
    const bucket = state.observers?.get(prop)
    if (!bucket || bucket.size === 0) continue
    _fireBucket(bucket, raw[prop], changes)
  }
  if (allChanges && state.rootObservers) {
    _fireBucket(state.rootObservers, raw, allChanges)
  }
  if (allChanges && state.derived) {
    for (const [prop, bucket] of state.derived) {
      if (bucket.size === 0) continue
      let value: any
      try {
        value = raw[prop]
      } catch {
        continue
      }
      _fireBucket(bucket, value, allChanges)
    }
  }
}

function _hasQueuedConsumers(state: StoreState, prop: string): boolean {
  const bucket = state.observers?.get(prop)
  return !!(
    (bucket && bucket.size > 0) ||
    (state.rootObservers && state.rootObservers.size > 0) ||
    (state.derived && state.derived.size > 0)
  )
}

function _queue(raw: any, state: StoreState, prop: string, change: any = {}): void {
  if (!state.ready || !_hasQueuedConsumers(state, prop)) return
  const rec = { prop, pathParts: [prop], type: 'update', target: raw, ...change }
  const pending = state.pending ?? (state.pending = new Map())
  const arr = pending.get(prop)
  if (arr) arr.push(rec)
  else pending.set(prop, [rec])
  if (!state.scheduled) {
    state.scheduled = true
    queueMicrotask(() => _flush(raw, state))
  }
}

function _wrapNested(raw: any, state: StoreState, target: any, rootProp: string): any {
  if (!_isPlain(target)) return target
  let perTarget = _nestedCache.get(target)
  if (perTarget) {
    const cached = perTarget.get(rootProp)
    if (cached) return cached
  }
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop === GEA_PROXY_RAW) return obj
      if (typeof prop === 'symbol') return obj[prop as any]
      trackRead(raw, rootProp)
      const val = obj[prop as any]
      if (_isArr(obj) && typeof val === 'function') {
        if (prop === 'push') {
          return (...args: any[]) => {
            const start = obj.length
            const result = Array.prototype.push.apply(obj, args.map(_unwrap))
            if (obj === raw[rootProp] && obj.length > start) {
              _queue(raw, state, rootProp, { type: 'append', start, count: obj.length - start })
            } else {
              _queue(raw, state, rootProp)
            }
            return result
          }
        }
        if (prop === 'splice') {
          return (...args: any[]) => {
            const before = obj.length
            const start = args[0] | 0
            const result = Array.prototype.splice.apply(
              obj,
              args.length > 2 ? [args[0], args[1], ...args.slice(2).map(_unwrap)] : args,
            )
            if (obj === raw[rootProp]) {
              const after = obj.length
              if (after < before) _queue(raw, state, rootProp, { type: 'remove', start, count: before - after })
              else _queue(raw, state, rootProp, { type: 'reorder' })
            } else {
              _queue(raw, state, rootProp)
            }
            return result
          }
        }
        if (prop === 'pop' || prop === 'shift') {
          return (...args: any[]) => {
            const before = obj.length
            const result = (Array.prototype as any)[prop].apply(obj, args)
            const after = obj.length
            if (obj === raw[rootProp] && after < before) {
              _queue(raw, state, rootProp, { type: 'remove', start: prop === 'pop' ? after : 0, count: 1 })
            } else {
              _queue(raw, state, rootProp)
            }
            return result
          }
        }
        if (prop === 'unshift' || prop === 'sort' || prop === 'reverse') {
          return (...args: any[]) => {
            const callArgs = prop === 'unshift' ? args.map(_unwrap) : args
            const result = (Array.prototype as any)[prop].apply(obj, callArgs)
            if (obj === raw[rootProp]) {
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
        obj[prop as any] = value
        return true
      }
      value = _unwrap(value)
      const old = obj[prop as any]
      if (old === value) return true
      obj[prop as any] = value
      if (_isArr(obj)) {
        if (value && typeof value === 'object') value[GEA_DIRTY] = true
        const idx = +prop
        if (Number.isInteger(idx) && obj === raw[rootProp]) {
          _queue(raw, state, rootProp, { aipu: true, arix: idx, previousValue: old, newValue: value })
          return true
        }
      } else {
        obj[GEA_DIRTY] = true
        ;(obj[GEA_DIRTY_PROPS] ??= new Set()).add(prop)
      }
      _queue(raw, state, rootProp, { previousValue: old, newValue: value })
      return true
    },
    deleteProperty(obj, prop) {
      if (typeof prop === 'symbol') {
        delete obj[prop as any]
        return true
      }
      const old = obj[prop as any]
      delete obj[prop as any]
      if (!_isArr(obj)) obj[GEA_DIRTY] = true
      _queue(raw, state, rootProp, { previousValue: old, type: 'delete' })
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

export class CompiledStore {
  constructor() {
    const state: StoreState = { ready: false }
    _priv.set(this, state)
    const proxy = new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === GEA_PROXY_RAW) return target
        if (typeof prop === 'symbol') return (target as any)[prop]
        trackRead(receiver ?? target, prop)
        const value = (target as any)[prop]
        if (typeof value === 'function') return value.bind(receiver)
        return _isPlain(value) ? _wrapNested(target, state, value, prop) : value
      },
      set(target, prop, value) {
        if (typeof prop === 'symbol') {
          ;(target as any)[prop] = value
          return true
        }
        value = _unwrap(value)
        const old = (target as any)[prop]
        if (old === value && prop in target) {
          if (_isArr(value)) _queue(target, state, prop, { previousValue: old, newValue: value })
          return true
        }
        if (old && typeof old === 'object') _nestedCache.delete(old)
        ;(target as any)[prop] = value
        const direct = state.direct?.get(prop)
        if (direct) for (const h of direct) h(value)
        _queue(target, state, prop, { previousValue: old, newValue: value })
        return true
      },
    })
    _priv.set(proxy, state)
    ;(this as any)[GEA_STORE_ROOT] = proxy
    return proxy
  }

  observe(pathOrProp: string | readonly string[], handler: Handler): () => void {
    const state = _priv.get(this)
    if (!state) return () => {}
    state.ready = true
    const isArr = Array.isArray(pathOrProp)
    if ((isArr && pathOrProp.length === 0) || pathOrProp === '') {
      const bucket = state.rootObservers ?? (state.rootObservers = new Set())
      bucket.add(handler)
      return () => bucket.delete(handler)
    }
    const prop = isArr ? pathOrProp[0] : pathOrProp
    const tail = isArr && pathOrProp.length > 1 ? pathOrProp.slice(1) : null
    const finalHandler: Handler = tail
      ? (value, changes) => {
          let next = value
          for (let i = 0; i < tail.length; i++) {
            if (next == null) return
            next = next[tail[i]]
          }
          handler(next, changes)
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
    return () => bucket!.delete(finalHandler)
  }

  [GEA_OBSERVE_DIRECT](prop: string, handler: (value: any) => void): () => void {
    const state = _priv.get(this)
    if (!state) return () => {}
    state.ready = true
    const direct = state.direct ?? (state.direct = new Map())
    let bucket = direct.get(prop)
    if (!bucket) direct.set(prop, (bucket = new Set()))
    bucket.add(handler)
    return () => bucket!.delete(handler)
  }
}

export default CompiledStore
