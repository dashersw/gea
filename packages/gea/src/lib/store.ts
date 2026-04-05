import { tryComponentRootBridgeGet, tryComponentRootBridgeSet } from './component-root-bridge'
import {
  GEA_SELF_PROXY,
  GEA_STORE_ROOT,
  GEA_PROXY_GET_PATH,
  GEA_PROXY_GET_RAW_TARGET,
  GEA_PROXY_GET_TARGET,
  GEA_PROXY_IS_PROXY,
  GEA_PROXY_RAW,
} from './symbols'

const _isArr = Array.isArray
const _getProto = Object.getPrototypeOf
const _objProto = Object.prototype
const _hasOwn = _objProto.hasOwnProperty
const _isPlain = (v: any): boolean => {
  const p = _getProto(v)
  return p === _objProto || p === null || _isArr(v)
}

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
  aipu?: boolean
  arix?: number
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

const _mkNode = (pathParts: string[]): ObserverNode => ({ pathParts, handlers: new Set(), children: new Map() })

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
  if (_isArr(path)) return path
  return path ? path.split('.') : []
}

function appendPathParts(pathParts: string[], propStr: string): string[] {
  return [...pathParts, propStr]
}

function joinPath(basePath: string, seg: string | number): string {
  return basePath ? `${basePath}.${seg}` : String(seg)
}

function _mkChange(
  type: string,
  property: string,
  target: any,
  pathParts: string[],
  newValue?: any,
  previousValue?: any,
): StoreChange {
  return { type, property, target, pathParts, newValue, previousValue }
}

function _mkAppend(
  property: string,
  target: any,
  pathParts: string[],
  start: number,
  count: number,
  newValue: any,
): StoreChange {
  return { type: 'append', property, target, pathParts, start, count, newValue }
}

function _commitObjSet(
  store: Store,
  isNew: boolean,
  prop: string,
  obj: any,
  objPathParts: string[],
  val: any,
  old: any,
  unwrapAppend: boolean,
  p: StoreInstancePrivate,
  aMeta?: ArrayProxyMeta | null,
  leafFn?: (p: string) => string[],
): void {
  const c =
    _isArr(old) && _isArr(val) && val.length > old.length && _isAppend(old, val, unwrapAppend)
      ? _mkAppend(prop, obj, objPathParts, old.length, val.length - old.length, val.slice(old.length))
      : _mkChange(isNew ? 'add' : 'update', prop, obj, objPathParts, val, old)
  if (aMeta && leafFn) _tagArrayItem(c, aMeta, leafFn(prop))
  _pushAndSchedule(store, c, p)
}

function shouldWrapNestedReactiveValue(value: any): boolean {
  return value != null && typeof value === 'object' && _isPlain(value)
}

const getByPathParts = (obj: any, pathParts: string[]): any => pathParts.reduce((o: any, k: string) => o?.[k], obj)

function _wrapItem(store: Store, arr: any[], i: number, basePath: string, baseParts: string[]): any {
  const raw = arr[i]
  return shouldWrapNestedReactiveValue(raw)
    ? _createProxy(store, raw, joinPath(basePath, i), appendPathParts(baseParts, String(i)))
    : raw
}

function proxyIterate(
  store: Store,
  arr: any[],
  basePath: string,
  baseParts: string[],
  method: string,
  cb: Function,
  thisArg?: any,
): any {
  const isMap = method === 'map'
  const result: any = isMap ? new Array(arr.length) : method === 'filter' ? [] : undefined
  for (let i = 0; i < arr.length; i++) {
    const p = _wrapItem(store, arr, i, basePath, baseParts)
    const v = cb.call(thisArg, p, i, arr)
    if (isMap) {
      result[i] = v
    } else if (v) {
      if (method === 'filter') result.push(p)
      else if (method === 'find') return p
    }
  }
  return result
}

function isNumericIndex(value: string): boolean {
  return value.length > 0 && !/\D/.test(value)
}

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

function isArrayIndexUpdate(change: StoreChange): boolean {
  return change && change.type === 'update' && _isArr(change.target) && isNumericIndex(change.property)
}

