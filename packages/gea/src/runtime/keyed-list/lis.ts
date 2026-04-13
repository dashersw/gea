/**
 * Longest Increasing Subsequence — O(n log n). Input is `newToOld[]`
 * (index in new array → index in old array, or `-1` for new items). Output
 * is the set of new-indices that form the longest increasing run of old
 * indices, i.e. the set of entries that can stay put during a reorder.
 */
export function lis(arr: number[]): number[] {
  const n = arr.length
  if (n === 0) return []
  const vals: number[] = []
  const idxs: number[] = []
  for (let i = 0; i < n; i++) {
    if (arr[i] !== -1) {
      vals.push(arr[i])
      idxs.push(i)
    }
  }
  const m = vals.length
  if (m === 0) return []
  const tails: number[] = []
  const tIdx: number[] = []
  const pred = new Array(m).fill(-1)
  for (let i = 0; i < m; i++) {
    const v = vals[i]
    let lo = 0,
      hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tails[mid] < v) lo = mid + 1
      else hi = mid
    }
    if (lo === tails.length) {
      tails.push(v)
      tIdx.push(i)
    } else {
      tails[lo] = v
      tIdx[lo] = i
    }
    if (lo > 0) pred[i] = tIdx[lo - 1]
  }
  const out = new Array(tails.length)
  let k = tIdx[tails.length - 1]
  for (let i = tails.length - 1; i >= 0; i--) {
    out[i] = idxs[k]
    k = pred[k]
  }
  return out
}
