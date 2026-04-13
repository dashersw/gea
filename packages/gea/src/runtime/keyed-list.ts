/**
 * keyedList — compile-time-specialized keyed list reconciler.
 *
 * This module is the **diff kernel only**. It does not know about:
 *   - item proxies (`ItemObs`, `createItemProxy`)
 *   - row disposers (allocated or shared no-op)
 *   - compiler analysis flags (`noItemProxy`, `skipInitialPatch`, etc.)
 *   - the `createItem` / `patchRow` pair
 *   - owner lifecycle hooks (`registerListState`, `onItemSync`)
 *
 * All that logic is inlined by the compiler at each `.map()` site via
 * three specialized closures:
 *
 *   - `createEntry(item, idx) => Entry`:
 *       Full per-row work — `_rescue` lookup, disposer allocation (or
 *       not), `ItemObs` construction (or not), template clone + walks +
 *       bindings + stamps, initial patch writes. Opaque to the kernel.
 *   - `patchEntry(e, newItem, newIdx)`:
 *       Per-row identity-change work — `e.item` update, `obs.fire` (if
 *       proxied), direct DOM writes on dirty bindings, dirty-bit clear.
 *   - `onItemRemove?(e)` (optional):
 *       User-level cleanup on removal (relational-class map delete, etc.).
 *       Omit entirely for rows with no cleanup.
 *
 * Apps whose sites never need item-proxies end up with zero references
 * to `ItemObs` / `createItemProxy` through the kernel's import graph
 * → tree-shaker drops them → bundle shrinks.
 */

import type { Disposer } from './disposer'
import { subscribe } from './subscribe'
import { withTracking } from './with-tracking'
import type { Change } from '../store'
import { GEA_DIRTY, GEA_DIRTY_PROPS } from './dirty-symbols'
import { GEA_PROXY_RAW } from './symbols'
import { lis } from './keyed-list/lis'
import type { Entry } from './keyed-list/types'
import { _consumeClaim, _defer, _deferBulk, _markClaimable, _trackLive } from './keyed-list/rescue'
import { GEA_DOM_ITEM, GEA_DOM_KEY } from './keyed-list-symbols'

/** Unwrap a proxy value to its raw target. */
const unwrap = (v: any): any => (v && typeof v === 'object' && v[GEA_PROXY_RAW]) || v

export { GEA_DOM_ITEM, GEA_DOM_KEY } from './keyed-list-symbols'

export type { Entry, ItemObservable } from './keyed-list/types'

export interface KeyedListConfig {
  container: Element
  anchor: Comment
  disposer: Disposer
  root: any
  /**
   * Per-site rescue queue. The compiler emits one `Map<string, Entry>` literal
   * per `.map()` site at module scope and threads it through here so two
   * unrelated sites can't collide. Optional for hand-written callers (a fresh
   * map is allocated when omitted, disabling cross-render rescue but keeping
   * the disposer microtask intact).
   */
  pending?: Map<string, Entry>
  /** Either a static path on `root` (`['items']`) OR a getter returning the array. */
  path: readonly string[] | (() => any[])
  key: (item: any, idx: number) => string
  /** Compiler-specialized: create a new entry for this item at index `idx`. */
  createEntry: (item: any, idx: number) => Entry
  /** Compiler-specialized: apply a new item identity to an existing entry. */
  patchEntry: (e: Entry, newItem: any, newIdx: number) => void
  /** Optional: user-level cleanup on row removal (relational-class map delete). */
  onItemRemove?: (e: Entry) => void
  /** Optional: gives relational-class setup access to the kernel's byKey Map. */
  onByKeyCreated?: (byKey: Map<string, Entry>) => void
}