function isReciprocalSwap(a: StoreChange, b: StoreChange): boolean {
  if (!isArrayIndexUpdate(a) || !isArrayIndexUpdate(b)) return false
  if (a.target !== b.target || a.property === b.property) return false
  const ap = a.pathParts,
    bp = b.pathParts
  if (ap.length !== bp.length) return false
  for (let i = 0, end = ap.length - 1; i < end; i++) if (ap[i] !== bp[i]) return false
  return a.previousValue === b.newValue && b.previousValue === a.newValue
}

/**
 * Walk the prototype chain for `prop` (same as Reflect.get semantics for accessors).
 * Used by the root proxy and SSR so `set`/`delete` on accessors do not go through
 * reactive `rootSetValue`/`rootDeleteProperty` (no change notifications for framework
 * getters/setters; user data fields remain plain data properties).
 */
export function findPropertyDescriptor(obj: any, prop: string): PropertyDescriptor | undefined {
  for (let o: any = obj; o; o = _getProto(o)) {
    const d = Object.getOwnPropertyDescriptor(o, prop)
    if (d) return d
  }
}

const _skipRx = /^(props|events|compiledItems|routeConfig)\b/

function shouldSkipReactiveWrapForPath(basePath: string): boolean {
  if (_skipRx.test(basePath)) return true
  const dot = basePath.indexOf('.')
  const head = dot === -1 ? basePath : basePath.slice(0, dot)
  if (head === '_items' || /^_[a-zA-Z][a-zA-Z0-9]*Items$/.test(head)) return true
  return false
}

// ---------------------------------------------------------------------------
// Module-level state (replaces Store private statics)
// ---------------------------------------------------------------------------

const _pendingStores: Set<Store> = new Set()
const _emptyArr: any[] = []
let _flushing = false
let _browserRootProxyHandler: ProxyHandler<Store> | undefined

// ---------------------------------------------------------------------------
// Module-level functions (converted from Store methods)
// ---------------------------------------------------------------------------

function _rootPathPartsCache(priv: StoreInstancePrivate, prop: string): string[] {
  const m = priv.pathPartsCache
  let p = m.get(prop)
  if (!p) m.set(prop, (p = [prop]))
  return p
}

/**
 * Browser root proxy: **4 traps only** (get/set/deleteProperty/defineProperty).
 * No `has`/`ownKeys`/`getOwnPropertyDescriptor` — V8 optimizes this shape better for hot paths.
 *
 * SSR overlay handler lives in `@geajs/ssr` and is wired via `Store.rootProxyHandlerFactory`.
 */
function _bindVal(v: any, ctx: any): any {
  return typeof v !== 'function' ? v : isClassConstructorValue(v) ? v : v.bind(ctx)
}

export function _getBrowserRootProxyHandler(): ProxyHandler<Store> {
  if (!_browserRootProxyHandler) {
    _browserRootProxyHandler = {
      get(t, prop, receiver) {
        if (typeof prop === 'symbol') {
          if (prop === GEA_PROXY_IS_PROXY) return true
          if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_RAW_TARGET) return t
          return Reflect.get(t, prop, receiver)
        }
        if (typeof prop === 'string') {
          const bridged = tryComponentRootBridgeGet(t, prop)
          if (bridged?.ok) return _bindVal(bridged.value, receiver)
        }
        return _bindVal(Store.rootGetValue(t, prop, receiver), receiver)
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
    }
  }
  return _browserRootProxyHandler
}

