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

function splitPath(path: string | string[]): string[] {
  if (Array.isArray(path)) return path
  return path ? path.split('.') : []
}

function appendPathParts(pathParts: string[], propStr: string): string[] {
  return pathParts.length > 0 ? [...pathParts, propStr] : [propStr]
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
    const p = mkProxy(arr[i], nextPath, appendPathParts(baseParts, String(i)))
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

function isArrayIndexUpdate(change: StoreChange): boolean {
  return change && change.type === 'update' && Array.isArray(change.target) && isNumericIndex(change.property)
}

function isReciprocalSwap(a: StoreChange, b: StoreChange): boolean {
  if (!isArrayIndexUpdate(a) || !isArrayIndexUpdate(b)) return false
  if (a.target !== b.target || a.property === b.property) return false
  if (!samePathParts(a.pathParts.slice(0, -1), b.pathParts.slice(0, -1))) return false
  return a.previousValue === b.newValue && b.previousValue === a.newValue
}

/** Props that must bypass Store reactivity (compiler/runtime internals on Component). */
const INTERNAL_PROPS = new Set(['props', 'actions', 'parentComponent', 'events'])

export function isInternalProp(prop: string): boolean {
  if (prop.charCodeAt(0) === 95) return true // starts with '_'
  if (prop.charCodeAt(prop.length - 1) === 95) return true // ends with '_'
  return INTERNAL_PROPS.has(prop)
}

/**
 * Nested paths that must not be wrapped in reactive proxies (delegated event maps,
 * compiler-generated plain objects, etc.).
 */
function shouldSkipReactiveWrapForPath(basePath: string): boolean {
  if (basePath === 'events' || basePath.startsWith('events.')) return true
  return false
}

export function rootGetValue(t: any, prop: string, receiver: any): any {
  if (!Object.prototype.hasOwnProperty.call(t, prop)) {
    return Reflect.get(t, prop, receiver)
  }
  const value = t[prop]
  if (typeof value === 'function') return value
  if (value !== null && value !== undefined && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && !Array.isArray(value)) return value
    if (shouldSkipReactiveWrapForPath(prop)) return value
    const entry = t._topLevelProxies.get(prop)
    if (entry && entry[0] === value) return entry[1]
    const p = t._createProxy(value, prop, [prop])
    t._topLevelProxies.set(prop, [value, p])
    return p
  }
  return value
}

function getCachedPathParts(t: any, prop: string): string[] {
  let parts = t._pathPartsCache.get(prop)
  if (parts === undefined) {
    parts = [prop]
    t._pathPartsCache.set(prop, parts)
  }
  return parts
}

export function rootSetValue(t: any, prop: string, value: any): boolean {
  if (typeof value === 'function') {
    t[prop] = value
    return true
  }

  // Fast path: primitive value (covers ~90% of mutations)
  if (value === null || value === undefined || typeof value !== 'object') {
    const oldValue = t[prop]
    if (oldValue === value && prop in t) return true
    const hadProp = prop in t
    if (oldValue && typeof oldValue === 'object') {
      t._proxyCache.delete(oldValue)
      t._arrayIndexProxyCache.delete(oldValue)
      t._topLevelProxies.delete(prop)
    }
    t[prop] = value
    t._pendingChanges.push({
      type: hadProp ? 'update' : 'add',
      property: prop,
      target: t,
      pathParts: getCachedPathParts(t, prop),
      newValue: value,
      previousValue: oldValue,
    })
    if (t._pendingBatchKind !== 2) {
      t._pendingBatchKind = 2
      t._pendingBatchArrayPathParts = null
    }
    if (!t._flushScheduled) {
      t._flushScheduled = true
      Store._pendingStores.add(t)
      queueMicrotask(t._flushChanges)
    }
    return true
  }

  if (value.__isProxy) {
    const raw = value.__getTarget
    if (raw !== undefined) value = raw
  }

  const hadProp = Object.prototype.hasOwnProperty.call(t, prop)
  const oldValue = hadProp ? t[prop] : undefined
  if (hadProp && oldValue === value) return true

  if (oldValue && typeof oldValue === 'object') {
    t._proxyCache.delete(oldValue)
    t._arrayIndexProxyCache.delete(oldValue)
  }
  t._topLevelProxies.delete(prop)
  t[prop] = value

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
      t._emitChanges([
        {
          type: 'append',
          property: prop,
          target: t,
          pathParts: getCachedPathParts(t, prop),
          start,
          count: value.length - start,
          newValue: value.slice(start),
        },
      ])
      return true
    }
  }

  t._pendingChanges.push({
    type: hadProp ? 'update' : 'add',
    property: prop,
    target: t,
    pathParts: getCachedPathParts(t, prop),
    newValue: value,
    previousValue: oldValue,
  })
  if (t._pendingBatchKind !== 2) {
    t._pendingBatchKind = 2
    t._pendingBatchArrayPathParts = null
  }
  if (!t._flushScheduled) {
    t._flushScheduled = true
    Store._pendingStores.add(t)
    queueMicrotask(t._flushChanges)
  }
  return true
}

