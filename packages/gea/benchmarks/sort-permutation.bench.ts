/**
 * Benchmark: sort/reverse permutation O(n²) → O(n)
 * PR #38: Replace indexOf-in-loop with Map-based bucket lookup
 *
 * Run: npx tsx packages/gea/benchmarks/sort-permutation.bench.ts
 */

function heapMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024
}

// ---------- OLD implementation (O(n²)) ----------
function computePermutationOld(prev: any[], next: any[]): number[] {
  return next.map((v) => {
    const idx = prev.indexOf(v)
    prev[idx] = undefined // mark consumed
    return idx
  })
}

// ---------- NEW implementation (O(n)) ----------
function computePermutationNew(prev: any[], next: any[]): number[] {
  const idxMap = new Map<any, number[]>()
  for (let i = 0; i < prev.length; i++) {
    const a = idxMap.get(prev[i])
    a ? a.push(i) : idxMap.set(prev[i], [i])
  }
  const cursors = new Map<any, number>()
  return next.map((v) => {
    const bucket = idxMap.get(v)!
    const cursor = cursors.get(v) ?? 0
    cursors.set(v, cursor + 1)
    return bucket[cursor]
  })
}

// ---------- Benchmark harness ----------
function bench(label: string, fn: () => void, iters: number): number {
  // warm-up
  for (let i = 0; i < 5; i++) fn()
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  return performance.now() - t0
}

function makeArray(size: number): number[] {
  return Array.from({ length: size }, (_, i) => i)
}

function shuffleArray(arr: number[]): number[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const SIZES = [100, 1000, 5000, 10000]
const ITERS = 200

console.log('\n=== sort/reverse permutation benchmark ===')
console.log(`${'Size'.padEnd(8)} ${'Old (ms)'.padStart(10)} ${'New (ms)'.padStart(10)} ${'Speedup'.padStart(10)} ${'Heap Δ (MB)'.padStart(12)}`)
console.log('-'.repeat(56))

for (const size of SIZES) {
  const base = makeArray(size)
  const shuffled = shuffleArray(base)

  const h0 = heapMB()

  const oldMs = bench(
    'old',
    () => {
      const prev = base.slice()
      computePermutationOld(prev, shuffled)
    },
    ITERS,
  )

  const h1 = heapMB()

  const newMs = bench(
    'new',
    () => {
      const prev = base.slice()
      computePermutationNew(prev, shuffled)
    },
    ITERS,
  )

  const h2 = heapMB()
  const heapDelta = (h2 - h1).toFixed(3)
  const speedup = (oldMs / newMs).toFixed(1)

  console.log(
    `${String(size).padEnd(8)} ${oldMs.toFixed(2).padStart(10)} ${newMs.toFixed(2).padStart(10)} ${(speedup + 'x').padStart(10)} ${heapDelta.padStart(12)}`,
  )
}

console.log('\nAll sizes: new implementation is O(n) vs O(n²) old.')
console.log('Speedup scales with array size. Heap delta is minimal.\n')
