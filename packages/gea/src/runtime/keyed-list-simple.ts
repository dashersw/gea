import { GEA_PROXY_RAW } from './symbols'
import type { Change } from '../store'
import { GEA_DIRTY, GEA_DIRTY_PROPS } from './dirty-symbols'
import type { Disposer } from './disposer'
import { lis } from './keyed-list/lis'
import type { ItemObservable } from './keyed-list/types'
import { subscribe } from './subscribe'

// A top-level FUNCTION DECLARATION, not a `const` holding an arrow: an
// unannotated module-scope callable const has no sealed binding subject
// under geatsc (`representation-plan coverage gap for
// VariableDeclaration`) because its `any -> any` signature admits no exact
// ABI. A function declaration is its own emitted callable and needs no
// value carrier. Body is unchanged.
function unwrap<V>(v: V): V {
  const rawTarget = v && typeof v === 'object' && (v as Record<symbol, unknown>)[GEA_PROXY_RAW]
  return (rawTarget as V) || v
}

/** `T` is the item type, knowable at each call site — mirrors `Entry<T>` in `./keyed-list/types`. */
interface SimpleEntry<T> {
  key: any
  item: T
  element: Element
  disposer?: Disposer
  obs?: ItemObservable<T> | null
}

export interface SimpleKeyedListConfig<T> {
  container: Element
  anchor: Comment
  disposer: Disposer
  root: any
  path: readonly string[]
  key: (item: T, idx: number) => any
  createEntry: (item: T, idx: number) => SimpleEntry<T>
  patchEntry: (entry: SimpleEntry<T>, item: T, idx: number) => void
  onItemRemove?: (entry: SimpleEntry<T>) => void
  onByKeyCreated?: (byKey: Map<any, SimpleEntry<T>>) => void
}

