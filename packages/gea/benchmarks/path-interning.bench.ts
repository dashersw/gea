/**
 * Benchmark: path parts interning — eliminate hot-path array allocations
 * PR #42: Cache [...parent, key] results in _appendCache WeakMap
 *
 * Run: node --expose-gc --conditions source --import tsx/esm packages/gea/benchmarks/path-interning.bench.ts
 */
import { Store } from '../src/lib/store.ts'

function heapMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024
}

function bench(fn: () => void, iters: number): number {
  for (let i = 0; i < 20; i++) fn()
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  return performance.now() - t0
}

// ---------- OLD: naive spread (always allocates) ----------
function appendOld(parent: string[], key: string): string[] {
  return [...parent, key]
}

// ---------- NEW: intern cache (returns cached reference) ----------
const _appendCache = new WeakMap<string[], Map<string, string[]>>()
function appendNew(parent: string[], key: string): string[] {
  let map = _appendCache.get(parent)
  if (!map) {
    map = new Map()
    _appendCache.set(parent, map)
  }
  let result = map.get(key)
  if (!result) {
    result = [...parent, key]
    map.set(key, result)
  }
  return result
}

const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
const ITERS = 200_000

console.log('\n=== path parts interning benchmark ===')
console.log('Simulating hot-path proxy navigation: append key to parent path array\n')

// --- Shallow path (depth 1) ---
{
  const parent: string[] = []
  if (typeof global.gc === 'function') global.gc()
  const h0 = heapMB()
  const oldMs = bench(() => { for (const k of keys) appendOld(parent, k) }, ITERS)
  if (typeof global.gc === 'function') global.gc()
  const h1 = heapMB()
  const newMs = bench(() => { for (const k of keys) appendNew(parent, k) }, ITERS)
  if (typeof global.gc === 'function') global.gc()
  const h2 = heapMB()
  console.log('Shallow path (depth 1):')
  console.log(`  old (spread):   ${oldMs.toFixed(2)}ms  heap Δ ${(h1-h0).toFixed(3)} MB`)
  console.log(`  new (interned): ${newMs.toFixed(2)}ms  heap Δ ${(h2-h1).toFixed(3)} MB`)
  console.log(`  speedup: ${(oldMs/newMs).toFixed(1)}x\n`)
}

// --- Deep path (depth 5) ---
{
  const depth5 = ['store', 'user', 'profile', 'address', 'city']
  if (typeof global.gc === 'function') global.gc()
  const h0 = heapMB()
  const oldMs = bench(() => { for (const k of keys) appendOld(depth5, k) }, ITERS)
  if (typeof global.gc === 'function') global.gc()
  const h1 = heapMB()
  const newMs = bench(() => { for (const k of keys) appendNew(depth5, k) }, ITERS)
  if (typeof global.gc === 'function') global.gc()
  const h2 = heapMB()
  console.log('Deep path (depth 5):')
  console.log(`  old (spread):   ${oldMs.toFixed(2)}ms  heap Δ ${(h1-h0).toFixed(3)} MB`)
  console.log(`  new (interned): ${newMs.toFixed(2)}ms  heap Δ ${(h2-h1).toFixed(3)} MB`)
  console.log(`  speedup: ${(oldMs/newMs).toFixed(1)}x\n`)
}

// --- Real store: array _wrapItem → _internAppend hot path ---
// Each .map() call goes through _wrapItem → appendPathParts → _internAppend per element.
// Cold (fresh store per trial): _internAppend must create and cache new path arrays.
// Warm (same store, repeated .map()): _internAppend returns already-cached path arrays.
class ArrayStore extends Store {
  rows = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `row-${i}`, active: i % 2 === 0 }))
}

const STORE_ITERS = 1_000

if (typeof global.gc === 'function') global.gc()
const hs0 = heapMB()
// Cold: fresh store each iteration → _internAppend misses on every element
const coldMs = bench(() => {
  const s = new ArrayStore()
  s.rows.map(r => r.id)
}, STORE_ITERS)
if (typeof global.gc === 'function') global.gc()
const hs1 = heapMB()
// Warm: same store, repeated .map() → _internAppend returns cached path arrays
const warmStore = new ArrayStore()
const warmMs = bench(() => {
  warmStore.rows.map(r => r.id)
}, STORE_ITERS)
if (typeof global.gc === 'function') global.gc()
const hs2 = heapMB()

console.log('Real store: array .map() via _wrapItem → _internAppend (100 rows):')
console.log(`  cold (fresh store, intern misses): ${coldMs.toFixed(2)}ms  heap Δ ${(hs1-hs0).toFixed(3)} MB`)
console.log(`  warm (cached paths, intern hits):  ${warmMs.toFixed(2)}ms  heap Δ ${(hs2-hs1).toFixed(3)} MB`)
console.log(`  speedup: ${(coldMs/warmMs).toFixed(1)}x\n`)
console.log('With path interning: _wrapItem reuses cached path arrays on repeated .map() calls.')
console.log('Without interning: every .map() would spread a new array for each element path.\n')