export function rootDeleteProperty(t: any, prop: string): boolean {
  const hadProp = Object.prototype.hasOwnProperty.call(t, prop)
  if (!hadProp) return true
  const oldValue = t[prop]
  if (oldValue && typeof oldValue === 'object') {
    t._proxyCache.delete(oldValue)
    t._arrayIndexProxyCache.delete(oldValue)
  }
  t._topLevelProxies.delete(prop)
  delete t[prop]
  t._emitChanges([
    {
      type: 'delete',
      property: prop,
      target: t,
      pathParts: getCachedPathParts(t, prop),
      previousValue: oldValue,
    },
  ])
  return true
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
  private static _noDirectTopLevelValue = Symbol('noDirectTopLevelValue')
  /**
   * Set by `@geajs/ssr` before rendering. When non-null, `new Store()` uses the returned
   * proxy handler (7 traps, overlay semantics) instead of the lean browser handler (4 traps).
   * Must be set **before** `new Store()` — proxy shape is fixed at construction.
   */
  static _rootProxyHandlerFactory: (() => ProxyHandler<Store>) | null = null

  static _pendingStores: Set<Store> = new Set()
  private static _flushing = false

  static flushAll(): void {
    if (Store._flushing) return
    Store._flushing = true
    try {
      for (const store of Store._pendingStores) {
        store.flushSync()
      }
      Store._pendingStores.clear()
    } finally {
      Store._flushing = false
    }
  }

  private _selfProxy?: this
  private _pendingChanges: StoreChange[] = []
  private _pendingChangesPool: StoreChange[] = []
  private _flushScheduled = false
  private _nextArrayOpId = 0
  private _observerRoot: ObserverNode = createObserverNode([])
  private _proxyCache = new WeakMap()
  private _arrayIndexProxyCache = new WeakMap()
  private _internedArrayPaths = new Map<string, string[]>()
  private _topLevelProxies = new Map<string, [raw: any, proxy: any]>()
  private _pathPartsCache = new Map<string, string[]>()
  private _pendingBatchKind: 0 | 1 | 2 = 0
  private _pendingBatchArrayPathParts: string[] | null = null

  /**
   * Browser root proxy: **4 traps only** (get/set/deleteProperty/defineProperty).
   * No `has`/`ownKeys`/`getOwnPropertyDescriptor` — V8 optimizes this shape better for hot paths.
   *
   * SSR overlay handler lives in `@geajs/ssr` and is wired via `_rootProxyHandlerFactory`.
   */
  private static _browserRootProxyHandler?: ProxyHandler<Store>

  private static _getBrowserRootProxyHandler(): ProxyHandler<Store> {
    if (!Store._browserRootProxyHandler) {
      Store._browserRootProxyHandler = {
        get(t, prop, receiver) {
          if (typeof prop === 'symbol') return Reflect.get(t, prop, receiver)
          if (prop === '__isProxy') return true
          if (prop === '__raw') return t
          if (prop === '__getRawTarget') return t
          if (isInternalProp(prop)) return Reflect.get(t, prop, receiver)
          return rootGetValue(t, prop, receiver)
        },
        set(t, prop, value) {
          if (typeof prop === 'symbol') {
            ;(t as any)[prop] = value
            return true
          }
          if (isInternalProp(prop)) {
            ;(t as any)[prop] = value
            return true
          }
          return rootSetValue(t, prop, value)
        },
        deleteProperty(t, prop) {
          if (typeof prop === 'symbol') {
            delete (t as any)[prop]
            return true
          }
          if (isInternalProp(prop)) {
            delete (t as any)[prop]
            return true
          }
          return rootDeleteProperty(t, prop)
        },
        defineProperty(t, prop, descriptor) {
          return Reflect.defineProperty(t, prop, descriptor)
        },
      }
    }
    return Store._browserRootProxyHandler
  }

  constructor(initialData?: Record<string, any>) {
    const handler = Store._rootProxyHandlerFactory
      ? Store._rootProxyHandlerFactory()
      : Store._getBrowserRootProxyHandler()
    const proxy = new Proxy(this, handler) as this
    this._selfProxy = proxy

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
  get __store(): this {
    return this
  }

  flushSync(): void {
    if (this._pendingChanges.length > 0) {
      this._flushChanges()
    }
  }

  silent(fn: () => void): void {
    try {
      fn()
    } finally {
      this._pendingChanges = []
      this._flushScheduled = false
      this._pendingBatchKind = 0
      this._pendingBatchArrayPathParts = null
    }
  }

  observe(path: string | string[], handler: StoreObserver): () => void {
    const pathParts = splitPath(path)
    return this._addObserver(pathParts, handler)
  }

  private _addObserver(pathParts: string[], handler: StoreObserver): () => void {
    const nodes = [this._observerRoot]
    let node = this._observerRoot

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

  private _collectMatchingObserverNodes(pathParts: string[]): ObserverNode[] {
    const matches: ObserverNode[] = []
    let node: ObserverNode | undefined = this._observerRoot

    if (node.handlers.size > 0) matches.push(node)

    for (let i = 0; i < pathParts.length; i++) {
      node = node.children.get(pathParts[i])
      if (!node) break
      if (node.handlers.size > 0) matches.push(node)
    }

    return matches
  }

  private _collectDescendantObserverNodes(node: ObserverNode, matches: ObserverNode[]): void {
    for (const child of node.children.values()) {
      if (child.handlers.size > 0) matches.push(child)
      if (child.children.size > 0) this._collectDescendantObserverNodes(child, matches)
    }
  }

  /** When a property is replaced with a new object, descendant observers
   *  must be notified because their nested values may have changed. */
  private _addDescendantsForObjectReplacement(change: StoreChange, matches: ObserverNode[]): void {
    if ((change.type === 'update' || change.type === 'add') && change.newValue && typeof change.newValue === 'object') {
      const node = this._getObserverNode(change.pathParts)
      if (node && node.children.size > 0) {
        this._collectDescendantObserverNodes(node, matches)
      }
    }
  }

  private _getObserverNode(pathParts: string[]): ObserverNode | null {
    let node: ObserverNode | undefined = this._observerRoot
    for (let i = 0; i < pathParts.length; i++) {
      node = node.children.get(pathParts[i])
      if (!node) return null
    }
    return node
  }

  private _collectMatchingObserverNodesFromNode(
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

  private _notifyHandlers(node: ObserverNode, relevant: StoreChange[]): void {
    const value = getByPathParts(this, node.pathParts)
    for (const handler of node.handlers) {
      handler(value, relevant)
    }
  }

  private _notifyHandlersWithValue(node: ObserverNode, value: any, relevant: StoreChange[]): void {
    const handlers = node.handlers
    if (handlers.size === 1) {
      handlers.values().next().value!(value, relevant)
      return
    }
    for (const handler of handlers) {
      handler(value, relevant)
    }
  }

  private _getDirectTopLevelObservedValue(change: StoreChange): any {
    const nextValue = change.newValue
    if (Array.isArray(nextValue) && nextValue.length === 0) return nextValue
    return Store._noDirectTopLevelValue
  }

  private _getTopLevelObservedValue(change: StoreChange): any {
    if (change.type === 'delete') return undefined
    const value = (this as any)[change.property]
    if (value === null || value === undefined || typeof value !== 'object') return value
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && !Array.isArray(value)) return value
    const entry = this._topLevelProxies.get(change.property)
    if (entry && entry[0] === value) return entry[1]
    const proxy = this._createProxy(value, change.property, [change.property])
    this._topLevelProxies.set(change.property, [value, proxy])
    return proxy
  }

  private _clearArrayIndexCache(arr: any): void {
    if (arr && typeof arr === 'object') this._arrayIndexProxyCache.delete(arr)
  }

  private _normalizeBatch(batch: StoreChange[]): StoreChange[] {
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
        const opId = `swap:${this._nextArrayOpId++}`
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

  private _deliverArrayItemPropBatch(batch: StoreChange[]): boolean {
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

    return this._deliverKnownArrayItemPropBatch(batch, arrayPathParts!)
  }

  private _deliverKnownArrayItemPropBatch(batch: StoreChange[], arrayPathParts: string[]): boolean {
    const arrayNode = this._getObserverNode(arrayPathParts)
    if (
      this._observerRoot.handlers.size === 0 &&
      arrayNode &&
      arrayNode.children.size === 0 &&
      arrayNode.handlers.size > 0
    ) {
      this._notifyHandlers(arrayNode, batch)
      return true
    }

    const commonMatches = this._collectMatchingObserverNodes(arrayPathParts)
    for (let i = 0; i < commonMatches.length; i++) {
      this._notifyHandlers(commonMatches[i], batch)
    }

    if (!arrayNode || arrayNode.children.size === 0) return true

    const deliveries = new Map<ObserverNode, StoreChange[]>()
    const suffixOffset = arrayPathParts.length

    for (let i = 0; i < batch.length; i++) {
      const change = batch[i]
      const matches = this._collectMatchingObserverNodesFromNode(arrayNode, change.pathParts, suffixOffset)
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
      this._notifyHandlers(node, relevant)
    }

    return true
  }

  private _deliverTopLevelBatch(batch: StoreChange[]): boolean {
    if (this._observerRoot.handlers.size > 0) return false

    if (batch.length === 1) {
      const change = batch[0]
      if (change.target !== this || change.pathParts.length !== 1) return false
      const node = this._observerRoot.children.get(change.property)
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
          const directValue = this._getDirectTopLevelObservedValue(change)
          value = directValue !== Store._noDirectTopLevelValue ? directValue : this._getTopLevelObservedValue(change)
        }
      }
      this._notifyHandlersWithValue(node, value, batch)
      return true
    }

    const deliveries = new Map<ObserverNode, { value: any; relevant: StoreChange[] }>()
    for (let i = 0; i < batch.length; i++) {
      const change = batch[i]
      if (change.target !== this || change.pathParts.length !== 1) return false
      const node = this._observerRoot.children.get(change.property)
      if (!node) continue
      if (node.children.size > 0) return false
      if (node.handlers.size === 0) continue

      let delivery = deliveries.get(node)
      if (!delivery) {
        const directValue = this._getDirectTopLevelObservedValue(change)
        delivery = {
          value: directValue !== Store._noDirectTopLevelValue ? directValue : this._getTopLevelObservedValue(change),
          relevant: [],
        }
        deliveries.set(node, delivery)
      }
      delivery.relevant.push(change)
    }

    for (const [node, delivery] of deliveries) {
      this._notifyHandlersWithValue(node, delivery.value, delivery.relevant)
    }
    return true
  }

  private _flushChanges = (): void => {
    this._flushScheduled = false
    Store._pendingStores.delete(this)
    const pendingBatch = this._pendingChanges
    const pendingBatchKind = this._pendingBatchKind
    const pendingBatchArrayPathParts = this._pendingBatchArrayPathParts
    this._pendingChangesPool.length = 0
    this._pendingChanges = this._pendingChangesPool
    this._pendingChangesPool = pendingBatch
    this._pendingBatchKind = 0
    this._pendingBatchArrayPathParts = null
    if (pendingBatch.length === 0) return

    if (
      pendingBatchKind === 1 &&
      pendingBatchArrayPathParts &&
      this._deliverKnownArrayItemPropBatch(pendingBatch, pendingBatchArrayPathParts)
    ) {
      return
    }

    // Inlined fast path for single top-level change (covers select-row, clear-rows)
    if (pendingBatch.length === 1) {
      const change = pendingBatch[0]
      if (change.target === this && change.pathParts.length === 1 && this._observerRoot.handlers.size === 0) {
        const node = this._observerRoot.children.get(change.property)
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
                  value = this._getTopLevelObservedValue(change)
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
    if (pendingBatch.length === 2 && this._observerRoot.handlers.size === 0) {
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
        const opId = `swap:${this._nextArrayOpId++}`
        const arrayPathParts = c0.pathParts.length > 1 ? c0.pathParts.slice(0, -1) : c0.pathParts
        c0.arrayOp = 'swap'
        c1.arrayOp = 'swap'
        c0.opId = opId
        c1.opId = opId
        c0.otherIndex = Number(c1.property)
        c1.otherIndex = Number(c0.property)
        c0.arrayPathParts = arrayPathParts
        c1.arrayPathParts = arrayPathParts

        let node: ObserverNode | undefined = this._observerRoot
        for (let i = 0; i < arrayPathParts.length; i++) {
          node = node!.children.get(arrayPathParts[i])
          if (!node) break
        }
        if (node && node.handlers.size > 0) {
          const value = getByPathParts(this, node.pathParts)
          for (const handler of node.handlers) handler(value, pendingBatch)
        }
        return
      }
    }

    if (this._deliverTopLevelBatch(pendingBatch)) return

    const batch = this._normalizeBatch(pendingBatch)

    if (this._deliverArrayItemPropBatch(batch)) return

    if (batch.length === 1) {
      const change = batch[0]
      const matches = this._collectMatchingObserverNodes(change.pathParts)
      this._addDescendantsForObjectReplacement(change, matches)
      for (let i = 0; i < matches.length; i++) {
        this._notifyHandlers(matches[i], batch)
      }
      return
    }

    const deliveries = new Map<ObserverNode, StoreChange[]>()
    for (let i = 0; i < batch.length; i++) {
      const change = batch[i]
      const matches = this._collectMatchingObserverNodes(change.pathParts)
      this._addDescendantsForObjectReplacement(change, matches)
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
      this._notifyHandlers(node, relevant)
    }
  }

  private _emitChanges(changes: StoreChange[]): void {
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]
      this._pendingChanges.push(change)
      this._trackPendingChange(change)
    }
    if (!this._flushScheduled) {
      this._flushScheduled = true
      Store._pendingStores.add(this)
      queueMicrotask(this._flushChanges)
    }
  }

  private _queueChange(change: StoreChange): void {
    this._pendingChanges.push(change)
    this._trackPendingChange(change)
  }

  private _trackPendingChange(change: StoreChange): void {
    if (this._pendingBatchKind === 2) return
    if (!change.isArrayItemPropUpdate || !change.arrayPathParts) {
      this._pendingBatchKind = 2
      this._pendingBatchArrayPathParts = null
      return
    }

    if (this._pendingBatchKind === 0) {
      this._pendingBatchKind = 1
      this._pendingBatchArrayPathParts = change.arrayPathParts
      return
    }

    const pendingArrayPathParts = this._pendingBatchArrayPathParts
    if (
      pendingArrayPathParts !== change.arrayPathParts &&
      !samePathParts(pendingArrayPathParts!, change.arrayPathParts)
    ) {
      this._pendingBatchKind = 2
      this._pendingBatchArrayPathParts = null
    }
  }

  private _scheduleFlush(): void {
    if (!this._flushScheduled) {
      this._flushScheduled = true
      Store._pendingStores.add(this)
      queueMicrotask(this._flushChanges)
    }
  }

  private _queueDirectArrayItemPrimitiveChange(
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
    this._pendingChanges.push(change)
    if (this._pendingBatchKind === 0) {
      this._pendingBatchKind = 1
      this._pendingBatchArrayPathParts = change.arrayPathParts
    } else if (this._pendingBatchKind === 1) {
      const pp = this._pendingBatchArrayPathParts
      if (pp !== change.arrayPathParts && !samePathParts(pp!, change.arrayPathParts)) {
        this._pendingBatchKind = 2
        this._pendingBatchArrayPathParts = null
      }
    }
    if (!this._flushScheduled) {
      this._flushScheduled = true
      Store._pendingStores.add(this)
      queueMicrotask(this._flushChanges)
    }
  }

  private _interceptArrayMethod(arr: any[], method: string, _basePath: string, baseParts: string[]): Function | null {
    const store = this // eslint-disable-line @typescript-eslint/no-this-alias
    switch (method) {
      case 'splice':
        return function (...args: any[]) {
          store._clearArrayIndexCache(arr)
          const len = arr.length
          const rawStart = args[0] ?? 0
          const start = rawStart < 0 ? Math.max(len + rawStart, 0) : Math.min(rawStart, len)
          const deleteCount = args.length < 2 ? len - start : Math.min(Math.max(args[1] ?? 0, 0), len - start)
          const items = args.slice(2).map((v) => (v && typeof v === 'object' && v.__isProxy ? v.__getTarget : v))
          const removed = arr.slice(start, start + deleteCount)
          Array.prototype.splice.call(arr, start, deleteCount, ...items)
          if (deleteCount === 0 && items.length > 0 && start === len) {
            store._emitChanges([
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
          if (changes.length > 0) store._emitChanges(changes)
          return removed
        }
      case 'push':
        return function (...items: any[]) {
          store._clearArrayIndexCache(arr)
          const rawItems = items.map((v) => (v && typeof v === 'object' && v.__isProxy ? v.__getTarget : v))
          const startIndex = arr.length
          Array.prototype.push.apply(arr, rawItems)
          if (rawItems.length > 0) {
            store._emitChanges([
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
          store._clearArrayIndexCache(arr)
          const idx = method === 'pop' ? arr.length - 1 : 0
          const removed = arr[idx]
          if (method === 'pop') Array.prototype.pop.call(arr)
          else Array.prototype.shift.call(arr)
          store._emitChanges([
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
          store._clearArrayIndexCache(arr)
          const rawItems = items.map((v) => (v && typeof v === 'object' && v.__isProxy ? v.__getTarget : v))
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
          if (changes.length > 0) store._emitChanges(changes)
          return arr.length
        }
      case 'sort':
      case 'reverse':
        return function (...args: any[]) {
          store._clearArrayIndexCache(arr)
          const previousOrder = arr.slice()
          Array.prototype[method].apply(arr, args)
          const used = new Array(previousOrder.length).fill(false)
          const permutation = new Array(arr.length)
          for (let i = 0; i < arr.length; i++) {
            let previousIndex = -1
            for (let j = 0; j < previousOrder.length; j++) {
              if (used[j]) continue
              if (previousOrder[j] !== arr[i]) continue
              previousIndex = j
              used[j] = true
              break
            }
            permutation[i] = previousIndex === -1 ? i : previousIndex
          }
          store._emitChanges([
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

  private _interceptArrayIterator(
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
          const raw =
            searchElement && typeof searchElement === 'object' && searchElement.__isProxy
              ? searchElement.__getTarget
              : searchElement
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
            const p = mkProxy(arr[i], nextPath, appendPathParts(baseParts, String(i)))
            acc = cb(acc, p, i, arr)
          }
          return acc
        }
      default:
        return null
    }
  }

  private _getCachedArrayMeta(baseParts: string[]): ArrayProxyMeta | null {
    for (let i = baseParts.length - 1; i >= 0; i--) {
      if (!isNumericIndex(baseParts[i])) continue
      let internKey: string
      let interned: string[]
      if (i === 1) {
        internKey = baseParts[0]
        interned = this._internedArrayPaths.get(internKey)!
        if (!interned) {
          interned = [baseParts[0]]
          this._internedArrayPaths.set(internKey, interned)
        }
      } else {
        internKey = baseParts.slice(0, i).join('\0')
        interned = this._internedArrayPaths.get(internKey)!
        if (!interned) {
          interned = baseParts.slice(0, i)
          this._internedArrayPaths.set(internKey, interned)
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

  private _createProxy(target: any, basePath: string, baseParts: string[] = [], arrayMeta?: ArrayProxyMeta): any {
    if (!target || typeof target !== 'object') return target

    // Return cached proxy if one already exists for this raw object.
    // This ensures stable references for computed getters that traverse
    // the same objects (e.g., store.activeConversation via .find()).
    // Also prevents infinite recursion for circular references (arrays included).
    const cached = this._proxyCache.get(target)
    if (cached) return cached

    const store = this // eslint-disable-line @typescript-eslint/no-this-alias
    const cachedArrayMeta = arrayMeta ?? store._getCachedArrayMeta(baseParts)
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

    const createProxy = store._createProxy.bind(store)

    const proxy = new Proxy(target, {
      get(obj: any, prop: string | symbol) {
        if (typeof prop === 'symbol') return obj[prop]
        // Meta property checks (used by framework internals)
        // charCode 95 = '_', fast pre-check to skip for normal properties
        if ((prop as string).charCodeAt(0) === 95 && (prop as string).charCodeAt(1) === 95) {
          if (prop === '__getTarget') return obj
          if (prop === '__isProxy') return true
          if (prop === '__raw') return obj
          if (prop === '__getPath') return basePath
          if (prop === '__store') return store._selfProxy || store
        }

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
            store._interceptArrayMethod(obj, prop, basePath, baseParts) ||
            store._interceptArrayIterator(obj, prop, basePath, baseParts, createProxy) ||
            value.bind(obj)
          methodCache.set(prop, cached)
          return cached
        }

        if (valType === 'object') {
          if (shouldSkipReactiveWrapForPath(basePath)) return value
          // Fast path: check array index cache before getPrototypeOf
          if (Array.isArray(obj) && isNumericIndex(prop as string)) {
            const indexCache = store._arrayIndexProxyCache.get(obj)
            if (indexCache) {
              const cached = indexCache.get(prop)
              if (cached) return cached
            }
          } else {
            const cached = store._proxyCache.get(value)
            if (cached) return cached
          }
          const proto = Object.getPrototypeOf(value)
          if (proto !== Object.prototype && !Array.isArray(value)) return value
          if (Array.isArray(obj) && isNumericIndex(prop as string)) {
            let indexCache = store._arrayIndexProxyCache.get(obj)
            if (!indexCache) {
              indexCache = new Map()
              store._arrayIndexProxyCache.set(obj, indexCache)
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
          store._proxyCache.set(value, created)
          return created
        }

        if (prop === 'constructor') return value
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
            store._proxyCache.delete(oldValue)
            store._arrayIndexProxyCache.delete(oldValue)
          }
          obj[prop] = value

          if (cachedArrayMeta && cachedArrayMeta.baseTail.length === 0) {
            store._queueDirectArrayItemPrimitiveChange(
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
          store._queueChange(change)
          store._scheduleFlush()
          return true
        }

        // Object value path (less common)
        if (value && typeof value === 'object' && value.__isProxy) {
          const raw = value.__getTarget
          if (raw !== undefined) value = raw
        }
        if (prop === 'length' && Array.isArray(obj)) {
          store._arrayIndexProxyCache.delete(obj)
          obj[prop] = value
          return true
        }

        const isNew = !Object.prototype.hasOwnProperty.call(obj, prop)
        if (Array.isArray(obj) && isNumericIndex(prop)) store._arrayIndexProxyCache.delete(obj)
        if (oldValue && typeof oldValue === 'object') {
          store._proxyCache.delete(oldValue)
          store._arrayIndexProxyCache.delete(oldValue)
        }
        obj[prop] = value

        if (Array.isArray(oldValue) && Array.isArray(value) && value.length > oldValue.length) {
          let isAppend = true
          for (let i = 0; i < oldValue.length; i++) {
            let o = oldValue[i]
            let v = value[i]
            if (o && o.__isProxy) o = o.__getTarget
            if (v && v.__isProxy) v = v.__getTarget
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
            store._pendingChanges.push(change)
            if (store._pendingBatchKind !== 2) {
              store._pendingBatchKind = 2
              store._pendingBatchArrayPathParts = null
            }
            if (!store._flushScheduled) {
              store._flushScheduled = true
              Store._pendingStores.add(store)
              queueMicrotask(store._flushChanges)
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
        store._pendingChanges.push(change)
        if (store._pendingBatchKind !== 2) {
          store._pendingBatchKind = 2
          store._pendingBatchArrayPathParts = null
        }
        if (!store._flushScheduled) {
          store._flushScheduled = true
          Store._pendingStores.add(store)
          queueMicrotask(store._flushChanges)
        }
        return true
      },

      deleteProperty(obj: any, prop: string | symbol) {
        if (typeof prop === 'symbol') {
          delete obj[prop]
          return true
        }
        const oldValue = obj[prop]
        if (Array.isArray(obj) && isNumericIndex(prop)) store._arrayIndexProxyCache.delete(obj)
        if (oldValue && typeof oldValue === 'object') {
          store._proxyCache.delete(oldValue)
          store._arrayIndexProxyCache.delete(oldValue)
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
        store._queueChange(change)
        store._scheduleFlush()
        return true
      },
    })

    // Cache the proxy so subsequent accesses (e.g., via .find() in computed
    // getters) return the same reference, enabling stable identity checks.
    // Arrays are also cached to detect and short-circuit circular references.
    this._proxyCache.set(target, proxy)

    return proxy
  }
}
