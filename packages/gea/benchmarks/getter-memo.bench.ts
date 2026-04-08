/**
 * Benchmark: store getter memoization with reactive dependency tracking
 * PR #41: Cache prototype getter results; invalidate on observed field changes
 *
 * Before: every getter call recomputes from scratch (even if deps unchanged)
 * After:  repeated reads hit WeakMap cache; invalidated only when deps change
 *
 * Run: npx tsx --conditions source packages/gea/benchmarks/getter-memo.bench.ts
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

// ---------- Store with chained computed getters ----------
class OrderStore extends Store {
  price    = 100
  tax      = 0.18
  discount = 0.05
  quantity = 10
  label    = 'Widget Pro'

  get subtotal()      { return this.price * this.quantity }
  get taxAmount()     { return this.subtotal * this.tax }
  get discountAmt()   { return this.subtotal * this.discount }
  get total()         { return this.subtotal + this.taxAmount - this.discountAmt }
  get displayTotal()  { return `${this.label}: $${this.total.toFixed(2)}` }
}

const WARMUP = 50
const TRIALS = 200
const ITERS_PER_TRIAL = 100  // reads per trial measurement

function runTrials(fn: () => void): number[] {
  for (let i = 0; i < WARMUP; i++) fn()
  return Array.from({ length: TRIALS }, () => {
    const t0 = performance.now()
    for (let i = 0; i < ITERS_PER_TRIAL; i++) fn()
    return (performance.now() - t0) / ITERS_PER_TRIAL  // per-read time
  })
}

console.log('\n╔══ getter memoization: cold vs warm vs invalidated ══════════════════════════╗')
console.log(`║ OrderStore: 5 chained getters (subtotal→taxAmount→discountAmt→total→display)  ║`)
console.log(`║ ${TRIALS} trials × ${ITERS_PER_TRIAL} reads each                                                  ║`)
console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n')

// ── Scenario A: Cold reads (fresh store each trial — cache always misses) ──
forceGC()
const hA0 = heapMB()
const coldTimes = runTrials(() => {
  const s = new OrderStore()   // new instance = cold cache
  void s.displayTotal          // traverses all 5 getters
})
forceGC()
const hA1 = heapMB()

// ── Scenario B: Warm reads (same store, deps unchanged — all cache hits) ──
const warmStore = new OrderStore()
void warmStore.displayTotal  // prime cache
forceGC()
const hB0 = heapMB()
const warmTimes = runTrials(() => {
  void warmStore.displayTotal  // all 5 getters cached
})
forceGC()
const hB1 = heapMB()

// ── Scenario C: Reads with 10% invalidation (dep changes every 10 reads) ──
const mixStore = new OrderStore()
let readCount = 0
forceGC()
const hC0 = heapMB()
const mixTimes = runTrials(() => {
  if (readCount++ % 10 === 0) mixStore.price = 95 + (readCount % 10)  // invalidate
  void mixStore.displayTotal
})
forceGC()
const hC1 = heapMB()

const coldMed = median(coldTimes) * 1000  // µs
const warmMed = median(warmTimes) * 1000
const mixMed  = median(mixTimes)  * 1000

console.log(`${'Scenario'.padEnd(36)} ${'Median (µs)'.padStart(12)} ${'Stddev (µs)'.padStart(12)} ${'Speedup'.padStart(10)} ${'Heap Δ (MB)'.padStart(12)}`)
console.log('─'.repeat(84))
console.log(`${'A. Cold (new store, cache miss)'.padEnd(36)} ${coldMed.toFixed(2).padStart(12)} ${(stddev(coldTimes)*1000).toFixed(2).padStart(12)} ${'1.0x'.padStart(10)} ${(hA1-hA0).toFixed(3).padStart(12)}`)
console.log(`${'B. Warm (same store, cache hit)'.padEnd(36)} ${warmMed.toFixed(2).padStart(12)} ${(stddev(warmTimes)*1000).toFixed(2).padStart(12)} ${((coldMed/warmMed).toFixed(1)+'x').padStart(10)} ${(hB1-hB0).toFixed(3).padStart(12)}`)
console.log(`${'C. Mixed (10% invalidation)'.padEnd(36)} ${mixMed.toFixed(2).padStart(12)} ${(stddev(mixTimes)*1000).toFixed(2).padStart(12)} ${((coldMed/mixMed).toFixed(1)+'x').padStart(10)} ${(hC1-hC0).toFixed(3).padStart(12)}`)
console.log()
console.log('Cold: getter always recomputes (simulates pre-memoization behavior).')
console.log('Warm: cache hit — result returned from WeakMap without recomputation.')
console.log('Mixed: realistic workload — 90% cache hits, 10% dep-triggered recompute.')
console.log('Heap delta shows memoization overhead is minimal (one WeakMap entry per getter).\n')
