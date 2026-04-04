import { tryComponentRootBridgeGet, tryComponentRootBridgeSet } from './component-root-bridge'
import {
  GEA_SELF_PROXY,
  GEA_STORE_ROOT,
  GEA_STORE_ADD_OBSERVER,
  GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT,
  GEA_STORE_CLEAR_ARRAY_INDEX_CACHE,
  GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES,
  GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES,
  GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES_FROM_NODE,
  GEA_STORE_CREATE_PROXY,
  GEA_STORE_DELIVER_ARRAY_ITEM_PROP_BATCH,
  GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH,
  GEA_STORE_DELIVER_TOP_LEVEL_BATCH,
  GEA_STORE_EMIT_CHANGES,
  GEA_STORE_FLUSH_CHANGES,
  GEA_STORE_GET_CACHED_ARRAY_META,
  GEA_STORE_GET_BROWSER_ROOT_PROXY_HANDLER_FOR_TESTS,
  GEA_PROXY_GET_PATH,
  GEA_PROXY_GET_RAW_TARGET,
  GEA_PROXY_GET_TARGET,
  GEA_PROXY_IS_PROXY,
  GEA_PROXY_RAW,
  GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE,
  GEA_STORE_GET_OBSERVER_NODE,
  GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE,
  GEA_STORE_INTERCEPT_ARRAY_ITERATOR,
  GEA_STORE_INTERCEPT_ARRAY_METHOD,
  GEA_STORE_NORMALIZE_BATCH,
  GEA_STORE_NOTIFY_HANDLERS,
  GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE,
  GEA_STORE_QUEUE_CHANGE,
  GEA_STORE_QUEUE_DIRECT_ARRAY_ITEM_PRIMITIVE_CHANGE,
  GEA_STORE_SCHEDULE_FLUSH,
  GEA_STORE_TRACK_PENDING_CHANGE,
} from './symbols'

export interface StoreChange {
  type: string
  property: string
  target: any
  pathParts: string[]
  newValue?: any
  previousValue?: any
  start?: number
  count?: number
  permutation?: number[]
  arrayPathParts?: string[]
  arrayIndex?: number
  leafPathParts?: string[]
  isArrayItemPropUpdate?: boolean
  arrayOp?: string
  otherIndex?: number
  opId?: string
}

export type StoreObserver = (value: any, changes: StoreChange[]) => void

interface ObserverNode {
  pathParts: string[]
  handlers: Set<StoreObserver>
  children: Map<string, ObserverNode>
}

interface ArrayProxyMeta {
  arrayPathParts: string[]
  arrayIndex: number
  baseTail: string[]
}

function createObserverNode(pathParts: string[]): ObserverNode {
  return {
    pathParts,
    handlers: new Set(),
    children: new Map(),
  }
}

/** Engine-room state keyed by raw Store — never on the public proxy — so root `get` can bind `this` to the proxy. */
interface StoreInstancePrivate {
  selfProxy: Store | undefined
  pendingChanges: StoreChange[]
  pendingChangesPool: StoreChange[]
  flushScheduled: boolean
  nextArrayOpId: number
  observerRoot: ObserverNode
  proxyCache: WeakMap<any, any>
  arrayIndexProxyCache: WeakMap<any, Map<string, any>>
  internedArrayPaths: Map<string, string[]>
  topLevelProxies: Map<string, [raw: any, proxy: any]>
  pathPartsCache: Map<string, string[]>
  pendingBatchKind: 0 | 1 | 2
  pendingBatchArrayPathParts: string[] | null
}

const storeInstancePrivate = new WeakMap<Store, StoreInstancePrivate>()

function storeRaw(st: Store): Store {
  return ((st as any)[GEA_PROXY_GET_RAW_TARGET] ?? (st as any)[GEA_PROXY_RAW] ?? st) as Store
}

function unwrapNestedProxyValue(value: any): any {
  if (value && typeof value === 'object' && value[GEA_PROXY_IS_PROXY]) {
    const raw = value[GEA_PROXY_GET_TARGET]
    if (raw !== undefined) return raw
  }
  return value
}

function getPriv(st: Store): StoreInstancePrivate {
  return storeInstancePrivate.get(storeRaw(st))!
}

function splitPath(path: string | string[]): string[] {
  if (Array.isArray(path)) return path
  return path ? path.split('.') : []
}

function appendPathParts(pathParts: string[], propStr: string): string[] {
  return pathParts.length > 0 ? [...pathParts, propStr] : [propStr]
}

