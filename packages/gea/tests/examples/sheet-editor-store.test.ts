import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { SheetStore } from '../../../../examples/sheet-editor/sheet-store'
import { effect } from '../../src/signals/index'

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

    const beforeB1 = s.computed.B1
    const beforeC1 = s.computed.C1

    s.setCellRaw('A1', '2')

    assert.notEqual(s.computed.B1, beforeB1, 'dependent formula should get a new computed entry')
    assert.equal(s.computed.C1, beforeC1, 'unrelated formula should keep the same computed entry object')
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

  it('recalc with no formulas should not trigger computed observer', () => {
    let computedObserverCalls = -1 // first effect run doesn't count
    effect(() => {
      void s.computed
      computedObserverCalls++
    })

    s.setCellRaw('A1', 'hello')

    assert.equal(
      computedObserverCalls,
      0,
      `computed observer fired ${computedObserverCalls} time(s) even though there are no formula cells — recalc() should not reassign this.computed`,
    )
  })

  it('recalc after non-formula edit should not trigger computed observer', () => {
    s.setCellRaw('A1', '10')
    s.setCellRaw('B1', '=A1*2')

    let computedObserverCalls = -1 // first effect run doesn't count
    effect(() => {
      void s.computed
      computedObserverCalls++
    })

    s.setCellRaw('C1', '42')

    assert.equal(
      computedObserverCalls,
      0,
      `computed observer fired ${computedObserverCalls} time(s) even though no formula results changed — recalc() should not reassign this.computed when formula values are identical`,
    )
  })
})
