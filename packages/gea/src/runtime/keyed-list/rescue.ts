/**
 * Cross-list rescue. `removeEntry` queues `disposer.dispose()` to a microtask
 * instead of firing it synchronously. If the same `.map()` site's
 * `createEntry` sees the matching key before that microtask runs, it pulls
 * the entry back out — DOM + disposer + subscriptions transfer intact.
 *
 * The `pending` map is **per-site**: the compiler emits one `Map<string, Entry>`
 * literal per `.map()` site at module scope and threads it into every
 * `_defer` / `_deferBulk` / `_rescue` call. Two unrelated `.map()` sites
 * can't collide because they literally don't share a Map.
 */
import type { Entry } from './types'
import { GEA_PROXY_RAW } from '../symbols'

type Pending = Map<string, Entry>
type LiveEntries = Map<string, Set<Entry>>

interface PendingBulkBatch {
  pending: Pending
  entries: Entry[]
}

const _toFlush = new Set<Pending>()
const _live = new WeakMap<Pending, LiveEntries>()
const _claimed = new WeakSet<Entry>()
const _claimable = new WeakSet<Entry>()
let _pendingBulk: PendingBulkBatch[] | null = null
let _flushQueued = false

const _unwrap = (v: any): any => (v && typeof v === 'object' && v[GEA_PROXY_RAW]) || v

function _liveFor(pending: Pending): LiveEntries {
  let live = _live.get(pending)
  if (!live) {
    live = new Map()
    _live.set(pending, live)
  }
  return live
}

export function _trackLive(pending: Pending, e: Entry): void {
  const key = String(e.key)
  const live = _liveFor(pending)
  let bucket = live.get(key)
  if (!bucket) live.set(key, (bucket = new Set()))
  bucket.add(e)
}

function _untrackLive(pending: Pending, e: Entry): void {
  _claimable.delete(e)
  const bucket = _live.get(pending)?.get(String(e.key))
  if (!bucket) return
  bucket.delete(e)
  if (bucket.size === 0) _live.get(pending)?.delete(String(e.key))
}

export function _markClaimable(e: Entry, claimable: boolean): void {
  if (claimable) _claimable.add(e)
  else _claimable.delete(e)
}

export function _consumeClaim(e: Entry): boolean {
  if (!_claimed.has(e)) return false
  _claimed.delete(e)
  _claimable.delete(e)
  return true
}

function _schedule(): void {
  if (_flushQueued) return
  _flushQueued = true
  queueMicrotask(() => {
    _flushQueued = false
    const drainMaps = Array.from(_toFlush)
    const bulk = _pendingBulk
    _toFlush.clear()
    _pendingBulk = null
    for (let i = 0; i < drainMaps.length; i++) {
      const m = drainMaps[i]
      for (const e of m.values()) {
        try {
          e.disposer.dispose()
        } catch {
          /* isolated */
        }
      }
      m.clear()
    }
    if (bulk) {
      for (let i = 0; i < bulk.length; i++) {
        const batch = bulk[i].entries
        for (let j = 0; j < batch.length; j++) {
          try {
            batch[j].disposer.dispose()
          } catch {
            /* isolated */
          }
        }
      }
    }
  })
}

export function _defer(pending: Pending, e: Entry): void {
  _untrackLive(pending, e)
  pending.set(String(e.key), e)
  _toFlush.add(pending)
  _schedule()
}

/**
 * Queue a full batch of removed entries for deferred disposal. Cheaper than
 * per-row `_defer` for whole-list ops (clear, disjoint replace): no
 * `Map.set` per row. If a `_rescue` call arrives before the microtask
 * drains, the batch is materialized into its target `pending` map first.
 */
export function _deferBulk(pending: Pending, entries: Entry[]): void {
  if (entries.length === 0) return
  const next: Entry[] = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (_consumeClaim(e)) continue
    _untrackLive(pending, e)
    next.push(e)
  }
  if (next.length === 0) return
  const batch: PendingBulkBatch = { pending, entries: next }
  if (_pendingBulk) _pendingBulk.push(batch)
  else _pendingBulk = [batch]
  _schedule()
}

export function _rescue(pending: Pending, key: string, item?: any): Entry | null {
  const e = pending.get(key)
  if (e) {
    pending.delete(key)
    return e
  }

  // Lazy fallback: materialize any pending bulk batches into their target
  // pending maps so cross-site rescue still works without paying per-row
  // Map.set on the common no-rescue-needed bulk path.
  if (_pendingBulk) {
    for (let i = 0; i < _pendingBulk.length; i++) {
      const batch = _pendingBulk[i]
      const target = batch.pending
      const items = batch.entries
      for (let j = 0; j < items.length; j++) target.set(String(items[j].key), items[j])
      _toFlush.add(target)
    }
    _pendingBulk = null
    const r = pending.get(key)
    if (r) {
      pending.delete(key)
      return r
    }
  }

  if (arguments.length >= 3) {
    const raw = _unwrap(item)
    const bucket = _live.get(pending)?.get(key)
    if (bucket) {
      for (const live of bucket) {
        if (_claimable.has(live) && live.item === raw) {
          _claimed.add(live)
          _claimable.delete(live)
          return live
        }
      }
    }
  }
  return null
}