export function keyedList(cfg: KeyedListConfig): void {
  const { container, anchor, disposer, root, path, key: keyFn, createEntry, patchEntry, onItemRemove } = cfg
  const pending: Map<string, Entry> = cfg.pending ?? new Map()

  let entries: Entry[] = []
  const byKey = new Map<string, Entry>()
  if (cfg.onByKeyCreated) cfg.onByKeyCreated(byKey)

  const resolveArr = (): any[] => {
    if (typeof path === 'function') {
      const v = (path as () => any[])()
      return Array.isArray(v) ? v : []
    }
    let v: any = root
    for (let i = 0; i < (path as readonly string[]).length; i++) {
      if (v == null) return []
      v = v[(path as readonly string[])[i]]
    }
    return Array.isArray(v) ? v : []
  }

  const removeEntry = (e: Entry): void => {
    if (onItemRemove) onItemRemove(e)
    byKey.delete(e.key)
    if (_consumeClaim(e)) return
    if (e.element.parentNode) e.element.parentNode.removeChild(e.element)
    _defer(pending, e)
  }

  const markEntriesLeaving = (next: any[]): void => {
    if (entries.length === 0) return
    const nextByKey = new Map<string, Set<any>>()
    for (let i = 0; i < next.length; i++) {
      const k = keyFn(next[i], i)
      let bucket = nextByKey.get(k)
      if (!bucket) nextByKey.set(k, (bucket = new Set()))
      bucket.add(unwrap(next[i]))
    }
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      _markClaimable(e, !nextByKey.get(e.key)?.has(e.item))
    }
  }

  // ── First render ──────────────────────────────────────────────────────
  const firstArr = resolveArr()
  if (firstArr.length > 0) {
    const frag = container.ownerDocument!.createDocumentFragment()
    for (let i = 0; i < firstArr.length; i++) {
      const item = firstArr[i]
      const e = createEntry(item, i)
      entries.push(e)
      byKey.set(e.key, e)
      _trackLive(pending, e)
      frag.appendChild(e.element)
      if (item && typeof item === 'object') {
        ;(item as any)[GEA_DIRTY] = false
        ;(item as any)[GEA_DIRTY_PROPS]?.clear()
      }
    }
    container.insertBefore(frag, anchor)
  }

  let prevArrRef: any = firstArr

  // ── Reconciliation ────────────────────────────────────────────────────
  const reconcile = (arr: any[], changes?: Change[]): void => {
    // Same array ref + same length → structural no-op. Dirty-bit scan
    // picks up in-place item writes.
    if (arr === prevArrRef && entries.length === arr.length) {
      let structural = false
      let aipuOnly = changes && changes.length > 0
      if (changes && changes.length > 0) {
        for (let i = 0; i < changes.length; i++) {
          const c = changes[i]
          if (c.type === 'append' || c.type === 'remove' || c.type === 'delete' || c.type === 'reorder') {
            structural = true
            aipuOnly = false
            break
          }
          if (!c.aipu) aipuOnly = false
          else structural = true
        }
      }
      // aipu-only 2-swap: items[i]↔items[j] via two symmetric aipu records.
      if (aipuOnly && changes!.length === 2) {
        const a = changes![0].arix as number
        const b = changes![1].arix as number
        if (a >= 0 && b >= 0 && a < entries.length && b < entries.length && a !== b) {
          const eA = entries[a]
          const eB = entries[b]
          const newAKey = keyFn(arr[a], a)
          const newBKey = keyFn(arr[b], b)
          if (eA.key === newBKey && eB.key === newAKey) {
            const refB = eB.element.nextSibling
            container.insertBefore(eB.element, eA.element)
            if (refB) container.insertBefore(eA.element, refB)
            else container.appendChild(eA.element)
            entries[a] = eB
            entries[b] = eA
            if (unwrap(arr[a]) !== eB.item) patchEntry(eB, arr[a], a)
            if (unwrap(arr[b]) !== eA.item) patchEntry(eA, arr[b], b)
            prevArrRef = arr
            return
          }
        }
      }
      if (!structural) {
        // Dirty-aware patch pass. Same array ref + no structural change →
        // in-place item mutations (e.g. `store.items[i].label = 'X'`) only.
        // The store's nested-proxy set trap stamped `item[GEA_DIRTY]=true`;
        // walk the raw array and patch marked items. Runtime owns the
        // dirty-bit protocol — compiler-emitted patchEntry doesn't see it.
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

    // Append-only.
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
        const startIdx = entries.length
        const frag = container.ownerDocument!.createDocumentFragment()
        for (let i = startIdx; i < arr.length; i++) {
          const e = createEntry(arr[i], i)
          entries.push(e)
          byKey.set(e.key, e)
          _trackLive(pending, e)
          frag.appendChild(e.element)
        }
        container.insertBefore(frag, anchor)
        prevArrRef = arr
        return
      }
    }

    // Remove-only.
    if (changes && changes.length > 0 && entries.length > arr.length) {
      let onlyRemoves = true
      let totalRemoved = 0
      for (let i = 0; i < changes.length; i++) {
        const c = changes[i]
        if (c.type !== 'remove') {
          onlyRemoves = false
          break
        }
        totalRemoved += (c.count as number) || 0
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
        const rmIdx: number[] = []
        for (const c of changes) {
          const s = c.start as number
          const ct = c.count as number
          for (let k = 0; k < ct; k++) rmIdx.push(s + k)
        }
        rmIdx.sort((a, b) => b - a)
        for (let i = 0; i < rmIdx.length; i++) {
          const j = rmIdx[i]
          if (j >= 0 && j < entries.length) {
            removeEntry(entries[j])
            entries.splice(j, 1)
          }
        }
        prevArrRef = arr
        return
      }
    }

    // ── General keyed reconciliation ─────────────────────────────────
    const newLen = arr.length
    const oldLen = entries.length

    // Fresh-create fast path (09_clear1k_x8 per-cycle).
    if (oldLen === 0 && newLen > 0) {
      const freshEntries: Entry[] = new Array(newLen)
      const frag = container.ownerDocument!.createDocumentFragment()
      for (let i = 0; i < newLen; i++) {
        const e = createEntry(arr[i], i)
        freshEntries[i] = e
        byKey.set(e.key, e)
        _trackLive(pending, e)
        frag.appendChild(e.element)
      }
      container.insertBefore(frag, anchor)
      entries = freshEntries
      prevArrRef = arr
      return
    }

    const newKeys: string[] = new Array(newLen)
    for (let i = 0; i < newLen; i++) newKeys[i] = keyFn(arr[i], i)

    if (newLen === 0) {
      // Bulk clear.
      if (container.childNodes.length === oldLen + 1) {
        if (onItemRemove) {
          for (let i = 0; i < oldLen; i++) onItemRemove(entries[i])
          _deferBulk(pending, entries)
        } else {
          _deferBulk(pending, entries)
        }
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

    // Swap fast path (05_swap).
    if (newLen === oldLen) {
      let diffA = -1,
        diffB = -1,
        diffCount = 0
      for (let i = 0; i < newLen; i++) {
        if (entries[i].key !== newKeys[i]) {
          if (diffCount === 0) diffA = i
          else if (diffCount === 1) diffB = i
          diffCount++
          if (diffCount > 2) break
        }
      }
      if (diffCount === 2 && entries[diffA].key === newKeys[diffB] && entries[diffB].key === newKeys[diffA]) {
        const eA = entries[diffA],
          eB = entries[diffB]
        const refB = eB.element.nextSibling
        container.insertBefore(eB.element, eA.element)
        if (refB) container.insertBefore(eA.element, refB)
        else container.appendChild(eA.element)
        entries[diffA] = eB
        entries[diffB] = eA
        if (unwrap(arr[diffA]) !== eB.item) patchEntry(eB, arr[diffA], diffA)
        if (unwrap(arr[diffB]) !== eA.item) patchEntry(eA, arr[diffB], diffB)
        prevArrRef = arr
        return
      }
    }

    // Disjoint-replace (02_replace1k).
    if (oldLen > 0 && newLen > 0 && container.childNodes.length === oldLen + 1) {
      let disjoint = true
      for (let i = 0; i < newLen; i++) {
        if (byKey.has(newKeys[i])) {
          disjoint = false
          break
        }
      }
      if (disjoint) {
        if (onItemRemove) {
          for (let i = 0; i < oldLen; i++) onItemRemove(entries[i])
          _deferBulk(pending, entries)
        } else {
          _deferBulk(pending, entries)
        }
        byKey.clear()
        const newEntries: Entry[] = new Array(newLen)
        const newEls: Node[] = new Array(newLen + 1)
        for (let i = 0; i < newLen; i++) {
          const e = createEntry(arr[i], i)
          newEntries[i] = e
          newEls[i] = e.element
          byKey.set(e.key, e)
          _trackLive(pending, e)
        }
        newEls[newLen] = anchor
        ;(container as any).replaceChildren(...newEls)
        entries = newEntries
        prevArrRef = arr
        return
      }
    }

    // General LIS reconcile.
    for (let i = 0; i < oldLen; i++) (entries[i] as any)._i = i
    const newToOld = new Array(newLen)
    const seenOld = new Array(oldLen).fill(false)
    for (let i = 0; i < newLen; i++) {
      const existing = byKey.get(newKeys[i])
      if (existing) {
        const oldIdx = (existing as any)._i as number
        newToOld[i] = oldIdx
        seenOld[oldIdx] = true
      } else {
        newToOld[i] = -1
      }
    }

    for (let i = oldLen - 1; i >= 0; i--) {
      if (!seenOld[i]) removeEntry(entries[i])
    }

    const stable = new Set(lis(newToOld))

    const next: Entry[] = new Array(newLen)
    let nextRef: Node = anchor
    for (let i = newLen - 1; i >= 0; i--) {
      const oldIdx = newToOld[i]
      let e: Entry
      if (oldIdx === -1) {
        e = createEntry(arr[i], i)
        byKey.set(e.key, e)
        _trackLive(pending, e)
        container.insertBefore(e.element, nextRef)
      } else {
        e = entries[oldIdx]
        if (e.item !== unwrap(arr[i])) patchEntry(e, arr[i], i)
        if (e.element.parentNode !== container) container.insertBefore(e.element, nextRef)
        else if (!stable.has(i)) container.insertBefore(e.element, nextRef)
      }
      next[i] = e
      nextRef = e.element
    }

    entries = next
    prevArrRef = arr
  }

  // ── Subscribe for array updates ──────────────────────────────────────
  if (typeof path === 'function') {
    withTracking(disposer, root, () => {
      const arr = (path as () => any[])()
      const next = Array.isArray(arr) ? arr : []
      markEntriesLeaving(next)
      queueMicrotask(() => reconcile(next))
    })
  } else {
    const off = subscribe(root, path as readonly string[], (_v: any, changes?: Change[]) => {
      reconcile(resolveArr(), changes)
    })
    disposer.add(off)
  }
}
