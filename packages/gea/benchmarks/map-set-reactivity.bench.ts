/**
 * Benchmark: reactive Map — overhead of change-tracking proxy on Map operations
 * PR #40: _createMapProxy wraps Map fields; set/delete/clear emit StoreChange events
 *
 * Run: npx tsx --conditions source packages/gea/benchmarks/map-set-reactivity.bench.ts
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

// ── Store under test ──────────────────────────────────────────────────────────

class CacheStore extends Store {
  entries = new Map<string, { value: string; ttl: number }>()
}

const KEYS   = Array.from({ length: 20 }, (_, i) => `key-${i}`)
const WARMUP = 50
const TRIALS = 200
const ITERS  = 100

function runTrials(fn: () => void): number[] {
  for (let i = 0; i < WARMUP; i++) fn()
  return Array.from({ length: TRIALS }, () => {
    const t0 = performance.now()
    for (let i = 0; i < ITERS; i++) fn()
    return (performance.now() - t0) / ITERS
  })
}

console.log('\n╔══ reactive Map: change-tracking proxy overhead ════════════════════════════╗')
console.log('║ CacheStore.entries Map<string,{value,ttl}>: 20-key set → has → delete cycle  ║')
console.log(`║ ${TRIALS} trials × ${ITERS} full cycles each                                              ║`)
console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n')

// A: Plain Map baseline
const plain = new Map<string, { value: string; ttl: number }>()
forceGC(); const hA0 = heapMB()
const plainTimes = runTrials(() => {
  for (const k of KEYS) plain.set(k, { value: k, ttl: 300 })
  for (const k of KEYS) plain.has(k)
  for (const k of KEYS) plain.delete(k)
})
forceGC(); const hA1 = heapMB()

// B: Reactive Map — cold (fresh store per iteration, mapSetProxyCache empty)
forceGC(); const hB0 = heapMB()
const coldTimes = runTrials(() => {
  const s = new CacheStore()
  for (const k of KEYS) s.entries.set(k, { value: k, ttl: 300 })
  for (const k of KEYS) s.entries.has(k)
  for (const k of KEYS) s.entries.delete(k)
})
forceGC(); const hB1 = heapMB()

// C: Reactive Map — warm (same store, proxy cached in mapSetProxyCache)
const ws = new CacheStore()
void ws.entries   // access once to warm mapSetProxyCache
forceGC(); const hC0 = heapMB()
const warmTimes = runTrials(() => {
  for (const k of KEYS) ws.entries.set(k, { value: k, ttl: 300 })
  for (const k of KEYS) ws.entries.has(k)
  for (const k of KEYS) ws.entries.delete(k)
})
forceGC(); const hC1 = heapMB()

// D: Reactive Map — read-only (has only, no mutations, no StoreChange)
const rs = new CacheStore()
for (const k of KEYS) rs.entries.set(k, { value: k, ttl: 300 })
forceGC(); const hD0 = heapMB()
const readTimes = runTrials(() => {
  for (const k of KEYS) rs.entries.has(k)
})
forceGC(); const hD1 = heapMB()

const plainMed = median(plainTimes) * 1_000
const coldMed  = median(coldTimes)  * 1_000
const warmMed  = median(warmTimes)  * 1_000
const readMed  = median(readTimes)  * 1_000

console.log(`${'Scenario'.padEnd(44)} ${'Med (µs)'.padStart(10)} ${'σ (µs)'.padStart(8)} ${'Overhead'.padStart(10)} ${'Heap Δ MB'.padStart(11)}`)
console.log('─'.repeat(85))
console.log(`${'A. Plain Map (set+has+delete)'.padEnd(44)} ${plainMed.toFixed(2).padStart(10)} ${(stddev(plainTimes)*1e3).toFixed(2).padStart(8)} ${'baseline'.padStart(10)} ${(hA1-hA0).toFixed(3).padStart(11)}`)
console.log(`${'B. Reactive Map — cold (new store)'.padEnd(44)} ${coldMed.toFixed(2).padStart(10)} ${(stddev(coldTimes)*1e3).toFixed(2).padStart(8)} ${((coldMed/plainMed).toFixed(1)+'x').padStart(10)} ${(hB1-hB0).toFixed(3).padStart(11)}`)
console.log(`${'C. Reactive Map — warm (proxy cached)'.padEnd(44)} ${warmMed.toFixed(2).padStart(10)} ${(stddev(warmTimes)*1e3).toFixed(2).padStart(8)} ${((warmMed/plainMed).toFixed(1)+'x').padStart(10)} ${(hC1-hC0).toFixed(3).padStart(11)}`)
console.log(`${'D. Reactive Map — read-only (has only)'.padEnd(44)} ${readMed.toFixed(2).padStart(10)} ${(stddev(readTimes)*1e3).toFixed(2).padStart(8)} ${((readMed/plainMed).toFixed(1)+'x').padStart(10)} ${(hD1-hD0).toFixed(3).padStart(11)}`)
console.log()
console.log('A: native Map, no proxy — absolute minimum cost.')
console.log('B: cold includes store init + first-access proxy construction per .entries access.')
console.log('C: warm shows true steady-state overhead — only set/delete trigger StoreChange + microtask.')
console.log('D: read-only path (has) bypasses change machinery; overhead is Proxy get-trap only.\n')