function _addObserver(store: Store, pathParts: string[], handler: StoreObserver): () => void {
  const p = getPriv(store)
  const nodes = [p.observerRoot]
  let node = p.observerRoot

  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i]
    let child = node.children.get(part)
    if (!child) {
      child = _mkNode(appendPathParts(node.pathParts, part))
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

function _collectMatchingNodes(root: ObserverNode, pathParts: string[]): ObserverNode[] {
  const matches: ObserverNode[] = []
  let node: ObserverNode | undefined = root

  if (node.handlers.size > 0) matches.push(node)

  for (let i = 0; i < pathParts.length; i++) {
    node = node.children.get(pathParts[i])
    if (!node) break
    if (node.handlers.size > 0) matches.push(node)
  }

  return matches
}

function _collectDescendantNodes(node: ObserverNode, matches: ObserverNode[]): void {
  for (const child of node.children.values()) {
    if (child.handlers.size > 0) matches.push(child)
    if (child.children.size > 0) _collectDescendantNodes(child, matches)
  }
}

/** When a property is replaced with a new object, descendant observers
 *  must be notified because their nested values may have changed. */
function _getObserverNode(root: ObserverNode, pathParts: string[]): ObserverNode | null {
  let node: ObserverNode | undefined = root
  for (let i = 0; i < pathParts.length; i++) {
    node = node.children.get(pathParts[i])
    if (!node) return null
  }
  return node
}

function _notify(raw: Store, node: ObserverNode, relevant: StoreChange[], value?: any): void {
  const v = arguments.length > 3 ? value : getByPathParts(raw, node.pathParts)
  for (const handler of node.handlers) handler(v, relevant)
}

function _topProxy(store: Store, prop: string, value: any, p?: StoreInstancePrivate): any {
  if (!p) {
    p = getPriv(store)
    const entry = p.topLevelProxies.get(prop)
    if (entry && entry[0] === value) return entry[1]
  }
  const proxy = _createProxy(store, value, prop, [prop], undefined, p)
  p.topLevelProxies.set(prop, [value, proxy])
  return proxy
}

function _getTopLevelValue(raw: Store, change: StoreChange): any {
  if (change.type === 'delete') return undefined
  const value = (raw as any)[change.property]
  if (value == null || typeof value !== 'object') return value
  if (!_isPlain(value)) return value
  return _topProxy(raw, change.property, value)
}

function _tagArrayItem(c: StoreChange, m: ArrayProxyMeta, leafParts: string[]): void {
  c.arrayPathParts = m.arrayPathParts
  c.arrayIndex = m.arrayIndex
  c.leafPathParts = leafParts
  c.isArrayItemPropUpdate = true
}

function _dropCaches(p: StoreInstancePrivate, v: any): void {
  p.proxyCache.delete(v)
  p.arrayIndexProxyCache.delete(v)
}

function _dropOld(p: StoreInstancePrivate, old: any): void {
  if (old && typeof old === 'object') _dropCaches(p, old)
}

function _clearArrayIndexCache(p: StoreInstancePrivate, arr: any): void {
  p.arrayIndexProxyCache.delete(arr)
}

function _normalizeBatch(p: StoreInstancePrivate, batch: StoreChange[]): StoreChange[] {
  if (batch.length < 2) return batch

  for (let i = 0; i < batch.length; i++) {
    const change = batch[i]
    if (change.opId || !isArrayIndexUpdate(change)) continue

    for (let j = i + 1; j < batch.length; j++) {
      const candidate = batch[j]
      if (candidate.opId || !isReciprocalSwap(change, candidate)) continue

      const opId = `swap:${p.nextArrayOpId++}`
      const parentParts = change.pathParts.slice(0, -1)
      change.arrayPathParts = candidate.arrayPathParts = parentParts
      change.arrayOp = candidate.arrayOp = 'swap'
      change.otherIndex = Number(candidate.property)
      candidate.otherIndex = Number(change.property)
      change.opId = candidate.opId = opId
      break
    }
  }

  return batch
}

function _deliverArrayBatch(
  raw: Store,
  p: StoreInstancePrivate,
  batch: StoreChange[],
  knownArrayPathParts?: string[],
): boolean {
  let arrayPathParts = knownArrayPathParts
  if (!arrayPathParts) {
    if (!batch[0]?.isArrayItemPropUpdate) return false
    arrayPathParts = batch[0].arrayPathParts!
    for (let i = 1; i < batch.length; i++) {
      const change = batch[i]
      if (
        !change.isArrayItemPropUpdate ||
        (change.arrayPathParts !== arrayPathParts && !samePathParts(change.arrayPathParts!, arrayPathParts))
      ) {
        return false
      }
    }
  }

  const root = p.observerRoot
  const arrayNode = _getObserverNode(root, arrayPathParts)
  if (root.handlers.size === 0 && arrayNode && arrayNode.children.size === 0 && arrayNode.handlers.size > 0) {
    _notify(raw, arrayNode, batch)
    return true
  }

  const commonMatches = _collectMatchingNodes(root, arrayPathParts)
  for (let i = 0; i < commonMatches.length; i++) {
    _notify(raw, commonMatches[i], batch)
  }

  if (!arrayNode || arrayNode.children.size === 0) return true

  const deliveries = new Map<ObserverNode, StoreChange[]>()
  const suffixOffset = arrayPathParts.length

  for (let i = 0; i < batch.length; i++) {
    const change = batch[i]
    let cur: ObserverNode | undefined = arrayNode
    for (let k = suffixOffset; k < change.pathParts.length; k++) {
      cur = cur.children.get(change.pathParts[k])
      if (!cur) break
      if (cur.handlers.size > 0) {
        let relevant = deliveries.get(cur)
        if (!relevant) deliveries.set(cur, (relevant = []))
        relevant.push(change)
      }
    }
  }

  for (const [node, relevant] of deliveries) {
    _notify(raw, node, relevant)
  }

  return true
}

function _deliverTopLevelBatch(raw: Store, p: StoreInstancePrivate, batch: StoreChange[]): boolean {
  const root = p.observerRoot
  if (root.handlers.size > 0) return false

  if (batch.length === 1) {
    const change = batch[0]
    if (change.target !== raw || change.pathParts.length !== 1) return false
    const node = root.children.get(change.property)
    if (!node || node.handlers.size === 0) return true
    if (node.children.size > 0) return false
    const nv = change.newValue
    const value = _isArr(nv) && nv.length === 0 ? nv : _getTopLevelValue(raw, change)
    _notify(raw, node, batch, value)
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
      const nv = change.newValue
      deliveries.set(
        node,
        (delivery = {
          value: _isArr(nv) && nv.length === 0 ? nv : _getTopLevelValue(raw, change),
          relevant: [],
        }),
      )
    }
    delivery.relevant.push(change)
  }

  for (const [node, delivery] of deliveries) {
    _notify(raw, node, delivery.relevant, delivery.value)
  }
  return true
}

