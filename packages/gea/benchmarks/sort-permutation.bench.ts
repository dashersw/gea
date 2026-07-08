/**
 * Benchmark: sort/reverse permutation O(n²) → O(n)
 * PR #38: Replace indexOf-in-loop with Map-based bucket lookup
 *
 * Run: npx tsx --conditions source packages/gea/benchmarks/sort-permutation.bench.ts
 */

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function stddev(arr: number[]): number {
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((a, b) => a + (b - avg) ** 2, 0) / arr.length)
}
function forceGC() { if (typeof global.gc === 'function') { global.gc(); global.gc() } }

function computePermutationOld(prev: any[], next: any[]): number[] {
  const p = prev.slice()
  return next.map((v) => {
    const idx = p.indexOf(v)
    p[idx] = undefined
    return idx
  })
}

function computePermutationNew(prev: any[], next: any[]): number[] {
  const idxMap = new Map<any, { indices: number[]; next: number }>()
  for (let i = 0; i < prev.length; i++) {
    const bucket = idxMap.get(prev[i])
    if (bucket) bucket.indices.push(i)
    else idxMap.set(prev[i], { indices: [i], next: 0 })
  }
  const permutation = new Array<number>(next.length)
  for (let i = 0; i < next.length; i++) {
    const bucket = idxMap.get(next[i])
    permutation[i] = bucket ? bucket.indices[bucket.next++] : i
  }
  return permutation
}

function runTrials(fn: () => void, warmup: number, trials: number): number[] {
  for (let i = 0; i < warmup; i++) fn()
  return Array.from({ length: trials }, () => {
    const t0 = performance.now()
    fn()
    return performance.now() - t0
  })
}

function makeArray(size: number): number[] { return Array.from({ length: size }, (_, i) => i) }
function shuffle(arr: number[]): number[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const SIZES  = [100, 500, 1000, 5000, 10000]
const WARMUP = 10
const TRIALS = 50

console.log('\n╔══ sort/reverse permutation: O(n²) vs O(n) ══════════════════════════════╗')
console.log(`║ ${TRIALS} trials per size, ${WARMUP} warm-up iterations                              ║`)
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n')
console.log(`${'n'.padEnd(7)} | ${'old med (ms)'.padStart(12)} | ${'new med (ms)'.padStart(12)} | ${'speedup'.padStart(9)} | ${'old σ'.padStart(8)} | ${'new σ'.padStart(8)}`)
console.log('─'.repeat(74))

for (const size of SIZES) {
  const base   = makeArray(size)
  const sorted = shuffle(base)

  forceGC()
  const oldTimes = runTrials(() => computePermutationOld(base, sorted), WARMUP, TRIALS)
  forceGC()
  const newTimes = runTrials(() => computePermutationNew(base, sorted), WARMUP, TRIALS)

  const oldMed = median(oldTimes)
  const newMed = median(newTimes)
  const speedup = oldMed / newMed

  console.log(
    `${String(size).padEnd(7)} | ${oldMed.toFixed(3).padStart(12)} | ${newMed.toFixed(3).padStart(12)} | ${(speedup.toFixed(1) + 'x').padStart(9)} | ${stddev(oldTimes).toFixed(3).padStart(8)} | ${stddev(newTimes).toFixed(3).padStart(8)}`
  )
}

console.log()
console.log('Methodology: 50 trials per config, median reported to suppress outliers.')
console.log('Old: Array.indexOf in loop = O(n) per element = O(n²) total.')
console.log('New: Map bucket pre-built in O(n), lookup in O(1) = O(n) total.\n')