/** Same rule as rootGetValue: only plain objects and arrays get nested reactive proxies. */
function shouldWrapNestedReactiveValue(value: any): boolean {
  if (value == null || typeof value !== 'object') return false
  if (Array.isArray(value)) return true
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function getByPathParts(obj: any, pathParts: string[]): any {
  let current = obj
  for (let i = 0; i < pathParts.length; i++) {
    if (current == null) return undefined
    current = current[pathParts[i]]
  }
  return current
}

function proxyIterate(
  arr: any[],
  basePath: string,
  baseParts: string[],
  mkProxy: (target: any, basePath: string, baseParts: string[]) => any,
  method: string,
  cb: Function,
  thisArg?: any,
): any {
  const isMap = method === 'map'
  const result: any = isMap ? new Array(arr.length) : method === 'filter' ? [] : undefined
  for (let i = 0; i < arr.length; i++) {
    const nextPath = basePath ? `${basePath}.${i}` : String(i)
    const raw = arr[i]
    const p = shouldWrapNestedReactiveValue(raw) ? mkProxy(raw, nextPath, appendPathParts(baseParts, String(i))) : raw
    const v = cb.call(thisArg, p, i, arr)
    if (isMap) {
      result[i] = v
    } else if (v) {
      if (method === 'filter') {
        result.push(p)
      } else if (method === 'some') return true
      else if (method === 'find') return p
      else if (method === 'findIndex') return i
    } else if (method === 'every') return false
  }
  if (method === 'some') return false
  if (method === 'every') return true
  if (method === 'findIndex') return -1
  return result
}

function isNumericIndex(value: string): boolean {
  const len = value.length
  if (len === 0) return false
  for (let i = 0; i < len; i++) {
    const c = value.charCodeAt(i)
    if (c < 48 || c > 57) return false
  }
  return true
}

function samePathParts(a: string[], b: string[]): boolean {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** `class C {}` values must not be `.bind()`'d on the root proxy — breaks `===` with route components. */
export function isClassConstructorValue(fn: unknown): boolean {
  if (typeof fn !== 'function') return false
  const proto = (fn as Function).prototype
  // Vite HMR wraps component classes in a Proxy; `prototype.constructor` is the real class, not the proxy.
  if (proto && typeof proto === 'object') {
    const ctor = (proto as { constructor?: unknown }).constructor
    if (typeof ctor === 'function' && ctor !== fn) {
      try {
        const d = Object.getOwnPropertyDescriptor(ctor, 'prototype')
        if (d && d.writable === false) return true
      } catch {
        /* ignore */
      }
    }
  }
  if (!proto || (proto as { constructor?: unknown }).constructor !== fn) return false
  try {
    const desc = Object.getOwnPropertyDescriptor(fn, 'prototype')
    // ES2015+ class constructors have a non-writable `prototype` (unlike `function` declarations).
    if (desc && desc.writable === false) return true
  } catch {
    // HMR Proxy + forwarding getOwnPropertyDescriptor can violate invariants and throw — fall through.
  }
  // Bundlers may lower `class` so the string no longer starts with "class"; keep as fallback only.
  return /^\s*class\s/.test(Function.prototype.toString.call(fn))
}

function isArrayIndexUpdate(change: StoreChange): boolean {
  return change && change.type === 'update' && Array.isArray(change.target) && isNumericIndex(change.property)
}

function isReciprocalSwap(a: StoreChange, b: StoreChange): boolean {
  if (!isArrayIndexUpdate(a) || !isArrayIndexUpdate(b)) return false
  if (a.target !== b.target || a.property === b.property) return false
  if (!samePathParts(a.pathParts.slice(0, -1), b.pathParts.slice(0, -1))) return false
  return a.previousValue === b.newValue && b.previousValue === a.newValue
}

/**
 * Walk the prototype chain for `prop` (same as Reflect.get semantics for accessors).
 * Used by the root proxy and SSR so `set`/`delete` on accessors do not go through
 * reactive `rootSetValue`/`rootDeleteProperty` (no change notifications for framework
 * getters/setters; user data fields remain plain data properties).
 */
export function findPropertyDescriptor(obj: any, prop: string): PropertyDescriptor | undefined {
  let o: any = obj
  while (o) {
    const d = Object.getOwnPropertyDescriptor(o, prop)
    if (d) return d
    o = Object.getPrototypeOf(o)
  }
  return undefined
}

/**
 * Top-level string keys that must not be wrapped in reactive proxies at the store root.
 * Engine state for components lives in WeakMaps / symbol keys; symbol keys are never wrapped.
 */
const SKIP_REACTIVE_WRAP_AT_ROOT = new Set<string>([
  'props',
  'events',
  /** Backing array for compiler / __observeList keyed rows (holds Component instances; identity must stay raw). */
  'compiledItems',
  '_routerDepth',
  '_router',
  '_routesApplied',
  '_currentComponentClass',
  /** Layout constructors; must not be proxied/bound when read via router.getComponentAtDepth */
  '_layouts',
  // Compiler/list helpers often use `_items` as the backing array for __observeList (legacy name).
  '_items',
])

function topPathSegment(path: string): string {
  const dot = path.indexOf('.')
  return dot === -1 ? path : path.slice(0, dot)
}

/**
 * Nested paths that must not be wrapped in reactive proxies (delegated event maps,
 * compiler-generated plain objects, etc.).
 */
function shouldSkipReactiveWrapForPath(basePath: string): boolean {
  if (basePath === 'events' || basePath.startsWith('events.')) return true
  const head = topPathSegment(basePath)
  if (SKIP_REACTIVE_WRAP_AT_ROOT.has(head)) return true
  // Compiler-generated component-array backing: `_${arrayPropName}Items` (see getComponentArrayItemsName).
  // These arrays hold compiled child instances and must not be wrapped in reactive proxies — identity and
  // in-place list reconciliation depend on the raw array (see __observeList / applyListChanges).
  if (/^_[a-zA-Z][a-zA-Z0-9]*Items$/.test(head)) return true
  return false
}

/**
 * Reactive store: class fields become reactive properties automatically.
 * Methods and getters on the prototype are not reactive.
 *
 * @example
 * class CounterStore extends Store {
 *   count = 0
 *   increment() { this.count++ }
 *   decrement() { this.count-- }
 * }
 */
export class Store {
  /**
   * Engine-room state lives in a `WeakMap` keyed by the raw instance (never on the public proxy).
   * Root proxy `get` binds methods to the **receiver** (proxy) so `this.todos` etc. go through
   * reactive `rootGetValue`; internals use `getPriv(this)` / `storeRaw(this)`.
   */
  static #noDirectTopLevelValue = Symbol('noDirectTopLevelValue')
  /**
   * Set by `@geajs/ssr` before rendering. When non-null, `new Store()` uses the returned
   * proxy handler (7 traps, overlay semantics) instead of the lean browser handler (4 traps).
   * Must be set **before** `new Store()` — proxy shape is fixed at construction.
   */
  static rootProxyHandlerFactory: (() => ProxyHandler<Store>) | null = null

  static #pendingStores: Set<Store> = new Set()
  static #flushing = false

  static flushAll(): void {
    if (Store.#flushing) return
    Store.#flushing = true
    try {
      for (const store of Store.#pendingStores) {
        store.flushSync()
      }
      Store.#pendingStores.clear()
    } finally {
      Store.#flushing = false
    }
  }

  static rootGetValue(t: Store, prop: string, receiver: any): any {
    if (!Object.prototype.hasOwnProperty.call(t, prop)) {
      return Reflect.get(t, prop, receiver)
    }
    const value = (t as any)[prop]
    if (typeof value === 'function') return value
    if (value !== null && value !== undefined && typeof value === 'object') {
      const proto = Object.getPrototypeOf(value)
      if (proto !== Object.prototype && !Array.isArray(value)) return value
      if (shouldSkipReactiveWrapForPath(prop)) return value
      const entry = getPriv(t).topLevelProxies.get(prop)
      if (entry && entry[0] === value) return entry[1]
      const p = t[GEA_STORE_CREATE_PROXY](value, prop, [prop])
      getPriv(t).topLevelProxies.set(prop, [value, p])
      return p
    }
    return value
  }

  static rootSetValue(t: Store, prop: string, value: any): boolean {
    if (typeof value === 'function') {
      ;(t as any)[prop] = value
      return true
    }

    const pathParts = Store.#rootPathPartsCache(t, prop)
    if (value === null || value === undefined || typeof value !== 'object') {
      const oldValue = (t as any)[prop]
      if (oldValue === value && prop in t) return true
      const hadProp = prop in t
      if (oldValue && typeof oldValue === 'object') {
        getPriv(t).proxyCache.delete(oldValue)
        getPriv(t).arrayIndexProxyCache.delete(oldValue)
        getPriv(t).topLevelProxies.delete(prop)
      }
      ;(t as any)[prop] = value
      getPriv(t).pendingChanges.push({
        type: hadProp ? 'update' : 'add',
        property: prop,
        target: t,
        pathParts,
        newValue: value,
        previousValue: oldValue,
      })
      if (getPriv(t).pendingBatchKind !== 2) {
        getPriv(t).pendingBatchKind = 2
        getPriv(t).pendingBatchArrayPathParts = null
      }
      if (!getPriv(t).flushScheduled) {
        getPriv(t).flushScheduled = true
        Store.#pendingStores.add(t)
        queueMicrotask(() => t[GEA_STORE_FLUSH_CHANGES]())
      }
      return true
    }

    value = unwrapNestedProxyValue(value)

    const hadProp = Object.prototype.hasOwnProperty.call(t, prop)
    const oldValue = hadProp ? (t as any)[prop] : undefined
    if (hadProp && oldValue === value) return true

    if (oldValue && typeof oldValue === 'object') {
      getPriv(t).proxyCache.delete(oldValue)
      getPriv(t).arrayIndexProxyCache.delete(oldValue)
    }
    getPriv(t).topLevelProxies.delete(prop)
    ;(t as any)[prop] = value

    if (Array.isArray(oldValue) && oldValue.length > 0 && Array.isArray(value) && value.length > oldValue.length) {
      let isAppend = true
      for (let i = 0; i < oldValue.length; i++) {
        if (oldValue[i] !== value[i]) {
          isAppend = false
          break
        }
      }
      if (isAppend) {
        const start = oldValue.length
        t[GEA_STORE_EMIT_CHANGES]([
          {
            type: 'append',
            property: prop,
            target: t,
            pathParts,
            start,
            count: value.length - start,
            newValue: value.slice(start),
          },
        ])
        return true
      }
    }

    getPriv(t).pendingChanges.push({
      type: hadProp ? 'update' : 'add',
      property: prop,
      target: t,
      pathParts,
      newValue: value,
      previousValue: oldValue,
    })
    if (getPriv(t).pendingBatchKind !== 2) {
      getPriv(t).pendingBatchKind = 2
      getPriv(t).pendingBatchArrayPathParts = null
    }
    if (!getPriv(t).flushScheduled) {
      getPriv(t).flushScheduled = true
      Store.#pendingStores.add(t)
      queueMicrotask(() => t[GEA_STORE_FLUSH_CHANGES]())
    }
    return true
  }

  static rootDeleteProperty(t: Store, prop: string): boolean {
    const hadProp = Object.prototype.hasOwnProperty.call(t, prop)
    if (!hadProp) return true
    const oldValue = (t as any)[prop]
    if (oldValue && typeof oldValue === 'object') {
      getPriv(t).proxyCache.delete(oldValue)
      getPriv(t).arrayIndexProxyCache.delete(oldValue)
    }
    getPriv(t).topLevelProxies.delete(prop)
    delete (t as any)[prop]
    t[GEA_STORE_EMIT_CHANGES]([
      {
        type: 'delete',
        property: prop,
        target: t,
        pathParts: Store.#rootPathPartsCache(t, prop),
        previousValue: oldValue,
      },
    ])
    return true
  }

  static #rootPathPartsCache(t: Store, prop: string): string[] {
    let parts = getPriv(t).pathPartsCache.get(prop)
    if (parts === undefined) {
      parts = [prop]
      getPriv(t).pathPartsCache.set(prop, parts)
    }
    return parts
  }

  /**
   * Browser root proxy: **4 traps only** (get/set/deleteProperty/defineProperty).
   * No `has`/`ownKeys`/`getOwnPropertyDescriptor` — V8 optimizes this shape better for hot paths.
   *
   * SSR overlay handler lives in `@geajs/ssr` and is wired via `Store.rootProxyHandlerFactory`.
   */
  static #browserRootProxyHandler?: ProxyHandler<Store>

  static #getBrowserRootProxyHandler(): ProxyHandler<Store> {
    if (!Store.#browserRootProxyHandler) {
      Store.#browserRootProxyHandler = {
        get(t, prop, receiver) {
          if (typeof prop === 'symbol') {
            if (prop === GEA_PROXY_IS_PROXY) return true
            if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_RAW_TARGET) return t
            return Reflect.get(t, prop, receiver)
          }
          if (typeof prop === 'string') {
            const bridged = tryComponentRootBridgeGet(t, prop)
            if (bridged?.ok) {
              const v = bridged.value
              if (typeof v !== 'function') return v
              return isClassConstructorValue(v) ? v : v.bind(receiver)
            }
          }
          const v = Store.rootGetValue(t, prop, receiver)
          if (typeof v !== 'function') return v
          return isClassConstructorValue(v) ? v : v.bind(receiver)
        },
        set(t, prop, value, receiver) {
          if (typeof prop === 'symbol') {
            ;(t as any)[prop] = value
            return true
          }
          const desc = findPropertyDescriptor(t, prop)
          if (desc?.set) {
            return Reflect.set(t, prop, value, receiver)
          }
          if (typeof prop === 'string' && tryComponentRootBridgeSet(t, prop, value)) return true
          return Store.rootSetValue(t, prop, value)
        },
        deleteProperty(t, prop) {
          if (typeof prop === 'symbol') {
            delete (t as any)[prop]
            return true
          }
          const desc = findPropertyDescriptor(t, prop)
          if (desc && (desc.get || desc.set)) {
            return Reflect.deleteProperty(t, prop)
          }
          return Store.rootDeleteProperty(t, prop)
        },
        defineProperty(t, prop, descriptor) {
          return Reflect.defineProperty(t, prop, descriptor)
        },
      }
    }
    return Store.#browserRootProxyHandler
  }

  static [GEA_STORE_GET_BROWSER_ROOT_PROXY_HANDLER_FOR_TESTS](): ProxyHandler<Store> {
    return Store.#getBrowserRootProxyHandler()
  }

  constructor(initialData?: Record<string, any>) {
    const priv: StoreInstancePrivate = {
      selfProxy: undefined,
      pendingChanges: [],
      pendingChangesPool: [],
      flushScheduled: false,
      nextArrayOpId: 0,
      observerRoot: createObserverNode([]),
      proxyCache: new WeakMap(),
      arrayIndexProxyCache: new WeakMap(),
      internedArrayPaths: new Map(),
      topLevelProxies: new Map(),
      pathPartsCache: new Map(),
      pendingBatchKind: 0,
      pendingBatchArrayPathParts: null,
    }
    storeInstancePrivate.set(this, priv)

    const handler = Store.rootProxyHandlerFactory
      ? Store.rootProxyHandlerFactory()
      : Store.#getBrowserRootProxyHandler()
    const proxy = new Proxy(this, handler) as this
    priv.selfProxy = proxy
    ;(this as any)[GEA_SELF_PROXY] = proxy

    if (initialData) {
      for (const key of Object.keys(initialData)) {
        Object.defineProperty(this, key, {
          value: initialData[key],
          writable: true,
          enumerable: true,
          configurable: true,
        })
      }
    }

    return proxy
  }

  /** Used by vite plugin when passing store to components. Same as `this`. */
  get [GEA_STORE_ROOT](): this {
    return this
  }

  flushSync(): void {
    const p = getPriv(this)
    if (p.pendingChanges.length > 0) {
      this[GEA_STORE_FLUSH_CHANGES]()
    }
  }

  silent(fn: () => void): void {
    try {
      fn()
    } finally {
      const p = getPriv(this)
      p.pendingChanges = []
      p.flushScheduled = false
      p.pendingBatchKind = 0
      p.pendingBatchArrayPathParts = null
    }
  }

  observe(path: string | string[], handler: StoreObserver): () => void {
    const pathParts = splitPath(path)
    return this[GEA_STORE_ADD_OBSERVER](pathParts, handler)
  }

  private [GEA_STORE_ADD_OBSERVER](pathParts: string[], handler: StoreObserver): () => void {
    const p = getPriv(this)
    const nodes = [p.observerRoot]
    let node = p.observerRoot

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]
      let child = node.children.get(part)
      if (!child) {
        child = createObserverNode(appendPathParts(node.pathParts, part))
        node.children.set(part, child)
      }
      node = child
      nodes.push(node)
    }

    node.handlers.add(handler)

    return () => {
      node.handlers.delete(handler)
      for (let i = nodes.length - 1; i > 0; i--) {
        const current = nodes[i]
        if (current.handlers.size > 0 || current.children.size > 0) break
        nodes[i - 1].children.delete(pathParts[i - 1])
      }
    }
  }

  private [GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES](pathParts: string[]): ObserverNode[] {
    const matches: ObserverNode[] = []
    let node: ObserverNode | undefined = getPriv(this).observerRoot

    if (node.handlers.size > 0) matches.push(node)

    for (let i = 0; i < pathParts.length; i++) {
      node = node.children.get(pathParts[i])
      if (!node) break
      if (node.handlers.size > 0) matches.push(node)
    }

    return matches
  }

  private [GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES](node: ObserverNode, matches: ObserverNode[]): void {
    for (const child of node.children.values()) {
      if (child.handlers.size > 0) matches.push(child)
      if (child.children.size > 0) this[GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES](child, matches)
    }
  }

  /** When a property is replaced with a new object, descendant observers
   *  must be notified because their nested values may have changed. */
  private [GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT](change: StoreChange, matches: ObserverNode[]): void {
    if ((change.type === 'update' || change.type === 'add') && change.newValue && typeof change.newValue === 'object') {
      const node = this[GEA_STORE_GET_OBSERVER_NODE](change.pathParts)
      if (node && node.children.size > 0) {
        this[GEA_STORE_COLLECT_DESCENDANT_OBSERVER_NODES](node, matches)
      }
    }
  }

  private [GEA_STORE_GET_OBSERVER_NODE](pathParts: string[]): ObserverNode | null {
    let node: ObserverNode | undefined = getPriv(this).observerRoot
    for (let i = 0; i < pathParts.length; i++) {
      node = node.children.get(pathParts[i])
      if (!node) return null
    }
    return node
  }

  private [GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES_FROM_NODE](
    startNode: ObserverNode,
    pathParts: string[],
    offset: number,
  ): ObserverNode[] {
    const matches: ObserverNode[] = []
    let node: ObserverNode | undefined = startNode

    for (let i = offset; i < pathParts.length; i++) {
      node = node.children.get(pathParts[i])
      if (!node) break
      if (node.handlers.size > 0) matches.push(node)
    }

    return matches
  }

  private [GEA_STORE_NOTIFY_HANDLERS](node: ObserverNode, relevant: StoreChange[]): void {
    const value = getByPathParts(storeRaw(this), node.pathParts)
    for (const handler of node.handlers) {
      handler(value, relevant)
    }
  }

  private [GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE](node: ObserverNode, value: any, relevant: StoreChange[]): void {
    const handlers = node.handlers
    if (handlers.size === 1) {
      handlers.values().next().value!(value, relevant)
      return
    }
    for (const handler of handlers) {
      handler(value, relevant)
    }
  }

  private [GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE](change: StoreChange): any {
    const nextValue = change.newValue
    if (Array.isArray(nextValue) && nextValue.length === 0) return nextValue
    return Store.#noDirectTopLevelValue
  }

  private [GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE](change: StoreChange): any {
    if (change.type === 'delete') return undefined
    const value = (this as any)[change.property]
    if (value === null || value === undefined || typeof value !== 'object') return value
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && !Array.isArray(value)) return value
    const p = getPriv(this)
    const entry = p.topLevelProxies.get(change.property)
    if (entry && entry[0] === value) return entry[1]
    const proxy = this[GEA_STORE_CREATE_PROXY](value, change.property, [change.property])
    p.topLevelProxies.set(change.property, [value, proxy])
    return proxy
  }

  private [GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr: any): void {
    if (arr && typeof arr === 'object') getPriv(this).arrayIndexProxyCache.delete(arr)
  }

  private [GEA_STORE_NORMALIZE_BATCH](batch: StoreChange[]): StoreChange[] {
    if (batch.length < 2) return batch

    let allLeafArrayPropUpdates = true
    for (let i = 0; i < batch.length; i++) {
      const change = batch[i]
      if (!change?.isArrayItemPropUpdate || !change.leafPathParts || change.leafPathParts.length === 0) {
        allLeafArrayPropUpdates = false
        break
      }
    }
    if (allLeafArrayPropUpdates) return batch

    let used: Set<number> | undefined
    for (let i = 0; i < batch.length; i++) {
      if (used?.has(i)) continue
      const change = batch[i]
      if (!isArrayIndexUpdate(change)) continue

      for (let j = i + 1; j < batch.length; j++) {
        if (used?.has(j)) continue
        const candidate = batch[j]
        if (!isReciprocalSwap(change, candidate)) continue

        if (!used) used = new Set()
        const opId = `swap:${getPriv(this).nextArrayOpId++}`
        const arrayPathParts = change.pathParts.slice(0, -1)
        const changeIndex = Number(change.property)
        const candidateIndex = Number(candidate.property)

        change.arrayPathParts = arrayPathParts
        candidate.arrayPathParts = arrayPathParts

        change.arrayOp = 'swap'
        candidate.arrayOp = 'swap'

        change.otherIndex = candidateIndex
        candidate.otherIndex = changeIndex

        change.opId = opId
        candidate.opId = opId

        used.add(i)
        used.add(j)
        break
      }
    }

    return batch
  }

  private [GEA_STORE_DELIVER_ARRAY_ITEM_PROP_BATCH](batch: StoreChange[]): boolean {
    if (!batch[0]?.isArrayItemPropUpdate) return false

    const arrayPathParts = batch[0].arrayPathParts
    let allSameArray = true
    for (let i = 1; i < batch.length; i++) {
      const change = batch[i]
      // Use reference equality first (interned paths share the same array object),
      // then fall back to element-wise comparison
      if (
        !change.isArrayItemPropUpdate ||
        (change.arrayPathParts !== arrayPathParts && !samePathParts(change.arrayPathParts!, arrayPathParts!))
      ) {
        allSameArray = false
        break
      }
    }

    if (!allSameArray) return false

    return this[GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH](batch, arrayPathParts!)
  }

  private [GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH](batch: StoreChange[], arrayPathParts: string[]): boolean {
    const arrayNode = this[GEA_STORE_GET_OBSERVER_NODE](arrayPathParts)
    if (
      getPriv(this).observerRoot.handlers.size === 0 &&
      arrayNode &&
      arrayNode.children.size === 0 &&
      arrayNode.handlers.size > 0
    ) {
      this[GEA_STORE_NOTIFY_HANDLERS](arrayNode, batch)
      return true
    }

    const commonMatches = this[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES](arrayPathParts)
    for (let i = 0; i < commonMatches.length; i++) {
      this[GEA_STORE_NOTIFY_HANDLERS](commonMatches[i], batch)
    }

    if (!arrayNode || arrayNode.children.size === 0) return true

    const deliveries = new Map<ObserverNode, StoreChange[]>()
    const suffixOffset = arrayPathParts.length

    for (let i = 0; i < batch.length; i++) {
      const change = batch[i]
      const matches = this[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES_FROM_NODE](
        arrayNode,
        change.pathParts,
        suffixOffset,
      )
      for (let j = 0; j < matches.length; j++) {
        const node = matches[j]
        let relevant = deliveries.get(node)
        if (!relevant) {
          relevant = []
          deliveries.set(node, relevant)
        }
        relevant.push(change)
      }
    }

    for (const [node, relevant] of deliveries) {
      this[GEA_STORE_NOTIFY_HANDLERS](node, relevant)
    }

    return true
  }

  private [GEA_STORE_DELIVER_TOP_LEVEL_BATCH](batch: StoreChange[]): boolean {
    const raw = storeRaw(this)
    const root = getPriv(this).observerRoot
    if (root.handlers.size > 0) return false

    if (batch.length === 1) {
      const change = batch[0]
      if (change.target !== raw || change.pathParts.length !== 1) return false
      const node = root.children.get(change.property)
      if (!node) return true
      if (node.children.size > 0) return false
      if (node.handlers.size === 0) return true
      let value: any
      if (change.type === 'delete') {
        value = undefined
      } else {
        const nv = change.newValue
        if (nv === null || nv === undefined || typeof nv !== 'object') {
          value = nv
        } else {
          const directValue = this[GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE](change)
          value =
            directValue !== Store.#noDirectTopLevelValue
              ? directValue
              : this[GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE](change)
        }
      }
      this[GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE](node, value, batch)
      return true
    }

    const deliveries = new Map<ObserverNode, { value: any; relevant: StoreChange[] }>()
    for (let i = 0; i < batch.length; i++) {
      const change = batch[i]
      if (change.target !== raw || change.pathParts.length !== 1) return false
      const node = root.children.get(change.property)
      if (!node) continue
      if (node.children.size > 0) return false
      if (node.handlers.size === 0) continue

      let delivery = deliveries.get(node)
      if (!delivery) {
        const directValue = this[GEA_STORE_GET_DIRECT_TOP_LEVEL_OBSERVED_VALUE](change)
        delivery = {
          value:
            directValue !== Store.#noDirectTopLevelValue
              ? directValue
              : this[GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE](change),
          relevant: [],
        }
        deliveries.set(node, delivery)
      }
      delivery.relevant.push(change)
    }

    for (const [node, delivery] of deliveries) {
      this[GEA_STORE_NOTIFY_HANDLERS_WITH_VALUE](node, delivery.value, delivery.relevant)
    }
    return true
  }

  private [GEA_STORE_FLUSH_CHANGES](): void {
    const raw = storeRaw(this)
    const p = getPriv(this)
    p.flushScheduled = false
    Store.#pendingStores.delete(raw)
    const pendingBatch = p.pendingChanges
    const pendingBatchKind = p.pendingBatchKind
    const pendingBatchArrayPathParts = p.pendingBatchArrayPathParts
    p.pendingChangesPool.length = 0
    p.pendingChanges = p.pendingChangesPool
    p.pendingChangesPool = pendingBatch
    p.pendingBatchKind = 0
    p.pendingBatchArrayPathParts = null
    if (pendingBatch.length === 0) return

    if (
      pendingBatchKind === 1 &&
      pendingBatchArrayPathParts &&
      this[GEA_STORE_DELIVER_KNOWN_ARRAY_ITEM_PROP_BATCH](pendingBatch, pendingBatchArrayPathParts)
    ) {
      return
    }

    // Inlined fast path for single top-level change (covers select-row, clear-rows)
    if (pendingBatch.length === 1) {
      const change = pendingBatch[0]
      if (change.target === raw && change.pathParts.length === 1 && p.observerRoot.handlers.size === 0) {
        const node = p.observerRoot.children.get(change.property)
        if (node && node.handlers.size > 0) {
          if (node.children.size === 0) {
            let value: any
            if (change.type === 'delete') {
              value = undefined
            } else {
              const nv = change.newValue
              if (nv === null || nv === undefined || typeof nv !== 'object') {
                value = nv
              } else {
                if (Array.isArray(nv) && nv.length === 0) {
                  value = nv
                } else {
                  value = this[GEA_STORE_GET_TOP_LEVEL_OBSERVED_VALUE](change)
                }
              }
            }
            const handlers = node.handlers
            if (handlers.size === 1) {
              handlers.values().next().value!(value, pendingBatch)
            } else {
              for (const handler of handlers) handler(value, pendingBatch)
            }
            return
          }
        } else if (node) {
          return
        }
      }
    }

    // Inlined fast path for 2-change array swap
    if (pendingBatch.length === 2 && p.observerRoot.handlers.size === 0) {
      const c0 = pendingBatch[0]
      const c1 = pendingBatch[1]
      if (
        c0.target === c1.target &&
        Array.isArray(c0.target) &&
        c0.type === 'update' &&
        c1.type === 'update' &&
        isNumericIndex(c0.property) &&
        isNumericIndex(c1.property) &&
        c0.previousValue === c1.newValue &&
        c0.newValue === c1.previousValue
      ) {
        const opId = `swap:${p.nextArrayOpId++}`
        const arrayPathParts = c0.pathParts.length > 1 ? c0.pathParts.slice(0, -1) : c0.pathParts
        c0.arrayOp = 'swap'
        c1.arrayOp = 'swap'
        c0.opId = opId
        c1.opId = opId
        c0.otherIndex = Number(c1.property)
        c1.otherIndex = Number(c0.property)
        c0.arrayPathParts = arrayPathParts
        c1.arrayPathParts = arrayPathParts

        let node: ObserverNode | undefined = p.observerRoot
        for (let i = 0; i < arrayPathParts.length; i++) {
          node = node!.children.get(arrayPathParts[i])
          if (!node) break
        }
        if (node && node.handlers.size > 0) {
          const value = getByPathParts(raw, node.pathParts)
          for (const handler of node.handlers) handler(value, pendingBatch)
        }
        return
      }
    }

    if (this[GEA_STORE_DELIVER_TOP_LEVEL_BATCH](pendingBatch)) return

    const batch = this[GEA_STORE_NORMALIZE_BATCH](pendingBatch)

    if (this[GEA_STORE_DELIVER_ARRAY_ITEM_PROP_BATCH](batch)) return

    if (batch.length === 1) {
      const change = batch[0]
      const matches = this[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES](change.pathParts)
      this[GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT](change, matches)
      for (let i = 0; i < matches.length; i++) {
        this[GEA_STORE_NOTIFY_HANDLERS](matches[i], batch)
      }
      return
    }

    const deliveries = new Map<ObserverNode, StoreChange[]>()
    for (let i = 0; i < batch.length; i++) {
      const change = batch[i]
      const matches = this[GEA_STORE_COLLECT_MATCHING_OBSERVER_NODES](change.pathParts)
      this[GEA_STORE_ADD_DESCENDANTS_FOR_OBJECT_REPLACEMENT](change, matches)
      for (let j = 0; j < matches.length; j++) {
        const node = matches[j]
        let relevant = deliveries.get(node)
        if (!relevant) {
          relevant = []
          deliveries.set(node, relevant)
        }
        relevant.push(change)
      }
    }

    for (const [node, relevant] of deliveries) {
      this[GEA_STORE_NOTIFY_HANDLERS](node, relevant)
    }
  }

  private [GEA_STORE_EMIT_CHANGES](changes: StoreChange[]): void {
    const raw = storeRaw(this)
    const p = getPriv(this)
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]
      p.pendingChanges.push(change)
      this[GEA_STORE_TRACK_PENDING_CHANGE](change)
    }
    if (!p.flushScheduled) {
      p.flushScheduled = true
      Store.#pendingStores.add(raw)
      queueMicrotask(() => this[GEA_STORE_FLUSH_CHANGES]())
    }
  }

  private [GEA_STORE_QUEUE_CHANGE](change: StoreChange): void {
    getPriv(this).pendingChanges.push(change)
    this[GEA_STORE_TRACK_PENDING_CHANGE](change)
  }

  private [GEA_STORE_TRACK_PENDING_CHANGE](change: StoreChange): void {
    const p = getPriv(this)
    if (p.pendingBatchKind === 2) return
    if (!change.isArrayItemPropUpdate || !change.arrayPathParts) {
      p.pendingBatchKind = 2
      p.pendingBatchArrayPathParts = null
      return
    }

    if (p.pendingBatchKind === 0) {
      p.pendingBatchKind = 1
      p.pendingBatchArrayPathParts = change.arrayPathParts
      return
    }

    const pendingArrayPathParts = p.pendingBatchArrayPathParts
    if (
      pendingArrayPathParts !== change.arrayPathParts &&
      !samePathParts(pendingArrayPathParts!, change.arrayPathParts)
    ) {
      p.pendingBatchKind = 2
      p.pendingBatchArrayPathParts = null
    }
  }

  private [GEA_STORE_SCHEDULE_FLUSH](): void {
    const raw = storeRaw(this)
    const p = getPriv(this)
    if (!p.flushScheduled) {
      p.flushScheduled = true
      Store.#pendingStores.add(raw)
      queueMicrotask(() => this[GEA_STORE_FLUSH_CHANGES]())
    }
  }

  private [GEA_STORE_QUEUE_DIRECT_ARRAY_ITEM_PRIMITIVE_CHANGE](
    target: any,
    property: string,
    value: any,
    previousValue: any,
    isNew: boolean,
    arrayMeta: ArrayProxyMeta,
    getPathParts: (prop: string) => string[],
    getLeafPathParts: (prop: string) => string[],
  ): void {
    const change: StoreChange = {
      type: isNew ? 'add' : 'update',
      property,
      target,
      pathParts: getPathParts(property),
      newValue: value,
      previousValue,
      arrayPathParts: arrayMeta.arrayPathParts,
      arrayIndex: arrayMeta.arrayIndex,
      leafPathParts: getLeafPathParts(property),
      isArrayItemPropUpdate: true,
    }
    const raw = storeRaw(this)
    const p = getPriv(this)
    p.pendingChanges.push(change)
    if (p.pendingBatchKind === 0) {
      p.pendingBatchKind = 1
      p.pendingBatchArrayPathParts = change.arrayPathParts
    } else if (p.pendingBatchKind === 1) {
      const pp = p.pendingBatchArrayPathParts
      if (pp !== change.arrayPathParts && !samePathParts(pp!, change.arrayPathParts)) {
        p.pendingBatchKind = 2
        p.pendingBatchArrayPathParts = null
      }
    }
    if (!p.flushScheduled) {
      p.flushScheduled = true
      Store.#pendingStores.add(raw)
      queueMicrotask(() => this[GEA_STORE_FLUSH_CHANGES]())
    }
  }

  private [GEA_STORE_INTERCEPT_ARRAY_METHOD](
    arr: any[],
    method: string,
    _basePath: string,
    baseParts: string[],
  ): Function | null {
    const store = this // eslint-disable-line @typescript-eslint/no-this-alias
    switch (method) {
      case 'splice':
        return function (...args: any[]) {
          store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr)
          const len = arr.length
          const rawStart = args[0] ?? 0
          const start = rawStart < 0 ? Math.max(len + rawStart, 0) : Math.min(rawStart, len)
          const deleteCount = args.length < 2 ? len - start : Math.min(Math.max(args[1] ?? 0, 0), len - start)
          const items = args.slice(2).map((v) => unwrapNestedProxyValue(v))
          const removed = arr.slice(start, start + deleteCount)
          Array.prototype.splice.call(arr, start, deleteCount, ...items)
          if (deleteCount === 0 && items.length > 0 && start === len) {
            store[GEA_STORE_EMIT_CHANGES]([
              {
                type: 'append',
                property: String(start),
                target: arr,
                pathParts: baseParts,
                start,
                count: items.length,
                newValue: items,
              },
            ])
            return removed
          }
          const changes: StoreChange[] = []
          for (let i = 0; i < removed.length; i++) {
            changes.push({
              type: 'delete',
              property: String(start + i),
              target: arr,
              pathParts: appendPathParts(baseParts, String(start + i)),
              previousValue: removed[i],
            })
          }
          for (let i = 0; i < items.length; i++) {
            changes.push({
              type: 'add',
              property: String(start + i),
              target: arr,
              pathParts: appendPathParts(baseParts, String(start + i)),
              newValue: items[i],
            })
          }
          if (changes.length > 0) store[GEA_STORE_EMIT_CHANGES](changes)
          return removed
        }
      case 'push':
        return function (...items: any[]) {
          store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr)
          const rawItems = items.map((v) => unwrapNestedProxyValue(v))
          const startIndex = arr.length
          Array.prototype.push.apply(arr, rawItems)
          if (rawItems.length > 0) {
            store[GEA_STORE_EMIT_CHANGES]([
              {
                type: 'append',
                property: String(startIndex),
                target: arr,
                pathParts: baseParts,
                start: startIndex,
                count: rawItems.length,
                newValue: rawItems,
              },
            ])
          }
          return arr.length
        }
      case 'pop':
      case 'shift':
        return function () {
          if (arr.length === 0) return undefined
          store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr)
          const idx = method === 'pop' ? arr.length - 1 : 0
          const removed = arr[idx]
          if (method === 'pop') Array.prototype.pop.call(arr)
          else Array.prototype.shift.call(arr)
          store[GEA_STORE_EMIT_CHANGES]([
            {
              type: 'delete',
              property: String(idx),
              target: arr,
              pathParts: appendPathParts(baseParts, String(idx)),
              previousValue: removed,
            },
          ])
          return removed
        }
      case 'unshift':
        return function (...items: any[]) {
          store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr)
          const rawItems = items.map((v) => unwrapNestedProxyValue(v))
          Array.prototype.unshift.apply(arr, rawItems)
          const changes: StoreChange[] = []
          for (let i = 0; i < rawItems.length; i++) {
            changes.push({
              type: 'add',
              property: String(i),
              target: arr,
              pathParts: appendPathParts(baseParts, String(i)),
              newValue: rawItems[i],
            })
          }
          if (changes.length > 0) store[GEA_STORE_EMIT_CHANGES](changes)
          return arr.length
        }
      case 'sort':
      case 'reverse':
        return function (...args: any[]) {
          store[GEA_STORE_CLEAR_ARRAY_INDEX_CACHE](arr)
          const previousOrder = arr.slice()
          Array.prototype[method].apply(arr, args)
          const indexLookup = new Map<any, { indices: number[]; next: number }>()
          for (let i = 0; i < previousOrder.length; i++) {
            const v = previousOrder[i]
            const bucket = indexLookup.get(v)
            if (bucket) bucket.indices.push(i)
            else indexLookup.set(v, { indices: [i], next: 0 })
          }
          const permutation = new Array(arr.length)
          for (let i = 0; i < arr.length; i++) {
            const bucket = indexLookup.get(arr[i])
            permutation[i] = bucket ? bucket.indices[bucket.next++] : i
          }
          store[GEA_STORE_EMIT_CHANGES]([
            {
              type: 'reorder',
              property: baseParts[baseParts.length - 1] || '',
              target: arr,
              pathParts: baseParts,
              permutation,
              newValue: arr,
            },
          ])
          return arr
        }
      default:
        return null
    }
  }

  private [GEA_STORE_INTERCEPT_ARRAY_ITERATOR](
    arr: any[],
    method: string,
    basePath: string,
    baseParts: string[],
    mkProxy: (target: any, basePath: string, baseParts: string[]) => any,
  ): Function | null {
    switch (method) {
      case 'indexOf':
      case 'includes': {
        const native = method === 'indexOf' ? Array.prototype.indexOf : Array.prototype.includes
        return function (searchElement: any, fromIndex?: number) {
          const raw = unwrapNestedProxyValue(searchElement)
          return native.call(arr, raw, fromIndex)
        }
      }
      case 'findIndex':
        return (cb: Function, thisArg?: any) => {
          for (let i = 0; i < arr.length; i++) {
            if (cb.call(thisArg, arr[i], i, arr)) return i
          }
          return -1
        }
      case 'some':
        return (cb: Function, thisArg?: any) => {
          for (let i = 0; i < arr.length; i++) {
            if (cb.call(thisArg, arr[i], i, arr)) return true
          }
          return false
        }
      case 'every':
        return (cb: Function, thisArg?: any) => {
          for (let i = 0; i < arr.length; i++) {
            if (!cb.call(thisArg, arr[i], i, arr)) return false
          }
          return true
        }
      case 'forEach':
      case 'map':
      case 'filter':
      case 'find':
        return (cb: Function, thisArg?: any) => proxyIterate(arr, basePath, baseParts, mkProxy, method, cb, thisArg)
      case 'reduce':
        return function (cb: Function, init?: any) {
          let acc = arguments.length >= 2 ? init : arr[0]
          const start = arguments.length >= 2 ? 0 : 1
          for (let i = start; i < arr.length; i++) {
            const nextPath = basePath ? `${basePath}.${i}` : String(i)
            const raw = arr[i]
            const p = shouldWrapNestedReactiveValue(raw)
              ? mkProxy(raw, nextPath, appendPathParts(baseParts, String(i)))
              : raw
            acc = cb(acc, p, i, arr)
          }
          return acc
        }
      default:
        return null
    }
  }

  private [GEA_STORE_GET_CACHED_ARRAY_META](baseParts: string[]): ArrayProxyMeta | null {
    const map = getPriv(this).internedArrayPaths
    for (let i = baseParts.length - 1; i >= 0; i--) {
      if (!isNumericIndex(baseParts[i])) continue
      let internKey: string
      let interned: string[]
      if (i === 1) {
        internKey = baseParts[0]
        interned = map.get(internKey)!
        if (!interned) {
          interned = [baseParts[0]]
          map.set(internKey, interned)
        }
      } else {
        internKey = baseParts.slice(0, i).join('\0')
        interned = map.get(internKey)!
        if (!interned) {
          interned = baseParts.slice(0, i)
          map.set(internKey, interned)
        }
      }
      return {
        arrayPathParts: interned,
        arrayIndex: Number(baseParts[i]),
        baseTail: i + 1 < baseParts.length ? baseParts.slice(i + 1) : [],
      }
    }
    return null
  }

  private [GEA_STORE_CREATE_PROXY](
    target: any,
    basePath: string,
    baseParts: string[] = [],
    arrayMeta?: ArrayProxyMeta,
  ): any {
    if (!target || typeof target !== 'object') return target

    // Return cached proxy if one already exists for this raw object.
    // This ensures stable references for computed getters that traverse
    // the same objects (e.g., store.activeConversation via .find()).
    if (!Array.isArray(target)) {
      const cached = getPriv(this).proxyCache.get(target)
      if (cached) return cached
    }

    const store = this // eslint-disable-line @typescript-eslint/no-this-alias
    const cachedArrayMeta = arrayMeta ?? store[GEA_STORE_GET_CACHED_ARRAY_META](baseParts)
    // Defer Map creation until actually needed (saves allocation for read-only items)
    let pathCache: Map<string, string[]> | undefined
    let leafCache: Map<string, string[]> | undefined
    let methodCache: Map<string, Function> | undefined
    let lastPathProp: string | undefined
    let lastPathParts: string[] | undefined
    let lastLeafProp: string | undefined
    let lastLeafParts: string[] | undefined

    function getCachedPathParts(propStr: string): string[] {
      if (lastPathProp === propStr && lastPathParts) return lastPathParts
      if (pathCache) {
        const cached = pathCache.get(propStr)
        if (cached) return cached
      }
      const parts = baseParts.length > 0 ? [...baseParts, propStr] : [propStr]
      if (lastPathProp === undefined) {
        lastPathProp = propStr
        lastPathParts = parts
        return parts
      }
      if (!pathCache) {
        pathCache = new Map()
        pathCache.set(lastPathProp, lastPathParts!)
      }
      pathCache.set(propStr, parts)
      return parts
    }

    function getCachedLeafPathParts(propStr: string): string[] {
      if (lastLeafProp === propStr && lastLeafParts) return lastLeafParts
      if (leafCache) {
        const cached = leafCache.get(propStr)
        if (cached) return cached
      }
      const parts =
        cachedArrayMeta && cachedArrayMeta.baseTail.length > 0 ? [...cachedArrayMeta.baseTail, propStr] : [propStr]
      if (lastLeafProp === undefined) {
        lastLeafProp = propStr
        lastLeafParts = parts
        return parts
      }
      if (!leafCache) {
        leafCache = new Map()
        leafCache.set(lastLeafProp, lastLeafParts!)
      }
      leafCache.set(propStr, parts)
      return parts
    }

    const createProxy = store[GEA_STORE_CREATE_PROXY].bind(store)

    const proxy = new Proxy(target, {
      get(obj: any, prop: string | symbol) {
        if (prop === GEA_STORE_ROOT) return getPriv(store).selfProxy || store
        if (prop === GEA_PROXY_IS_PROXY) return true
        if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_TARGET) return obj
        if (prop === GEA_PROXY_GET_PATH) return basePath
        if (typeof prop === 'symbol') return obj[prop]

        const value = obj[prop]
        if (value === null || value === undefined) return value

        const valType = typeof value
        if (valType !== 'object' && valType !== 'function') return value

        if (Array.isArray(obj) && valType === 'function') {
          if (prop === 'constructor') return value
          // Cache intercepted methods to avoid switch dispatch on repeated calls
          if (!methodCache) methodCache = new Map()
          let cached = methodCache.get(prop)
          if (cached !== undefined) return cached
          cached =
            store[GEA_STORE_INTERCEPT_ARRAY_METHOD](obj, prop, basePath, baseParts) ||
            store[GEA_STORE_INTERCEPT_ARRAY_ITERATOR](obj, prop, basePath, baseParts, createProxy) ||
            value.bind(obj)
          methodCache.set(prop, cached)
          return cached
        }

        if (valType === 'object') {
          if (shouldSkipReactiveWrapForPath(basePath)) return value
          // Fast path: check array index cache before getPrototypeOf
          if (Array.isArray(obj) && isNumericIndex(prop as string)) {
            const indexCache = getPriv(store).arrayIndexProxyCache.get(obj)
            if (indexCache) {
              const cached = indexCache.get(prop)
              if (cached) return cached
            }
          } else {
            const cached = getPriv(store).proxyCache.get(value)
            if (cached) return cached
          }
          const proto = Object.getPrototypeOf(value)
          if (proto !== Object.prototype && !Array.isArray(value)) return value
          if (Array.isArray(obj) && isNumericIndex(prop as string)) {
            let indexCache = getPriv(store).arrayIndexProxyCache.get(obj)
            if (!indexCache) {
              indexCache = new Map()
              getPriv(store).arrayIndexProxyCache.set(obj, indexCache)
            }
            const propStr = prop as string
            const currentPath = basePath ? `${basePath}.${propStr}` : propStr
            const created = createProxy(value, currentPath, getCachedPathParts(propStr), {
              arrayPathParts: baseParts,
              arrayIndex: Number(propStr),
              baseTail: [],
            })
            indexCache.set(prop, created)
            return created
          }
          const currentPath = basePath ? `${basePath}.${prop}` : (prop as string)
          const created = createProxy(value, currentPath, getCachedPathParts(prop as string))
          getPriv(store).proxyCache.set(value, created)
          return created
        }

        if (prop === 'constructor') return value
        // Route maps (Router._routes / routeConfig) store component classes and guards.
        // Binding them to the routes object breaks identity (router.page === LoginPage) and
        // getComponentAtDepth (layout chain must be raw constructors).
        if (basePath.startsWith('_routes') || basePath.startsWith('routeConfig')) {
          return value
        }
        return value.bind(obj)
      },

      set(obj: any, prop: string | symbol, value: any) {
        if (typeof prop === 'symbol') {
          obj[prop] = value
          return true
        }

        const oldValue = obj[prop]
        if (oldValue === value) return true

        // Fast path for primitive values (most common: string, number, boolean)
        const valType = typeof value
        if (valType !== 'object' || value === null) {
          const isNew = !(prop in obj)
          if (!isNew && oldValue && typeof oldValue === 'object') {
            getPriv(store).proxyCache.delete(oldValue)
            getPriv(store).arrayIndexProxyCache.delete(oldValue)
          }
          obj[prop] = value

          if (cachedArrayMeta && cachedArrayMeta.baseTail.length === 0) {
            store[GEA_STORE_QUEUE_DIRECT_ARRAY_ITEM_PRIMITIVE_CHANGE](
              obj,
              prop,
              value,
              oldValue,
              isNew,
              cachedArrayMeta,
              getCachedPathParts,
              getCachedLeafPathParts,
            )
            return true
          }

          const change: StoreChange = {
            type: isNew ? 'add' : 'update',
            property: prop,
            target: obj,
            pathParts: getCachedPathParts(prop),
            newValue: value,
            previousValue: oldValue,
          }
          if (cachedArrayMeta) {
            change.arrayPathParts = cachedArrayMeta.arrayPathParts
            change.arrayIndex = cachedArrayMeta.arrayIndex
            change.leafPathParts = getCachedLeafPathParts(prop)
            change.isArrayItemPropUpdate = true
          }
          store[GEA_STORE_QUEUE_CHANGE](change)
          store[GEA_STORE_SCHEDULE_FLUSH]()
          return true
        }

        // Object value path (less common)
        value = unwrapNestedProxyValue(value)
        if (prop === 'length' && Array.isArray(obj)) {
          getPriv(store).arrayIndexProxyCache.delete(obj)
          obj[prop] = value
          return true
        }

        const isNew = !Object.prototype.hasOwnProperty.call(obj, prop)
        if (Array.isArray(obj) && isNumericIndex(prop)) getPriv(store).arrayIndexProxyCache.delete(obj)
        if (oldValue && typeof oldValue === 'object') {
          getPriv(store).proxyCache.delete(oldValue)
          getPriv(store).arrayIndexProxyCache.delete(oldValue)
        }
        obj[prop] = value

        if (Array.isArray(oldValue) && Array.isArray(value) && value.length > oldValue.length) {
          let isAppend = true
          for (let i = 0; i < oldValue.length; i++) {
            let o = oldValue[i]
            let v = value[i]
            if (o) o = unwrapNestedProxyValue(o)
            if (v) v = unwrapNestedProxyValue(v)
            if (o !== v) {
              isAppend = false
              break
            }
          }
          if (isAppend) {
            const start = oldValue.length
            const count = value.length - start
            const change: StoreChange = {
              type: 'append',
              property: prop,
              target: obj,
              pathParts: getCachedPathParts(prop),
              start,
              count,
              newValue: value.slice(start),
            }
            if (cachedArrayMeta) {
              change.arrayPathParts = cachedArrayMeta.arrayPathParts
              change.arrayIndex = cachedArrayMeta.arrayIndex
              change.leafPathParts = getCachedLeafPathParts(prop)
              change.isArrayItemPropUpdate = true
            }
            getPriv(store).pendingChanges.push(change)
            if (getPriv(store).pendingBatchKind !== 2) {
              getPriv(store).pendingBatchKind = 2
              getPriv(store).pendingBatchArrayPathParts = null
            }
            if (!getPriv(store).flushScheduled) {
              getPriv(store).flushScheduled = true
              Store.#pendingStores.add(storeRaw(store as Store))
              queueMicrotask(() => store[GEA_STORE_FLUSH_CHANGES]())
            }
            return true
          }
        }

        const change: StoreChange = {
          type: isNew ? 'add' : 'update',
          property: prop,
          target: obj,
          pathParts: getCachedPathParts(prop),
          newValue: value,
          previousValue: oldValue,
        }
        if (cachedArrayMeta) {
          change.arrayPathParts = cachedArrayMeta.arrayPathParts
          change.arrayIndex = cachedArrayMeta.arrayIndex
          change.leafPathParts = getCachedLeafPathParts(prop)
          change.isArrayItemPropUpdate = true
        }
        getPriv(store).pendingChanges.push(change)
        if (getPriv(store).pendingBatchKind !== 2) {
          getPriv(store).pendingBatchKind = 2
          getPriv(store).pendingBatchArrayPathParts = null
        }
        if (!getPriv(store).flushScheduled) {
          getPriv(store).flushScheduled = true
          Store.#pendingStores.add(storeRaw(store as Store))
          queueMicrotask(() => store[GEA_STORE_FLUSH_CHANGES]())
        }
        return true
      },

      deleteProperty(obj: any, prop: string | symbol) {
        if (typeof prop === 'symbol') {
          delete obj[prop]
          return true
        }
        const oldValue = obj[prop]
        if (Array.isArray(obj) && isNumericIndex(prop)) getPriv(store).arrayIndexProxyCache.delete(obj)
        if (oldValue && typeof oldValue === 'object') {
          getPriv(store).proxyCache.delete(oldValue)
          getPriv(store).arrayIndexProxyCache.delete(oldValue)
        }
        delete obj[prop]
        const change: StoreChange = {
          type: 'delete',
          property: prop,
          target: obj,
          pathParts: getCachedPathParts(prop),
          previousValue: oldValue,
        }
        if (cachedArrayMeta) {
          change.arrayPathParts = cachedArrayMeta.arrayPathParts
          change.arrayIndex = cachedArrayMeta.arrayIndex
          change.leafPathParts = getCachedLeafPathParts(prop)
          change.isArrayItemPropUpdate = true
        }
        store[GEA_STORE_QUEUE_CHANGE](change)
        store[GEA_STORE_SCHEDULE_FLUSH]()
        return true
      },
    })

    // Cache the proxy so subsequent accesses (e.g., via .find() in computed
    // getters) return the same reference, enabling stable identity checks.
    if (!Array.isArray(target)) {
      getPriv(this).proxyCache.set(target, proxy)
    }

    return proxy
  }
}

export function rootGetValue(t: any, prop: string, receiver: any): any {
  return Store.rootGetValue(t as Store, prop, receiver)
}

export function rootSetValue(t: any, prop: string, value: any): boolean {
  return Store.rootSetValue(t as Store, prop, value)
}

export function rootDeleteProperty(t: any, prop: string): boolean {
  return Store.rootDeleteProperty(t as Store, prop)
}