function _flushChanges(raw: Store, p: StoreInstancePrivate): void {
  p.flushScheduled = false
  _pendingStores.delete(raw)
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
    _deliverArrayBatch(raw, p, pendingBatch, pendingBatchArrayPathParts)
  ) {
    return
  }

  if (_deliverTopLevelBatch(raw, p, pendingBatch)) return

  const batch = _normalizeBatch(p, pendingBatch)

  if (_deliverArrayBatch(raw, p, batch)) return

  const root = p.observerRoot
  const deliveries = new Map<ObserverNode, StoreChange[]>()
  for (let i = 0; i < batch.length; i++) {
    const change = batch[i]
    const matches = _collectMatchingNodes(root, change.pathParts)
    if ((change.type === 'update' || change.type === 'add') && change.newValue && typeof change.newValue === 'object') {
      const node = _getObserverNode(root, change.pathParts)
      if (node && node.children.size > 0) _collectDescendantNodes(node, matches)
    }
    for (let j = 0; j < matches.length; j++) {
      const node = matches[j]
      let relevant = deliveries.get(node)
      if (!relevant) deliveries.set(node, (relevant = []))
      relevant.push(change)
    }
  }

  for (const [node, relevant] of deliveries) {
    _notify(raw, node, relevant)
  }
}

function _pushAndSchedule(raw: Store, changes: StoreChange | StoreChange[], p: StoreInstancePrivate): void {
  if (_isArr(changes)) for (const c of changes) p.pendingChanges.push(c)
  else p.pendingChanges.push(changes)
  if (p.pendingBatchKind !== 2) {
    p.pendingBatchKind = 2
    p.pendingBatchArrayPathParts = null
  }
  if (!p.flushScheduled) _scheduleFlush(p, raw)
}

function _isAppend(oldArr: any[], newArr: any[], unwrap: boolean): boolean {
  for (let i = 0; i < oldArr.length; i++) {
    let o = oldArr[i],
      v = newArr[i]
    if (unwrap) {
      if (o) o = unwrapNestedProxyValue(o)
      if (v) v = unwrapNestedProxyValue(v)
    }
    if (o !== v) return false
  }
  return true
}

