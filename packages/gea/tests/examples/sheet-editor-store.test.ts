import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { GEA_PROXY_GET_TARGET } from '../../src/lib/symbols'
import { SheetStore } from '../../../../examples/sheet-editor/sheet-store'

describe('examples/sheet-editor SheetStore', () => {
  let s: SheetStore

  beforeEach(() => {
    s = new SheetStore()
  })

  it('recalc simple formula', () => {
    s.setCellRaw('A1', '10')
    s.setCellRaw('B1', '=A1*2')
    assert.equal(s.displayText('B1'), '20')
  })

  it('recalc chain', () => {
    s.setCellRaw('A1', '5')
    s.setCellRaw('B1', '=A1+1')
    s.setCellRaw('C1', '=B1*2')
    assert.equal(s.displayText('C1'), '12')
  })

  it('SUM range', () => {
    s.setCellRaw('A1', '1')
    s.setCellRaw('A2', '2')
    s.setCellRaw('A3', '3')
    s.setCellRaw('A4', '=SUM(A1:A3)')
    assert.equal(s.displayText('A4'), '6')
  })

  it('circular reference shows #CIRC!', () => {
    s.setCellRaw('A1', '=B1')
    s.setCellRaw('B1', '=A1')
    assert.equal(s.displayText('A1'), '#CIRC!')
    assert.equal(s.displayText('B1'), '#CIRC!')
  })

  it('reuses unchanged computed entries when unrelated cells change', () => {
    s.setCellRaw('A1', '1')
    s.setCellRaw('B1', '=A1+1')
    s.setCellRaw('C1', '=10')

    const beforeB1 = s.computed.B1[GEA_PROXY_GET_TARGET]
    const beforeC1 = s.computed.C1[GEA_PROXY_GET_TARGET]

    s.setCellRaw('A1', '2')

    assert.notEqual(s.computed.B1[GEA_PROXY_GET_TARGET], beforeB1, 'dependent formula should get a new computed entry')
    assert.equal(s.computed.C1[GEA_PROXY_GET_TARGET], beforeC1, 'unrelated formula should keep the same computed entry object')
    assert.equal(s.displayText('B1'), '3')
    assert.equal(s.displayText('C1'), '10')
  })

  it('barDraft syncs when setCellRaw on active cell', () => {
    s.select('A1')
    s.setCellRaw('A1', 'hello')
    assert.equal(s.barDraft, 'hello')
  })

  it('moveSelection moves active cell and clamps to grid', () => {
    s.select('A1')
    s.moveSelection(1, 0)
    assert.equal(s.activeAddress, 'B1')
    s.moveSelection(0, 1)
    assert.equal(s.activeAddress, 'B2')
    s.moveSelection(-1, 0)
    assert.equal(s.activeAddress, 'A2')
  })

  it('moveSelection no-ops at grid edge', () => {
    s.select('A1')
    s.moveSelection(-1, 0)
    assert.equal(s.activeAddress, 'A1')
    s.select('J1')
    s.moveSelection(1, 0)
    assert.equal(s.activeAddress, 'J1')
    s.select('A20')
    s.moveSelection(0, 1)
    assert.equal(s.activeAddress, 'A20')
  })

  it('recalc with no formulas should not trigger computed observer', async () => {
    let computedObserverCalls = 0
    s.observe('computed', () => {
      computedObserverCalls++
    })

    s.setCellRaw('A1', 'hello')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    assert.equal(
      computedObserverCalls,
      0,
      `computed observer fired ${computedObserverCalls} time(s) even though there are no formula cells — recalc() should not reassign this.computed`,
    )
  })

  it('recalc after non-formula edit should not trigger computed observer', async () => {
    s.setCellRaw('A1', '10')
    s.setCellRaw('B1', '=A1*2')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    let computedObserverCalls = 0
    s.observe('computed', () => {
      computedObserverCalls++
    })

    s.setCellRaw('C1', '42')
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    assert.equal(
      computedObserverCalls,
      0,
      `computed observer fired ${computedObserverCalls} time(s) even though no formula results changed — recalc() should not reassign this.computed when formula values are identical`,
    )
  })
})
