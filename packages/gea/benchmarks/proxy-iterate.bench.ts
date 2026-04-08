/**
 * Benchmark: proxyIterate cache — eliminate per-call proxy allocations
 * PR #39: Cache proxies in iterateProxyCache WeakMap instead of creating new ones each iteration
 *
 * Run: npx tsx --conditions source packages/gea/benchmarks/proxy-iterate.bench.ts
 */
import { Store } from '../src/lib/store.ts'

function heapMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024
}

function bench(fn: () => void, iters: number): number {
  for (let i = 0; i < 10; i++) fn()
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  return performance.now() - t0
}

class TestStore extends Store {
  items = Array.from({ length: 500 }, (_, i) => ({ id: i, value: `item-${i}` }))
}

const ITERS = 5000

console.log('\n=== proxyIterate cache benchmark ===')
console.log('Simulating repeated array iteration (index access) on a 500-item store array\n')

const store = new TestStore()

if (typeof global.gc === 'function') global.gc()
const h0 = heapMB()

const coldMs = bench(() => {
  for (let i = 0; i < store.items.length; i++) {
    void store.items[i]
  }
}, 1)

if (typeof global.gc === 'function') global.gc()
const h1 = heapMB()

const warmMs = bench(() => {
  for (let i = 0; i < store.items.length; i++) {
    void store.items[i]
  }
}, ITERS)

if (typeof global.gc === 'function') global.gc()
const h2 = heapMB()

console.log(`${'Metric'.padEnd(32)} ${'Result'.padStart(14)}`)
console.log('-'.repeat(48))
console.log(`${'Array size'.padEnd(32)} ${'500 items'.padStart(14)}`)
console.log(`${'Iterations'.padEnd(32)} ${String(ITERS).padStart(14)}`)
console.log(`${'Cold pass (ms)'.padEnd(32)} ${coldMs.toFixed(2).padStart(14)}`)
console.log(`${'Warm ${ITERS} iters (ms)'.padEnd(32)} ${warmMs.toFixed(2).padStart(14)}`)
console.log(`${'Per-iter (µs)'.padEnd(32)} ${((warmMs / ITERS) * 1000).toFixed(1).padStart(14)}`)
console.log(`${'Heap before warm (MB)'.padEnd(32)} ${h1.toFixed(2).padStart(14)}`)
console.log(`${'Heap after warm (MB)'.padEnd(32)} ${h2.toFixed(2).padStart(14)}`)
console.log(`${'Heap delta (MB)'.padEnd(32)} ${(h2 - h1).toFixed(3).padStart(14)}`)
console.log()
console.log('Without cache: every array[i] access allocates a new Proxy object.')
console.log('With cache:    proxy reused from iterateProxyCache WeakMap → zero allocation on hit.')
console.log('Expected heap delta ≈ 0 MB with cache (proxies reused, not collected).\n')