function _queueChange(raw: Store, change: StoreChange, p: StoreInstancePrivate): void {
  p.pendingChanges.push(change)
  if (
    p.pendingBatchKind !== 2 &&
    !(p.pendingBatchKind === 1 && p.pendingBatchArrayPathParts === change.arrayPathParts)
  ) {
    _trackPendingChange(p, change)
  }
  if (!p.flushScheduled) _scheduleFlush(p, raw)
}

function _trackPendingChange(p: StoreInstancePrivate, change: StoreChange): void {
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

let _globalFlushScheduled = false

function _flushAllPending(): void {
  _globalFlushScheduled = false
  while (_pendingStores.size > 0) {
    const batch = [..._pendingStores]
    _pendingStores.clear()
    for (let i = 0; i < batch.length; i++) {
      const raw = batch[i]
      const p = storeInstancePrivate.get(raw)!
      if (p.pendingChanges.length > 0) {
        _flushChanges(raw, p)
      } else {
        p.flushScheduled = false
      }
    }
  }
}

function _scheduleFlush(p: StoreInstancePrivate, raw: Store): void {
  p.flushScheduled = true
  _pendingStores.add(raw)
  if (!_globalFlushScheduled) {
    _globalFlushScheduled = true
    queueMicrotask(_flushAllPending)
  }
}

function _interceptArray(
  store: Store,
  arr: any[],
  method: string,
  basePath: string,
  baseParts: string[],
  p: StoreInstancePrivate,
): Function | null {
  switch (method) {
    case 'splice':
      return function (...args: any[]) {
        _clearArrayIndexCache(p, arr)
        const len = arr.length
        const rawStart = args[0] ?? 0
        const start = rawStart < 0 ? Math.max(len + rawStart, 0) : Math.min(rawStart, len)
        const deleteCount = args.length < 2 ? len - start : Math.min(Math.max(args[1] ?? 0, 0), len - start)
        const hasInserts = args.length > 2
        const items = hasInserts ? args.slice(2).map((v) => unwrapNestedProxyValue(v)) : _emptyArr
        const removed = arr.slice(start, start + deleteCount)
        if (hasInserts) Array.prototype.splice.call(arr, start, deleteCount, ...items)
        else Array.prototype.splice.call(arr, start, deleteCount)
        if (deleteCount === 0 && items.length > 0 && start === len) {
          _pushAndSchedule(store, [_mkAppend(String(start), arr, baseParts, start, items.length, items)], p)
          return removed
        }
        const changes: StoreChange[] = []
        for (let i = 0; i < removed.length; i++) {
          const idx = String(start + i)
          changes.push(_mkChange('delete', idx, arr, appendPathParts(baseParts, idx), undefined, removed[i]))
        }
        for (let i = 0; i < items.length; i++) {
          const idx = String(start + i)
          changes.push(_mkChange('add', idx, arr, appendPathParts(baseParts, idx), items[i]))
        }
        if (changes.length > 0) _pushAndSchedule(store, changes, p)
        return removed
      }
    case 'push':
    case 'unshift':
      return function (...items: any[]) {
        _clearArrayIndexCache(p, arr)
        const rawItems = items.map((v) => unwrapNestedProxyValue(v))
        if (rawItems.length === 0) return arr.length
        const start = method === 'push' ? arr.length : 0
        ;(Array.prototype as any)[method].apply(arr, rawItems)
        if (method === 'push') {
          _pushAndSchedule(store, [_mkAppend(String(start), arr, baseParts, start, rawItems.length, rawItems)], p)
        } else {
          const changes: StoreChange[] = []
          for (let i = 0; i < rawItems.length; i++)
            changes.push(_mkChange('add', String(i), arr, appendPathParts(baseParts, String(i)), rawItems[i]))
          _pushAndSchedule(store, changes, p)
        }
        return arr.length
      }
    case 'pop':
    case 'shift':
      return function () {
        if (arr.length === 0) return undefined
        _clearArrayIndexCache(p, arr)
        const idx = method === 'pop' ? arr.length - 1 : 0
        const removed = arr[idx]
        ;(Array.prototype as any)[method].call(arr)
        _pushAndSchedule(
          store,
          [_mkChange('delete', String(idx), arr, appendPathParts(baseParts, String(idx)), undefined, removed)],
          p,
        )
        return removed
      }
    case 'sort':
    case 'reverse':
      return function (...args: any[]) {
        _clearArrayIndexCache(p, arr)
        const prev = arr.slice()
        Array.prototype[method].apply(arr, args)
        const idxMap = new Map<any, number[]>()
        for (let i = 0; i < prev.length; i++) {
          const a = idxMap.get(prev[i])
          a ? a.push(i) : idxMap.set(prev[i], [i])
        }
        const ch = _mkChange('reorder', baseParts[baseParts.length - 1] || '', arr, baseParts, arr)
        ch.permutation = arr.map((v, i) => {
          const a = idxMap.get(v)
          return a?.length ? a.shift()! : i
        })
        _pushAndSchedule(store, [ch], p)
        return arr
      }
    case 'indexOf':
    case 'includes':
      return function (searchElement: any, fromIndex?: number) {
        return (Array.prototype as any)[method].call(arr, unwrapNestedProxyValue(searchElement), fromIndex)
      }
    case 'findIndex':
    case 'some':
    case 'every':
      return (Array.prototype as any)[method].bind(arr)
    case 'forEach':
    case 'map':
    case 'filter':
    case 'find':
      return (cb: Function, thisArg?: any) => proxyIterate(store, arr, basePath, baseParts, method, cb, thisArg)
    case 'reduce':
      return function (cb: Function, init?: any) {
        let acc = arguments.length >= 2 ? init : arr[0]
        const start = arguments.length >= 2 ? 0 : 1
        for (let i = start; i < arr.length; i++) {
          acc = cb(acc, _wrapItem(store, arr, i, basePath, baseParts), i, arr)
        }
        return acc
      }
    default:
      return null
  }
}

function _getCachedArrayMeta(p: StoreInstancePrivate, baseParts: string[]): ArrayProxyMeta | null {
  const map = p.internedArrayPaths
  for (let i = baseParts.length - 1; i >= 0; i--) {
    if (!isNumericIndex(baseParts[i])) continue
    const internKey = i === 1 ? baseParts[0] : baseParts.slice(0, i).join('\0')
    let interned = map.get(internKey)
    if (!interned) {
      interned = i === 1 ? [baseParts[0]] : baseParts.slice(0, i)
      map.set(internKey, interned)
    }
    return {
      arrayPathParts: interned,
      arrayIndex: Number(baseParts[i]),
      baseTail: i + 1 < baseParts.length ? baseParts.slice(i + 1) : [],
    }
  }
  return null
}

function _makePathCache(base: string[]): (prop: string) => string[] {
  const m = new Map<string, string[]>()
  return (prop: string): string[] => {
    let v = m.get(prop)
    if (!v) {
      v = base.length ? [...base, prop] : [prop]
      m.set(prop, v)
    }
    return v
  }
}

function _createProxy(
  store: Store,
  target: any,
  basePath: string,
  baseParts: string[] = [],
  arrayMeta?: ArrayProxyMeta,
  existingP?: StoreInstancePrivate,
): any {
  if (!target || typeof target !== 'object') return target

  const _p = existingP || getPriv(store)
  if (!_isArr(target)) {
    const cached = _p.proxyCache.get(target)
    if (cached) return cached
  }

  const cachedArrayMeta = arrayMeta ?? _getCachedArrayMeta(_p, baseParts)
  let methodCache: Map<string, Function> | undefined
  const skipReactive = shouldSkipReactiveWrapForPath(basePath)

  const getCachedPathParts = _makePathCache(baseParts)
  const getCachedLeafPathParts = _makePathCache(cachedArrayMeta?.baseTail ?? [])

  const proxy = new Proxy(target, {
    get(obj: any, prop: string | symbol) {
      if (prop === GEA_STORE_ROOT) return _p.selfProxy || store
      if (prop === GEA_PROXY_IS_PROXY) return true
      if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_TARGET) return obj
      if (prop === GEA_PROXY_GET_PATH) return basePath
      if (typeof prop === 'symbol') return obj[prop]

      const value = obj[prop]
      if (value == null) return value

      const valType = typeof value
      if (valType !== 'object' && valType !== 'function') return value

      if (valType === 'function') {
        if (prop === 'constructor') return value
        if (_isArr(obj)) {
          if (!methodCache) methodCache = new Map()
          let cached = methodCache.get(prop)
          if (cached !== undefined) return cached
          cached = _interceptArray(store, obj, prop, basePath, baseParts, _p) || value.bind(obj)
          methodCache.set(prop, cached)
          return cached
        }
        if (skipReactive) return value
        return value.bind(obj)
      }

      if (skipReactive) return value
      const isArrIdx = _isArr(obj) && isNumericIndex(prop as string)
      if (isArrIdx) {
        const indexCache = _p.arrayIndexProxyCache.get(obj)
        if (indexCache) {
          const cached = indexCache.get(prop)
          if (cached) return cached
        }
        const proxyCached = _p.proxyCache.get(value)
        if (proxyCached) {
          let ic = indexCache || _p.arrayIndexProxyCache.get(obj)
          if (!ic) {
            ic = new Map()
            _p.arrayIndexProxyCache.set(obj, ic)
          }
          ic.set(prop, proxyCached)
          return proxyCached
        }
      } else {
        const cached = _p.proxyCache.get(value)
        if (cached) return cached
      }
      if (!_isPlain(value)) return value
      if (isArrIdx) {
        let indexCache = _p.arrayIndexProxyCache.get(obj)
        if (!indexCache) {
          indexCache = new Map()
          _p.arrayIndexProxyCache.set(obj, indexCache)
        }
        const propStr = prop as string
        const currentPath = joinPath(basePath, propStr)
        const created = _createProxy(
          store,
          value,
          currentPath,
          getCachedPathParts(propStr),
          {
            arrayPathParts: baseParts,
            arrayIndex: Number(propStr),
            baseTail: [],
          },
          _p,
        )
        indexCache.set(prop, created)
        return created
      }
      const currentPath = joinPath(basePath, prop as string)
      const created = _createProxy(store, value, currentPath, getCachedPathParts(prop as string), undefined, _p)
      _p.proxyCache.set(value, created)
      return created
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
        if (!isNew) _dropOld(_p, oldValue)
        obj[prop] = value

        const change = _mkChange(isNew ? 'add' : 'update', prop, obj, getCachedPathParts(prop), value, oldValue)
        if (cachedArrayMeta) _tagArrayItem(change, cachedArrayMeta, getCachedLeafPathParts(prop))
        _queueChange(store, change, _p)
        return true
      }

      value = unwrapNestedProxyValue(value)
      if (prop === 'length' && _isArr(obj)) {
        _p.arrayIndexProxyCache.delete(obj)
        obj[prop] = value
        return true
      }

      const isNew = !_hasOwn.call(obj, prop)
      if (_isArr(obj) && isNumericIndex(prop)) {
        const ic = _p.arrayIndexProxyCache.get(obj)
        if (ic) ic.delete(prop)
      }
      _dropOld(_p, oldValue)
      obj[prop] = value
      _commitObjSet(
        store,
        isNew,
        prop,
        obj,
        getCachedPathParts(prop),
        value,
        oldValue,
        true,
        _p,
        cachedArrayMeta,
        getCachedLeafPathParts,
      )
      return true
    },

    deleteProperty(obj: any, prop: string | symbol) {
      if (typeof prop === 'symbol') {
        delete obj[prop]
        return true
      }
      const oldValue = obj[prop]
      if (_isArr(obj) && isNumericIndex(prop)) {
        const ic = _p.arrayIndexProxyCache.get(obj)
        if (ic) ic.delete(prop)
      }
      _dropOld(_p, oldValue)
      delete obj[prop]
      const change = _mkChange('delete', prop, obj, getCachedPathParts(prop), undefined, oldValue)
      if (cachedArrayMeta) _tagArrayItem(change, cachedArrayMeta, getCachedLeafPathParts(prop))
      _queueChange(store, change, _p)
      return true
    },
  })

  // Cache the proxy so subsequent accesses (e.g., via .find() in computed
  // getters) return the same reference, enabling stable identity checks.
  if (!_isArr(target)) {
    _p.proxyCache.set(target, proxy)
  }

  return proxy
}

