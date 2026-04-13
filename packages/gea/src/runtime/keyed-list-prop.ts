import { GEA_PROXY_RAW } from './symbols'
import type { Change } from '../store'
import { GEA_DIRTY, GEA_DIRTY_PROPS } from './dirty-symbols'
import type { Disposer } from './disposer'

const unwrap = (v: any): any => (v && typeof v === 'object' && v[GEA_PROXY_RAW]) || v

interface PropEntry {
  key: any
  item: any
  element: Element
}

export interface PropKeyedListConfig {
  container: Element
  anchor: Comment
  disposer: Disposer
  root: any
  prop: string
  key: (item: any, idx: number) => any
  createEntry: (item: any, idx: number) => PropEntry
  patchEntry: (entry: PropEntry, item: any, idx: number) => void
  onByKeyCreated?: (byKey: Map<any, PropEntry>) => void
}

export function keyedListProp(cfg: PropKeyedListConfig): void {
  const { container, anchor, disposer, root, prop, key: keyFn, createEntry, patchEntry } = cfg
  let entries: PropEntry[] = []
  const byKey = new Map<any, PropEntry>()
  if (cfg.onByKeyCreated) cfg.onByKeyCreated(byKey)

  const resolveArr = (): any[] => {
    const v = root?.[prop]
    return Array.isArray(v) ? v : []
  }

  const removeEntry = (entry: PropEntry): void => {
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

  let prevArrRef: any = firstArr

  const reconcile = (arr: any[], changes?: Change[]): void => {
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

      if (aipuOnly && changes!.length === 2) {
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
        const raw = (arr as any)[GEA_PROXY_RAW] || arr
        for (let i = 0; i < raw.length; i++) {
          const item = raw[i]
          if (item && typeof item === 'object' && item[GEA_DIRTY]) {
            patchEntry(entries[i], item, i)
            item[GEA_DIRTY] = false
            item[GEA_DIRTY_PROPS]?.clear()
            entries[i].item = item
          }
        }
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
        if (changes.length === 1 && (changes[0].count as number) === 1) {
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
      const nextEntries = new Array<PropEntry>(newLen)
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
      if (container.childNodes.length === oldLen + 1) {
        container.textContent = ''
        container.appendChild(anchor)
      } else {
        for (let i = oldLen - 1; i >= 0; i--) removeEntry(entries[i])
      }
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
        byKey.clear()
        const nextEntries = new Array<PropEntry>(newLen)
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
    const seenOld = new Array<boolean>(oldLen).fill(false)
    const nextEntries = new Array<PropEntry>(newLen)
    for (let i = 0; i < newLen; i++) {
      const entry = byKey.get(newKeys[i])
      if (entry) {
        const oldIdx = (entry as any)._i as number
        seenOld[oldIdx] = true
        nextEntries[i] = entry
      }
    }

    for (let i = oldLen - 1; i >= 0; i--) {
      if (!seenOld[i]) removeEntry(entries[i])
    }

    let nextRef: Node = anchor
    for (let i = newLen - 1; i >= 0; i--) {
      let entry = nextEntries[i]
      if (!entry) {
        entry = createEntry(arr[i], i)
        byKey.set(entry.key, entry)
      } else if (entry.item !== unwrap(arr[i])) {
        patchEntry(entry, arr[i], i)
      }
      if (entry.element.parentNode !== container || entry.element.nextSibling !== nextRef) {
        container.insertBefore(entry.element, nextRef)
      }
      nextEntries[i] = entry
      nextRef = entry.element
    }

    entries = nextEntries
    prevArrRef = arr
  }

  if (root && typeof root.observe === 'function') {
    const off = root.observe(prop, (_value: any, changes?: Change[]) => {
      reconcile(resolveArr(), changes)
    })
    disposer.add(off)
  }
}
