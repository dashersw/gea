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
  return typeof value === 'string' && /^\d+$/.test(value)
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

const INTERNAL_PROPS = new Set(['props', 'actions', 'parentComponent'])

export function isInternalProp(prop: string): boolean {
  if (prop.charCodeAt(0) === 95) return true // starts with '_'
  if (prop.charCodeAt(prop.length - 1) === 95) return true // ends with '_'
  return INTERNAL_PROPS.has(prop)
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
  private _selfProxy?: this
  private _pendingChanges: StoreChange[] = []
  private _flushScheduled = false
  private _nextArrayOpId = 0
  private _observerRoot: ObserverNode = createObserverNode([])
  private _proxyCache = new WeakMap()
  private _arrayIndexProxyCache = new WeakMap()
  private _internedArrayPaths = new Map<string, string[]>()
  private _topLevelProxies = new Map<string, [raw: any, proxy: any]>()

  constructor(initialData?: Record<string, any>) {
    const proxy = new Proxy(this, {
      get(t, prop, receiver) {
        if (typeof prop === 'symbol') return Reflect.get(t, prop, receiver)
        if (prop === '__isProxy') return true
        if (isInternalProp(prop)) return Reflect.get(t, prop, receiver)
        if (!Object.prototype.hasOwnProperty.call(t, prop)) {
          return Reflect.get(t, prop, receiver)
        }
        const value = (t as any)[prop]
        if (typeof value === 'function') return value
        if (value !== null && value !== undefined && typeof value === 'object') {
          const proto = Object.getPrototypeOf(value)
          if (proto !== Object.prototype && !Array.isArray(value)) return value
          const entry = t._topLevelProxies.get(prop)
          if (entry && entry[0] === value) return entry[1]
          const p = t._createProxy(value, prop, [prop])
          t._topLevelProxies.set(prop, [value, p])
          return p
        }
        return value
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
        if (typeof value === 'function') {
          ;(t as any)[prop] = value
          return true
        }
        if (value && typeof value === 'object' && value.__isProxy) {
          const raw = value.__getTarget
          if (raw !== undefined) value = raw
        }

        const hadProp = Object.prototype.hasOwnProperty.call(t, prop)
        const oldValue = hadProp ? (t as any)[prop] : undefined
        if (hadProp && oldValue === value) return true

        if (oldValue && typeof oldValue === 'object') {
          t._proxyCache.delete(oldValue)
          t._clearArrayIndexCache(oldValue)
        }
        t._topLevelProxies.delete(prop)
        ;(t as any)[prop] = value

        if (Array.isArray(oldValue) && Array.isArray(value) && value.length > oldValue.length) {
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
                pathParts: [prop],
                start,
                count: value.length - start,
                newValue: value.slice(start),
              },
            ])
            return true
          }
        }

        t._emitChanges([
          {
            type: hadProp ? 'update' : 'add',
            property: prop,
            target: t,
            pathParts: [prop],
            newValue: value,
            previousValue: oldValue,
          },
        ])
        return true
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
        const hadProp = Object.prototype.hasOwnProperty.call(t, prop)
        if (!hadProp) return true
        const oldValue = (t as any)[prop]
        if (oldValue && typeof oldValue === 'object') {
          t._proxyCache.delete(oldValue)
          t._clearArrayIndexCache(oldValue)
        }
        t._topLevelProxies.delete(prop)
        delete (t as any)[prop]
        t._emitChanges([
          {
            type: 'delete',
            property: prop,
            target: t,
            pathParts: [prop],
            previousValue: oldValue,
          },
        ])
        return true
      },
      defineProperty(t, prop, descriptor) {
        return Reflect.defineProperty(t, prop, descriptor)
      },
    }) as this
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

  observe(path: string | string[], handler: StoreObserver): () => void {
    const pathParts = splitPath(path)
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
      if (!change.isArrayItemPropUpdate || !samePathParts(change.arrayPathParts!, arrayPathParts!)) {
        allSameArray = false
        break
      }
    }

    if (!allSameArray) return false

    const arrayNode = this._getObserverNode(arrayPathParts!)
    if (
      this._observerRoot.handlers.size === 0 &&
      arrayNode &&
      arrayNode.children.size === 0 &&
      arrayNode.handlers.size > 0
    ) {
      const value = getByPathParts(this, arrayPathParts!)
      for (const handler of arrayNode.handlers) {
        handler(value, batch)
      }
      return true
    }

    const commonMatches = this._collectMatchingObserverNodes(arrayPathParts!)
    for (let i = 0; i < commonMatches.length; i++) {
      this._notifyHandlers(commonMatches[i], batch)
    }

    if (!arrayNode || arrayNode.children.size === 0) return true

    const deliveries = new Map<ObserverNode, StoreChange[]>()
    const suffixOffset = arrayPathParts!.length

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

  private _flushChanges = (): void => {
    this._flushScheduled = false
    const batch = this._normalizeBatch(this._pendingChanges)
    this._pendingChanges = []
    if (batch.length === 0) return

    if (this._deliverArrayItemPropBatch(batch)) return

    if (batch.length === 1) {
      const matches = this._collectMatchingObserverNodes(batch[0].pathParts)
      for (let i = 0; i < matches.length; i++) {
        this._notifyHandlers(matches[i], batch)
      }
      return
    }

    const deliveries = new Map<ObserverNode, StoreChange[]>()
    for (let i = 0; i < batch.length; i++) {
      const change = batch[i]
      const matches = this._collectMatchingObserverNodes(change.pathParts)
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
    for (let i = 0; i < changes.length; i++) this._pendingChanges.push(changes[i])
    if (!this._flushScheduled) {
      this._flushScheduled = true
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
      case 'forEach':
      case 'map':
      case 'filter':
      case 'some':
      case 'every':
      case 'find':
      case 'findIndex':
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

  private _createProxy(target: any, basePath: string, baseParts: string[] = []): any {
    if (!target || typeof target !== 'object') return target

    const store = this // eslint-disable-line @typescript-eslint/no-this-alias
    let cachedArrayMeta: { arrayPathParts: string[]; arrayIndex: number; baseTail: string[] } | null = null
    for (let i = baseParts.length - 1; i >= 0; i--) {
      if (!/^\d+$/.test(baseParts[i])) continue
      const internKey = baseParts.slice(0, i).join('\0')
      let interned = store._internedArrayPaths.get(internKey)
      if (!interned) {
        interned = baseParts.slice(0, i)
        store._internedArrayPaths.set(internKey, interned)
      }
      cachedArrayMeta = {
        arrayPathParts: interned,
        arrayIndex: Number(baseParts[i]),
        baseTail: baseParts.slice(i + 1),
      }
      break
    }
    const pathCache = new Map<string, string[]>()
    const leafCache = new Map<string, string[]>()

    function getCachedPathParts(propStr: string): string[] {
      let pp = pathCache.get(propStr)
      if (!pp) {
        pp = baseParts.length > 0 ? [...baseParts, propStr] : [propStr]
        pathCache.set(propStr, pp)
      }
      return pp
    }

    const createProxy = (t: any, bp: string, bps: string[]) => store._createProxy(t, bp, bps)

    return new Proxy(target, {
      get(obj: any, prop: string | symbol) {
        if (typeof prop === 'symbol') return obj[prop]
        if (prop === '__getTarget') return obj
        if (prop === '__raw') return obj
        if (prop === '__isProxy') return true
        if (prop === '__getPath') return basePath
        if (prop === '__store') return store._selfProxy || store

        const value = obj[prop]
        if (value === null || value === undefined) return value

        const valType = typeof value
        if (valType !== 'object' && valType !== 'function') return value

        if (Array.isArray(obj) && valType === 'function') {
          if (prop === 'constructor') return value
          const intercepted = store._interceptArrayMethod(obj, prop, basePath, baseParts)
          if (intercepted) return intercepted
          const iterProxy = store._interceptArrayIterator(obj, prop, basePath, baseParts, createProxy)
          if (iterProxy) return iterProxy
          return value.bind(obj)
        }

        if (valType === 'object') {
          const proto = Object.getPrototypeOf(value)
          if (proto !== Object.prototype && !Array.isArray(value)) return value
          if (Array.isArray(obj) && /^\d+$/.test(prop as string)) {
            let indexCache = store._arrayIndexProxyCache.get(obj)
            if (!indexCache) {
              indexCache = new Map()
              store._arrayIndexProxyCache.set(obj, indexCache)
            }
            let cached = indexCache.get(prop)
            if (cached) return cached
            const currentPath = basePath ? `${basePath}.${prop}` : (prop as string)
            cached = createProxy(value, currentPath, getCachedPathParts(prop as string))
            indexCache.set(prop, cached)
            return cached
          }
          let cached = store._proxyCache.get(value)
          if (cached) return cached
          const currentPath = basePath ? `${basePath}.${prop}` : (prop as string)
          cached = createProxy(value, currentPath, getCachedPathParts(prop as string))
          store._proxyCache.set(value, cached)
          return cached
        }

        if (prop === 'constructor') return value
        return value.bind(obj)
      },

      set(obj: any, prop: string | symbol, value: any) {
        if (typeof prop === 'symbol') {
          obj[prop] = value
          return true
        }
        if (value && typeof value === 'object' && value.__isProxy) {
          const raw = value.__getTarget
          if (raw !== undefined) value = raw
        }
        if (prop === 'length' && Array.isArray(obj)) {
          store._clearArrayIndexCache(obj)
          obj[prop] = value
          return true
        }
        const oldValue = obj[prop]
        if (oldValue === value) return true

        const isNew = !Object.prototype.hasOwnProperty.call(obj, prop)
        if (Array.isArray(obj) && /^\d+$/.test(prop)) store._clearArrayIndexCache(obj)
        if (oldValue && typeof oldValue === 'object') {
          store._proxyCache.delete(oldValue)
          store._clearArrayIndexCache(oldValue)
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
              let lp = leafCache.get(prop)
              if (!lp) {
                lp = cachedArrayMeta.baseTail.length > 0 ? [...cachedArrayMeta.baseTail, prop] : [prop]
                leafCache.set(prop, lp)
              }
              change.arrayPathParts = cachedArrayMeta.arrayPathParts
              change.arrayIndex = cachedArrayMeta.arrayIndex
              change.leafPathParts = lp
              change.isArrayItemPropUpdate = true
            }
            store._pendingChanges.push(change)
            if (!store._flushScheduled) {
              store._flushScheduled = true
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
          let lp = leafCache.get(prop)
          if (!lp) {
            lp = cachedArrayMeta.baseTail.length > 0 ? [...cachedArrayMeta.baseTail, prop] : [prop]
            leafCache.set(prop, lp)
          }
          change.arrayPathParts = cachedArrayMeta.arrayPathParts
          change.arrayIndex = cachedArrayMeta.arrayIndex
          change.leafPathParts = lp
          change.isArrayItemPropUpdate = true
        }
        store._pendingChanges.push(change)
        if (!store._flushScheduled) {
          store._flushScheduled = true
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
        if (Array.isArray(obj) && /^\d+$/.test(prop)) store._clearArrayIndexCache(obj)
        if (oldValue && typeof oldValue === 'object') {
          store._proxyCache.delete(oldValue)
          store._clearArrayIndexCache(oldValue)
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
          let lp = leafCache.get(prop)
          if (!lp) {
            lp = cachedArrayMeta.baseTail.length > 0 ? [...cachedArrayMeta.baseTail, prop] : [prop]
            leafCache.set(prop, lp)
          }
          change.arrayPathParts = cachedArrayMeta.arrayPathParts
          change.arrayIndex = cachedArrayMeta.arrayIndex
          change.leafPathParts = lp
          change.isArrayItemPropUpdate = true
        }
        store._pendingChanges.push(change)
        if (!store._flushScheduled) {
          store._flushScheduled = true
          queueMicrotask(store._flushChanges)
        }
        return true
      },
    })
  }
}