// ---------------------------------------------------------------------------
// Store class (slimmed down — methods moved to module-level functions)
// ---------------------------------------------------------------------------

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
   * Set by `@geajs/ssr` before rendering. When non-null, `new Store()` uses the returned
   * proxy handler (7 traps, overlay semantics) instead of the lean browser handler (4 traps).
   * Must be set **before** `new Store()` — proxy shape is fixed at construction.
   */
  static rootProxyHandlerFactory: (() => ProxyHandler<Store>) | null = null

  static flushAll(): void {
    if (_flushing) return
    _flushing = true
    try {
      while (_pendingStores.size > 0) {
        const batch = [..._pendingStores]
        _pendingStores.clear()
        for (let i = 0; i < batch.length; i++) {
          const raw = batch[i]
          const p = storeInstancePrivate.get(raw)!
          if (p.pendingChanges.length > 0) {
            _flushChanges(raw, p)
          } else {
            p.flushScheduled = false
          }
        }
      }
    } finally {
      _flushing = false
    }
  }

  static rootGetValue(t: Store, prop: string, receiver: any): any {
    if (!_hasOwn.call(t, prop)) return Reflect.get(t, prop, receiver)
    const value = (t as any)[prop]
    if (typeof value === 'function') return value
    if (value != null && typeof value === 'object') {
      if (!_isPlain(value)) return value
      if (shouldSkipReactiveWrapForPath(prop)) return value
      const p = storeInstancePrivate.get(t)!
      const entry = p.topLevelProxies.get(prop)
      if (entry && entry[0] === value) return entry[1]
      return _topProxy(t, prop, value, p)
    }
    return value
  }

  static rootSetValue(t: Store, prop: string, value: any): boolean {
    if (typeof value === 'function') {
      ;(t as any)[prop] = value
      return true
    }

    const p = storeInstancePrivate.get(t)!
    const pathParts = _rootPathPartsCache(p, prop)
    if (value == null || typeof value !== 'object') {
      const oldValue = (t as any)[prop]
      if (oldValue === value && prop in t) return true
      const hadProp = prop in t
      if (oldValue && typeof oldValue === 'object') {
        _dropCaches(p, oldValue)
        p.topLevelProxies.delete(prop)
      }
      ;(t as any)[prop] = value
      _pushAndSchedule(t, _mkChange(hadProp ? 'update' : 'add', prop, t, pathParts, value, oldValue), p)
      return true
    }

    value = unwrapNestedProxyValue(value)

    const hadProp = _hasOwn.call(t, prop)
    const oldValue = hadProp ? (t as any)[prop] : undefined
    if (hadProp && oldValue === value) return true

    _dropOld(p, oldValue)
    p.topLevelProxies.delete(prop)
    ;(t as any)[prop] = value
    _commitObjSet(t, !hadProp, prop, t, pathParts, value, oldValue, false, p)
    return true
  }

  static rootDeleteProperty(t: Store, prop: string): boolean {
    const hadProp = _hasOwn.call(t, prop)
    if (!hadProp) return true
    const oldValue = (t as any)[prop]
    const dp = storeInstancePrivate.get(t)!
    _dropOld(dp, oldValue)
    dp.topLevelProxies.delete(prop)
    delete (t as any)[prop]
    _pushAndSchedule(t, [_mkChange('delete', prop, t, _rootPathPartsCache(dp, prop), undefined, oldValue)], dp)
    return true
  }

  constructor(initialData?: Record<string, any>) {
    const priv: StoreInstancePrivate = {
      selfProxy: undefined,
      pendingChanges: [],
      pendingChangesPool: [],
      flushScheduled: false,
      nextArrayOpId: 0,
      observerRoot: _mkNode([]),
      proxyCache: new WeakMap(),
      arrayIndexProxyCache: new WeakMap(),
      internedArrayPaths: new Map(),
      topLevelProxies: new Map(),
      pathPartsCache: new Map(),
      pendingBatchKind: 0,
      pendingBatchArrayPathParts: null,
    }
    storeInstancePrivate.set(this, priv)

    const handler = Store.rootProxyHandlerFactory ? Store.rootProxyHandlerFactory() : _getBrowserRootProxyHandler()
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
    const raw = storeRaw(this)
    const p = storeInstancePrivate.get(raw)!
    if (p.pendingChanges.length > 0) {
      _flushChanges(raw, p)
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
    return _addObserver(this, pathParts, handler)
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
