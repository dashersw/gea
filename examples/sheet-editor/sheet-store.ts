import { Store } from '@geajs/core'
import { COLS, ROWS, formatAddress, collectDependencies, evaluateFormula, parseAddress } from './formula'

export const COL_LABELS = Array.from({ length: COLS }, (_, i) => String.fromCharCode(65 + i))
export const ROW_LABELS = Array.from({ length: ROWS }, (_, i) => i + 1)

function allAddresses(): string[] {
  const out: string[] = []
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out.push(formatAddress(c, r))
    }
  }
  return out
}

const ALL_ADDRESSES = allAddresses()

function formulaBody(raw: string): string {
  if (!raw.startsWith('=')) return ''
  return raw.slice(1).trim()
}

function sameComputedCell(
  a: { kind: 'num'; value: number } | { kind: 'err'; message: string } | undefined,
  b: { kind: 'num'; value: number } | { kind: 'err'; message: string },
): boolean {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === 'num' && b.kind === 'num') return a.value === b.value
  if (a.kind === 'err' && b.kind === 'err') return a.message === b.message
  return false
}

function topologicalFormulaOrder(formulaCells: string[], getBody: (addr: string) => string): string[] | null {
  const formulaSet = new Set(formulaCells)
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const c of formulaCells) {
    inDegree.set(c, 0)
    adj.set(c, [])
  }

  for (const c of formulaCells) {
    const body = getBody(c)
    const deps = collectDependencies(body)
    for (const d of deps) {
      if (formulaSet.has(d)) {
        inDegree.set(c, (inDegree.get(c) ?? 0) + 1)
        if (!adj.has(d)) adj.set(d, [])
        adj.get(d)!.push(c)
      }
    }
  }

  const queue: string[] = []
  for (const c of formulaCells) {
    if (inDegree.get(c) === 0) queue.push(c)
  }

  const order: string[] = []
  while (queue.length) {
    const u = queue.shift()!
    order.push(u)
    for (const v of adj.get(u) ?? []) {
      const nd = (inDegree.get(v) ?? 0) - 1
      inDegree.set(v, nd)
      if (nd === 0) queue.push(v)
    }
  }

  if (order.length !== formulaCells.length) return null
  return order
}

export class SheetStore extends Store {
  /** Raw cell text as entered (may start with `=`). */
  cells: Record<string, string> = {}

  activeAddress: string | null = null
  /** Draft for formula bar while editing (committed on Enter / blur). */
  barDraft = ''

  /** Per formula cell: computed number or error after last recalc. */
  computed: Record<string, { kind: 'num'; value: number } | { kind: 'err'; message: string }> = {}

  select(address: string): void {
    if (!parseAddress(address)) return
    this.activeAddress = address
    this.barDraft = this.cells[address] ?? ''
  }

  /** Move the active cell by delta columns/rows (clamped to the grid). No-op if already at edge. */
  moveSelection(deltaCol: number, deltaRow: number): void {
    const start = this.activeAddress ?? formatAddress(0, 1)
    const p = parseAddress(start)
    if (!p) return
    const nc = Math.max(0, Math.min(COLS - 1, p.col + deltaCol))
    const nr = Math.max(1, Math.min(ROWS, p.row + deltaRow))
    const next = formatAddress(nc, nr)
    if (next === this.activeAddress) return
    this.select(next)
  }

  setBarDraft(value: string): void {
    this.barDraft = value
  }

  commitBar(): void {
    if (!this.activeAddress) return
    if (typeof document !== 'undefined') {
      const el = document.querySelector('.formula-bar-input') as HTMLInputElement | null
      if (el) this.barDraft = el.value
    }
    this.cells[this.activeAddress] = this.barDraft
    this.recalc()
  }

  setCellRaw(address: string, raw: string): void {
    if (!parseAddress(address)) return
    this.cells[address] = raw
    if (this.activeAddress === address) this.barDraft = raw
    this.recalc()
  }

  /** Numeric value for formula evaluation: non-formula = parsed number or 0; formula = last computed. */
  getNumericForEval(addr: string): number {
    const raw = this.cells[addr] ?? ''
    if (!raw.startsWith('=')) {
      const t = raw.trim()
      if (t === '') return 0
      const n = Number(t)
      return Number.isFinite(n) ? n : 0
    }
    const c = this.computed[addr]
    if (!c || c.kind === 'err') return 0
    return c.value
  }

  displayText(address: string): string {
    const raw = this.cells[address] ?? ''
    if (!raw.startsWith('=')) {
      return raw
    }
    const c = this.computed[address]
    if (!c) return ''
    if (c.kind === 'err') return c.message
    return formatDisplayNumber(c.value)
  }

  isFormula(address: string): boolean {
    return (this.cells[address] ?? '').startsWith('=')
  }

  recalc(): void {
    const prevComputed = this.computed
    const formulaCells = ALL_ADDRESSES.filter((a) => (this.cells[a] ?? '').startsWith('='))
    const getBodyFn = (addr: string) => formulaBody(this.cells[addr] ?? '')

    const nextComputed: Record<string, { kind: 'num'; value: number } | { kind: 'err'; message: string }> = {}

    const order = topologicalFormulaOrder(formulaCells, getBodyFn)
    if (order === null) {
      for (const addr of formulaCells) {
        const next = { kind: 'err', message: '#CIRC!' } as const
        nextComputed[addr] = sameComputedCell(prevComputed[addr], next) ? prevComputed[addr]! : next
      }
    } else {
      for (const addr of order) {
        const body = getBodyFn(addr)
        const res = evaluateFormula(body, (a) => {
          const n = this.getNumericForEvalWith(nextComputed, a)
          return n
        })
        if (res.ok === false) {
          const next = { kind: 'err', message: res.error } as const
          nextComputed[addr] = sameComputedCell(prevComputed[addr], next) ? prevComputed[addr]! : next
        } else {
          const next = { kind: 'num', value: res.value } as const
          nextComputed[addr] = sameComputedCell(prevComputed[addr], next) ? prevComputed[addr]! : next
        }
      }
    }

    for (const key of Object.keys(prevComputed)) {
      if (!(key in nextComputed)) delete this.computed[key]
    }
    for (const [key, value] of Object.entries(nextComputed)) {
      if (prevComputed[key] !== value) this.computed[key] = value
    }
  }

  private getNumericForEvalWith(
    partial: Record<string, { kind: 'num'; value: number } | { kind: 'err'; message: string }>,
    addr: string,
  ): number {
    const raw = this.cells[addr] ?? ''
    if (!raw.startsWith('=')) {
      const t = raw.trim()
      if (t === '') return 0
      const n = Number(t)
      return Number.isFinite(n) ? n : 0
    }
    const c = partial[addr]
    if (!c || c.kind === 'err') return 0
    return c.value
  }
}

export function formatDisplayNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const s = n.toPrecision(12)
  return String(Number.parseFloat(s))
}

export default new SheetStore()
