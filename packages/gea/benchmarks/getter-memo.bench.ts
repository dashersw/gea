/**
 * Benchmark: store getter memoization with reactive dependency tracking
 * PR #41: Cache prototype getter results; invalidate on observed field changes
 *
 * Run: npx tsx --conditions source packages/gea/benchmarks/getter-memo.bench.ts
 */
import { Store } from '../src/lib/store.ts'

function heapMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024
}

function bench(fn: () => void, iters: number): number {
  for (let i = 0; i < 20; i++) fn() // warm-up
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  return performance.now() - t0
}

// ---------- Store with computed getters ----------
class ProductStore extends Store {
  price = 100
  tax = 0.18
  discount = 0
  quantity = 5
  name = 'Widget'

  get subtotal() {
    return this.price * this.quantity
  }

  get taxAmount() {
    return this.subtotal * this.tax
  }

  get discountAmount() {
    return this.subtotal * this.discount
  }

  get total() {
    return this.subtotal + this.taxAmount - this.discountAmount
  }

  get summary() {
    return `${this.name}: $${this.total.toFixed(2)} (qty: ${this.quantity})`
  }
}

const ITERS = 100_000

console.log('\n=== store getter memoization benchmark ===')
console.log('Store: ProductStore with 5 chained computed getters\n')

const store = new ProductStore()

// --- Scenario 1: Warm reads (no state change — pure cache hits) ---
if (global.gc) global.gc()
const h0 = heapMB()

const warmMs = bench(() => {
  void store.total
  void store.summary
  void store.subtotal
}, ITERS)

if (global.gc) global.gc()
const h1 = heapMB()

// --- Scenario 2: Mixed reads + invalidation ---
let counter = 0
const invalidMs = bench(() => {
  void store.total
  if (counter % 100 === 0) {
    store.price = 100 + ((counter / 100) % 5) // invalidate every 100 reads, cycling 100-104
  }
  counter++
  void store.summary
}, ITERS)

if (global.gc) global.gc()
const h2 = heapMB()

// --- Per-getter timing ---
const singleGetterMs = bench(() => {
  void store.total
}, ITERS)

console.log(`${'Scenario'.padEnd(36)} ${'Time (ms)'.padStart(10)} ${'Per-call (ns)'.padStart(14)}`)
console.log('-'.repeat(62))

function row(label: string, ms: number) {
  const perCallNs = ((ms / ITERS) * 1_000_000).toFixed(0)
  console.log(`${label.padEnd(36)} ${ms.toFixed(2).padStart(10)} ${perCallNs.padStart(14)}`)
}

row(`Warm reads (${ITERS.toLocaleString()} × 3 getters)`, warmMs)
row(`Single getter (${ITERS.toLocaleString()} reads)`, singleGetterMs)
row(`Mixed read+invalidate (1% churn)`, invalidMs)

console.log()
console.log(`Heap after warm reads:       ${h1.toFixed(2)} MB  (delta: ${(h1-h0).toFixed(3)} MB)`)
console.log(`Heap after invalidation mix: ${h2.toFixed(2)} MB  (delta: ${(h2-h1).toFixed(3)} MB)`)
console.log()
console.log('Memoized getters: repeated reads hit the cache (no recomputation).')
console.log('Invalidation: changing a dependency clears only the affected getters.')
console.log('Memory overhead: one WeakMap entry + dep set per getter instance.\n')
