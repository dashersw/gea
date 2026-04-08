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
function _bindVal(v: any, ctx: any, target: any, prop: string): any {
  if (typeof v !== 'function' || isClassConstructorValue(v)) return v
  if (Object.prototype.hasOwnProperty.call(target, prop)) return v
  return v.bind(ctx)
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
          if (bridged?.ok) return _bindVal(bridged.value, receiver, t, prop)
        }
        return _bindVal(Store.rootGetValue(t, prop, receiver), receiver, t, prop)
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
  let firstError: unknown
  while (_pendingStores.size > 0) {
    const batch = [..._pendingStores]
    _pendingStores.clear()
    for (let i = 0; i < batch.length; i++) {
      const raw = batch[i]
      const p = storeInstancePrivate.get(raw)!
      if (p.pendingChanges.length > 0) {
        try {
          _flushChanges(raw, p)
        } catch (e) {
          if (!firstError) firstError = e
        }
      } else {
        p.flushScheduled = false
      }
    }
  }
  if (firstError) throw firstError
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
    let firstError: unknown
    try {
      while (_pendingStores.size > 0) {
        const batch = [..._pendingStores]
        _pendingStores.clear()
        for (let i = 0; i < batch.length; i++) {
          const raw = batch[i]
          const p = storeInstancePrivate.get(raw)!
          if (p.pendingChanges.length > 0) {
            try {
              _flushChanges(raw, p)
            } catch (e) {
              if (!firstError) firstError = e
            }
          } else {
            p.flushScheduled = false
          }
        }
      }
    } finally {
      _flushing = false
    }
    if (firstError) throw firstError
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
    if (!Array.isArray(target)) {
      const cached = this._proxyCache.get(target)
      if (cached) return cached
    }

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
    if (!Array.isArray(target)) {
      this._proxyCache.set(target, proxy)
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
