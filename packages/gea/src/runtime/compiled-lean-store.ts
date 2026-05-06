import { GEA_PROXY_RAW } from './symbols'
import { GEA_OBSERVE_DIRECT } from './internal-symbols'
import { GEA_DIRTY, GEA_DIRTY_PROPS } from './dirty-symbols'
import { trackRead } from './with-tracking'

type Handler = (value: any, changes?: any[]) => void

interface LeanState {
  observers?: Map<string, Set<Handler>>
  rootObservers?: Set<Handler>
  derived?: Map<string, Set<Handler>>
  direct?: Map<string, Set<(value: any) => void>>
  pending?: Map<string, any[]>
  scheduled?: boolean
  ready?: boolean
  proxy?: any
}

const _priv = new WeakMap<any, LeanState>()
const _nested = new WeakMap<object, Map<string, any>>()
const _isArr = Array.isArray

function _plain(v: any): boolean {
  if (!v || typeof v !== 'object') return false
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null || _isArr(v)
}

function _raw(v: any): any {
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

function _flush(state: LeanState): void {
  state.scheduled = false
  const pending = state.pending
  if (!pending || pending.size === 0) return
  state.pending = undefined
  let all: any[] | null = null
  for (const [prop, changes] of pending) {
    if (state.rootObservers || state.derived) {
      all ??= []
      for (let i = 0; i < changes.length; i++) all.push(changes[i])
    }
    const bucket = state.observers?.get(prop)
    if (bucket) _fireBucket(bucket, state.proxy[prop], changes)
  }
  if (all && state.rootObservers) {
    _fireBucket(state.rootObservers, state.proxy, all)
  }
  if (all && state.derived) {
    for (const [prop, bucket] of state.derived) {
      if (bucket.size === 0) continue
      let value
      try {
        value = state.proxy[prop]
      } catch {
        continue
      }
      _fireBucket(bucket, value, all)
    }
  }
}

function _hasQueuedConsumers(state: LeanState, prop: string): boolean {
  const bucket = state.observers?.get(prop)
  return !!(
    (bucket && bucket.size > 0) ||
    (state.rootObservers && state.rootObservers.size > 0) ||
    (state.derived && state.derived.size > 0)
  )
}

function _queue(state: LeanState, prop: string, change: any = {}): void {
  if (!state.ready) return
  if (!_hasQueuedConsumers(state, prop)) return
  const rec = { prop, pathParts: [prop], type: 'update', target: state.proxy, ...change }
  const pending = state.pending ?? (state.pending = new Map())
  const arr = pending.get(prop)
  if (arr) arr.push(rec)
  else pending.set(prop, [rec])
  if (!state.scheduled) {
    state.scheduled = true
    queueMicrotask(() => _flush(state))
  }
}

function _wrap(state: LeanState, target: any, rootProp: string): any {
  if (!_plain(target)) return target
  let perTarget = _nested.get(target)
  if (perTarget) {
    const cached = perTarget.get(rootProp)
    if (cached) return cached
  }
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop === GEA_PROXY_RAW) return obj
      if (typeof prop === 'symbol') return obj[prop as any]
      trackRead(state.proxy, rootProp)
      const value = obj[prop as any]
      if (_isArr(obj) && typeof value === 'function') {
        if (prop === 'push') {
          return (...items: any[]) => {
            const start = obj.length
            const result = Array.prototype.push.apply(obj, items.map(_raw))
            if (obj.length > start) _queue(state, rootProp, { type: 'append', start, count: obj.length - start })
            return result
          }
        }
      }
      return _plain(value) ? _wrap(state, value, rootProp) : value
    },
    set(obj, prop, value) {
      if (typeof prop === 'symbol') {
        obj[prop as any] = value
        return true
      }
      value = _raw(value)
      const old = obj[prop as any]
      if (old === value) return true
      obj[prop as any] = value
      if (_isArr(obj)) {
        if (value && typeof value === 'object') value[GEA_DIRTY] = true
        const idx = +prop
        if (Number.isInteger(idx)) {
          _queue(state, rootProp, { aipu: true, arix: idx, previousValue: old, newValue: value })
          return true
        }
      } else {
        obj[GEA_DIRTY] = true
        ;(obj[GEA_DIRTY_PROPS] ??= new Set()).add(prop)
      }
      _queue(state, rootProp, { previousValue: old, newValue: value })
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
      _queue(state, rootProp, { previousValue: old, type: 'delete' })
      return true
    },
  })
  if (!perTarget) {
    perTarget = new Map()
    _nested.set(target, perTarget)
  }
  perTarget.set(rootProp, proxy)
  return proxy
}

export function createLeanProxy<T extends object>(raw: T): T {
  const state: LeanState = {}
  _priv.set(raw, state)
  const proxy = new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === GEA_PROXY_RAW) return target
      if (typeof prop === 'symbol') return (target as any)[prop]
      trackRead(receiver ?? target, prop)
      const value = (target as any)[prop]
      if (typeof value === 'function') return value.bind(receiver)
      return _plain(value) ? _wrap(state, value, prop) : value
    },
    set(target, prop, value) {
      if (typeof prop === 'symbol') {
        ;(target as any)[prop] = value
        return true
      }
      value = _raw(value)
      if (_isArr(value)) value = value.map(_raw)
      const old = (target as any)[prop]
      if (old === value && prop in target) return true
      if (old && typeof old === 'object') _nested.delete(old)
      ;(target as any)[prop] = value
      const direct = state.direct?.get(prop)
      if (direct) for (const h of direct) h(value)
      _queue(state, prop, { previousValue: old, newValue: value })
      return true
    },
  })
  state.proxy = proxy
  _priv.set(proxy, state)
  return proxy as T
}

export function leanObserve(self: any, pathOrProp: string | readonly string[], handler: Handler): () => void {
  const state = _priv.get(self)
  if (!state) return () => {}
  state.ready = true
  const isArr = Array.isArray(pathOrProp)
  if ((isArr && pathOrProp.length === 0) || pathOrProp === '') {
    const bucket = state.rootObservers ?? (state.rootObservers = new Set())
    bucket.add(handler)
    return () => bucket.delete(handler)
  }
  const prop = isArr ? pathOrProp[0] : pathOrProp
  if (!prop) return () => {}
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
  const target = Object.prototype.hasOwnProperty.call(_raw(self), prop)
    ? (state.observers ?? (state.observers = new Map()))
    : (state.derived ?? (state.derived = new Map()))
  let bucket = target.get(prop)
  if (!bucket) target.set(prop, (bucket = new Set()))
  bucket.add(finalHandler)
  return () => bucket!.delete(finalHandler)
}

export function leanObserveDirect(self: any, prop: string, handler: (value: any) => void): () => void {
  const state = _priv.get(self)
  if (!state) return () => {}
  state.ready = true
  const direct = state.direct ?? (state.direct = new Map())
  let bucket = direct.get(prop)
  if (!bucket) direct.set(prop, (bucket = new Set()))
  bucket.add(handler)
  return () => bucket!.delete(handler)
}

export class CompiledLeanStore {
  constructor() {
    return createLeanProxy(this)
  }

  observe(pathOrProp: string | readonly string[], handler: Handler): () => void {
    return leanObserve(this, pathOrProp, handler)
  }

  [GEA_OBSERVE_DIRECT](prop: string, handler: (value: any) => void): () => void {
    return leanObserveDirect(this, prop, handler)
  }
}

export default CompiledLeanStore
