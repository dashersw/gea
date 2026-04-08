/**
 * Benchmark: path parts interning — eliminate hot-path array allocations
 * PR #42: Cache [...parent, key] results in _appendCache WeakMap
 *
 * Run: npx tsx --conditions source packages/gea/benchmarks/path-interning.bench.ts
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

// --- Real store: deep reactive property access ---
class DeepStore extends Store {
  user = {
    profile: {
      address: {
        city: 'Istanbul',
        zip: '34000',
      }
    }
  }
}

const store = new DeepStore()
const STORE_ITERS = 50_000

if (typeof global.gc === 'function') global.gc()
const hs0 = heapMB()
const storeMs = bench(() => {
  void store.user.profile.address.city
  void store.user.profile.address.zip
}, STORE_ITERS)
if (typeof global.gc === 'function') global.gc()
const hs1 = heapMB()

console.log('Real store deep property access (depth 4, 2 leaf props):')
console.log(`  ${STORE_ITERS.toLocaleString()} iterations: ${storeMs.toFixed(2)}ms`)
console.log(`  per-iter: ${((storeMs/STORE_ITERS)*1000).toFixed(1)}µs`)
console.log(`  heap delta: ${(hs1-hs0).toFixed(3)} MB`)
console.log()
console.log('With path interning: same path arrays are reused across proxy navigations.')
console.log('Without interning: each proxy access spreads a new array for each path segment.\n')
