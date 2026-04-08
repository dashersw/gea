/**
 * Benchmark: proxyIterate cache — eliminate per-call proxy allocations
 * PR #39: Cache array-element proxies in iterateProxyCache WeakMap
 *
 * Before: every store.array[i] access creates a new Proxy object
 * After:  proxy is reused from iterateProxyCache on second+ access
 *
 * Run: node --expose-gc --conditions source --import tsx/esm packages/gea/benchmarks/proxy-iterate.bench.ts
 * Or:  npx tsx --conditions source packages/gea/benchmarks/proxy-iterate.bench.ts
 */
import { Store } from '../src/lib/store.ts'

function forceGC() { if (typeof global.gc === 'function') { global.gc(); global.gc() } }
function heapMB() { return process.memoryUsage().heapUsed / 1024 / 1024 }
function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function stddev(arr: number[]) {
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((a, b) => a + (b - avg) ** 2, 0) / arr.length)
}

// ---------- Setup ----------
class BenchStore extends Store {
  items = Array.from({ length: 500 }, (_, i) => ({ id: i, label: `item-${i}`, active: i % 2 === 0 }))
}

const ITEM_COUNT = 500
const WARMUP = 20
const TRIALS = 100

console.log('\n╔══ proxyIterate cache: no-cache vs cached proxy access ════════════════════╗')
console.log(`║ ${ITEM_COUNT} items, ${TRIALS} trials each                                                ║`)
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n')

// ── Scenario A: No cache (fresh store each trial = cold proxy creation) ──
// Simulate pre-PR behavior: each trial creates a brand new store so the
// iterateProxyCache is empty — every element access allocates a new Proxy.
console.log('Scenario A — NO CACHE (fresh store per trial, all proxy allocations cold):')
forceGC()
const hA0 = heapMB()
const noCache: number[] = []
for (let t = 0; t < WARMUP + TRIALS; t++) {
  const freshStore = new BenchStore()         // empty cache each time
  const t0 = performance.now()
  freshStore.items.forEach((item) => void item)
  const elapsed = performance.now() - t0
  if (t >= WARMUP) noCache.push(elapsed)
}
forceGC()
const hA1 = heapMB()

// ── Scenario B: With cache (same store, warm iterateProxyCache) ──
// Post-PR behavior: proxy for each index is cached in iterateProxyCache.
console.log('Scenario B — WITH CACHE (same store, proxies reused from iterateProxyCache):')
const cachedStore = new BenchStore()
// Pre-warm the cache via forEach so iterateProxyCache is populated
cachedStore.items.forEach((item) => void item)

forceGC()
const hB0 = heapMB()
const withCache: number[] = []
for (let t = 0; t < WARMUP + TRIALS; t++) {
  const t0 = performance.now()
  cachedStore.items.forEach((item) => void item)
  const elapsed = performance.now() - t0
  if (t >= WARMUP) withCache.push(elapsed)
}
forceGC()
const hB1 = heapMB()

const noCacheMed  = median(noCache)
const withCacheMed = median(withCache)
const speedup     = noCacheMed / withCacheMed

console.log()
console.log(`${'Metric'.padEnd(34)} ${'No cache'.padStart(12)} ${'With cache'.padStart(12)}`)
console.log('─'.repeat(60))
console.log(`${'Median time / full iteration (µs)'.padEnd(34)} ${(noCacheMed * 1000).toFixed(1).padStart(12)} ${(withCacheMed * 1000).toFixed(1).padStart(12)}`)
console.log(`${'Stddev (µs)'.padEnd(34)} ${(stddev(noCache) * 1000).toFixed(1).padStart(12)} ${(stddev(withCache) * 1000).toFixed(1).padStart(12)}`)
console.log(`${'Heap delta vs baseline (MB)'.padEnd(34)} ${(hA1 - hA0).toFixed(3).padStart(12)} ${(hB1 - hB0).toFixed(3).padStart(12)}`)
console.log(`${'Speedup'.padEnd(34)} ${'1.0x (baseline)'.padStart(12)} ${(speedup.toFixed(1) + 'x').padStart(12)}`)
console.log()
console.log(`Array size: ${ITEM_COUNT} items | ${TRIALS} trials | Warm-up: ${WARMUP} iterations`)
console.log('No cache: new store per trial → iterateProxyCache empty → Proxy() called for every element.')
console.log('With cache: same store → iterateProxyCache hit → no allocation on warm access.\n')