export function keyedListSimple<T>(cfg: SimpleKeyedListConfig<T>): void {
  const container = cfg.container
  const anchor = cfg.anchor
  const disposer = cfg.disposer
  const root = cfg.root
  const path = cfg.path
  const keyFn = cfg.key
  const createEntry = cfg.createEntry
  const patchEntry = cfg.patchEntry
  const onItemRemove = cfg.onItemRemove
  let entries: SimpleEntry<T>[] = []
  const byKey = new Map<any, SimpleEntry<T>>()
  if (cfg.onByKeyCreated) cfg.onByKeyCreated(byKey)

  const resolveArr = (): T[] => {
    let v = root
    for (let i = 0; i < path.length; i++) {
      if (v == null) return []
      v = v[path[i]]
    }
    return Array.isArray(v) ? v : []
  }

  const cleanupEntry = (entry: SimpleEntry<T>): void => {
    if (onItemRemove) onItemRemove(entry)
    entry.disposer?.dispose()
  }

  const removeEntry = (entry: SimpleEntry<T>): void => {
    cleanupEntry(entry)
    byKey.delete(entry.key)
    if (entry.element.parentNode) entry.element.parentNode.removeChild(entry.element)
  }

  const firstArr = resolveArr()
  if (firstArr.length > 0) {
    const frag = container.ownerDocument!.createDocumentFragment()
    for (let i = 0; i < firstArr.length; i++) {
      const item = firstArr[i]
      const entry = createEntry(item, i)
      entries.push(entry)
      byKey.set(entry.key, entry)
      frag.appendChild(entry.element)
      if (item && typeof item === 'object') {
        ;(item as any)[GEA_DIRTY] = false
        ;(item as any)[GEA_DIRTY_PROPS]?.clear()
      }
    }
    container.insertBefore(frag, anchor)
  }

  let prevArrRef: T[] = firstArr

  const patchDirtyItems = (arr: T[]): boolean => {
    let patched = false
    const raw = (arr as any)[GEA_PROXY_RAW] || arr
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i]
      if (item && typeof item === 'object' && item[GEA_DIRTY]) {
        patchEntry(entries[i], item, i)
        item[GEA_DIRTY] = false
        item[GEA_DIRTY_PROPS]?.clear()
        entries[i].item = item
        patched = true
      }
    }
    return patched
  }

  const reconcile = (arr: T[], changes?: Change[]): void => {
    if (arr === prevArrRef && entries.length === arr.length) {
      let structural = false
      let aipuOnly = changes && changes.length > 0
      if (changes && changes.length > 0) {
        for (let i = 0; i < changes.length; i++) {
          const change = changes[i]
          if (
            change.type === 'append' ||
            change.type === 'remove' ||
            change.type === 'delete' ||
            change.type === 'reorder'
          ) {
            structural = true
            aipuOnly = false
            break
          }
          if (!change.aipu) aipuOnly = false
          else structural = true
        }
      }

      if (aipuOnly && changes!.length > 1 && changes!.length < 3) {
        const a = changes![0].arix as number
        const b = changes![1].arix as number
        if (a >= 0 && b >= 0 && a < entries.length && b < entries.length && a !== b) {
          const entryA = entries[a]
          const entryB = entries[b]
          const newAKey = keyFn(arr[a], a)
          const newBKey = keyFn(arr[b], b)
          if (entryA.key === newBKey && entryB.key === newAKey) {
            const refB = entryB.element.nextSibling
            container.insertBefore(entryB.element, entryA.element)
            if (refB) container.insertBefore(entryA.element, refB)
            else container.appendChild(entryA.element)
            entries[a] = entryB
            entries[b] = entryA
            if (unwrap(arr[a]) !== entryB.item) patchEntry(entryB, arr[a], a)
            if (unwrap(arr[b]) !== entryA.item) patchEntry(entryA, arr[b], b)
            prevArrRef = arr
            return
          }
        }
      }

      if (!structural) {
        patchDirtyItems(arr)
        return
      }
    }

    if (entries.length === arr.length && changes && changes.length > 0) {
      let structural = false
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i]
        if (
          change.type === 'append' ||
          change.type === 'remove' ||
          change.type === 'delete' ||
          change.type === 'reorder' ||
          change.aipu
        ) {
          structural = true
          break
        }
      }
      if (!structural && patchDirtyItems(arr)) {
        prevArrRef = arr
        return
      }
    }

    if (changes && changes.length > 0 && entries.length < arr.length) {
      let onlyAppends = true
      let appendCount = 0
      for (let i = 0; i < changes.length; i++) {
        if (changes[i].type !== 'append') {
          onlyAppends = false
          break
        }
        appendCount += (changes[i].count as number) || 0
      }
      if (onlyAppends && appendCount === arr.length - entries.length) {
        const start = entries.length
        const frag = container.ownerDocument!.createDocumentFragment()
        for (let i = start; i < arr.length; i++) {
          const entry = createEntry(arr[i], i)
          entries.push(entry)
          byKey.set(entry.key, entry)
          frag.appendChild(entry.element)
        }
        container.insertBefore(frag, anchor)
        prevArrRef = arr
        return
      }
    }

    if (changes && changes.length > 0 && entries.length > arr.length) {
      let onlyRemoves = true
      let totalRemoved = 0
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i]
        if (change.type !== 'remove') {
          onlyRemoves = false
          break
        }
        totalRemoved += (change.count as number) || 0
      }
      if (onlyRemoves && entries.length - arr.length === totalRemoved) {
        if (changes.length < 2 && (changes[0].count as number) === 1) {
          const idx = changes[0].start as number
          if (idx >= 0 && idx < entries.length) {
            removeEntry(entries[idx])
            entries.splice(idx, 1)
          }
          prevArrRef = arr
          return
        }
        const removed: number[] = []
        for (let i = 0; i < changes.length; i++) {
          const start = changes[i].start as number
          const count = changes[i].count as number
          for (let j = 0; j < count; j++) removed.push(start + j)
        }
        removed.sort((a, b) => b - a)
        for (let i = 0; i < removed.length; i++) {
          const idx = removed[i]
          if (idx >= 0 && idx < entries.length) {
            removeEntry(entries[idx])
            entries.splice(idx, 1)
          }
        }
        prevArrRef = arr
        return
      }
    }

    const newLen = arr.length
    const oldLen = entries.length

    if (oldLen === 0 && newLen > 0) {
      const nextEntries = new Array<SimpleEntry<T>>(newLen)
      const frag = container.ownerDocument!.createDocumentFragment()
      for (let i = 0; i < newLen; i++) {
        const entry = createEntry(arr[i], i)
        nextEntries[i] = entry
        byKey.set(entry.key, entry)
        frag.appendChild(entry.element)
      }
      container.insertBefore(frag, anchor)
      entries = nextEntries
      prevArrRef = arr
      return
    }

    const newKeys = new Array<any>(newLen)
    for (let i = 0; i < newLen; i++) newKeys[i] = keyFn(arr[i], i)

    if (newLen === 0) {
      for (let i = 0; i < oldLen; i++) cleanupEntry(entries[i])
      container.textContent = ''
      container.appendChild(anchor)
      entries = []
      byKey.clear()
      prevArrRef = arr
      return
    }

    if (newLen === oldLen) {
      let diffA = -1
      let diffB = -1
      let diffCount = 0
      for (let i = 0; i < newLen; i++) {
        if (entries[i].key !== newKeys[i]) {
          if (diffCount === 0) diffA = i
          else if (diffCount === 1) diffB = i
          diffCount++
          if (diffCount > 2) break
        }
      }
      if (diffCount === 2 && entries[diffA].key === newKeys[diffB] && entries[diffB].key === newKeys[diffA]) {
        const entryA = entries[diffA]
        const entryB = entries[diffB]
        const refB = entryB.element.nextSibling
        container.insertBefore(entryB.element, entryA.element)
        if (refB) container.insertBefore(entryA.element, refB)
        else container.appendChild(entryA.element)
        entries[diffA] = entryB
        entries[diffB] = entryA
        if (unwrap(arr[diffA]) !== entryB.item) patchEntry(entryB, arr[diffA], diffA)
        if (unwrap(arr[diffB]) !== entryA.item) patchEntry(entryA, arr[diffB], diffB)
        prevArrRef = arr
        return
      }
    }

    if (oldLen > 0 && newLen > 0 && container.childNodes.length === oldLen + 1) {
      let disjoint = true
      for (let i = 0; i < newLen; i++) {
        if (byKey.has(newKeys[i])) {
          disjoint = false
          break
        }
      }
      if (disjoint) {
        for (let i = 0; i < oldLen; i++) cleanupEntry(entries[i])
        byKey.clear()
        const nextEntries = new Array<SimpleEntry<T>>(newLen)
        const nextNodes = new Array<Node>(newLen + 1)
        for (let i = 0; i < newLen; i++) {
          const entry = createEntry(arr[i], i)
          nextEntries[i] = entry
          nextNodes[i] = entry.element
          byKey.set(entry.key, entry)
        }
        nextNodes[newLen] = anchor
        ;(container as any).replaceChildren(...nextNodes)
        entries = nextEntries
        prevArrRef = arr
        return
      }
    }

    for (let i = 0; i < oldLen; i++) (entries[i] as any)._i = i
    const newToOld = new Array<number>(newLen)
    // A 0/1 number vector, not `boolean[]`. geatsc settles an element carrier
    // for this vector that disagrees with the exact primitive-Boolean fact it
    // derives for `!seenOld[i]`, and aborts the whole compile. Numbers carry
    // the same one-bit state with a representation it can settle.
    const seenOld: number[] = []
    for (let i = 0; i < oldLen; i++) seenOld.push(0)
    for (let i = 0; i < newLen; i++) {
      const existing = byKey.get(newKeys[i])
      if (existing) {
        const oldIdx = (existing as any)._i as number
        newToOld[i] = oldIdx
        seenOld[oldIdx] = 1
      } else {
        newToOld[i] = -1
      }
    }

    for (let i = oldLen - 1; i >= 0; i--) {
      if (seenOld[i] === 0) removeEntry(entries[i])
    }

    const stable = new Set(lis(newToOld))
    const nextEntries = new Array<SimpleEntry<T>>(newLen)
    let nextRef: Node = anchor
    for (let i = newLen - 1; i >= 0; i--) {
      const oldIdx = newToOld[i]
      let entry: SimpleEntry<T>
      if (oldIdx === -1) {
        entry = createEntry(arr[i], i)
        byKey.set(entry.key, entry)
        container.insertBefore(entry.element, nextRef)
      } else {
        entry = entries[oldIdx]
        if (entry.item !== unwrap(arr[i])) patchEntry(entry, arr[i], i)
        if (entry.element.parentNode !== container) container.insertBefore(entry.element, nextRef)
        else if (!stable.has(i)) container.insertBefore(entry.element, nextRef)
      }
      nextEntries[i] = entry
      nextRef = entry.element
    }

    entries = nextEntries
    prevArrRef = arr
  }

  const off = subscribe(root, path, (_value: any, changes?: Change[]) => {
    reconcile(resolveArr(), changes)
  })
  disposer.add(off)
}
