/**
 * reactiveBool — toggles boolean attribute or style.display.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveBool } from '../../src/runtime/reactive-bool'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('reactiveBool – attr mode', () => {
  it('toggles a boolean attribute on/off', async () => {
    const s = new Store({ disabled: false }) as any
    const btn = document.createElement('button')
    const d = createDisposer()
    reactiveBool(btn, d, s, 'disabled', ['disabled'])
    await flush()
    assert.equal(btn.hasAttribute('disabled'), false)
    s.disabled = true
    await flush()
    assert.equal(btn.hasAttribute('disabled'), true)
    s.disabled = false
    await flush()
    assert.equal(btn.hasAttribute('disabled'), false)
  })
  it('dispose halts toggles', async () => {
    const s = new Store({ disabled: false }) as any
    const btn = document.createElement('button')
    const d = createDisposer()
    reactiveBool(btn, d, s, 'disabled', ['disabled'])
    await flush()
    d.dispose()
    s.disabled = true
    await flush()
    assert.equal(btn.hasAttribute('disabled'), false)
  })
  it('keeps tracking compiler-eagered flight-style short-circuit getters', async () => {
    const s = new Store({ name: '', card: '', expiry: '' }) as any
    const btn = document.createElement('button')
    const d = createDisposer()
    const valid = () => {
      void s.card
      void s.expiry
      return s.name.trim().length >= 2 && s.card.replace(/\D/g, '').length === 16 && /^\d{2}\/\d{2}$/.test(s.expiry)
    }
    const disabled = () => !valid()

    reactiveBool(btn, d, s, 'disabled', disabled)
    await flush()

    s.name = 'Jane Smith'
    await flush()
    for (const digit of '4242424242424242') {
      s.card += digit
      await flush()
    }
    s.expiry = '12/22'
    await flush()

    assert.equal(btn.hasAttribute('disabled'), false)
  })
  it('keeps tracking compiler-eagered short-circuit getters after the effect locks', async () => {
    const s = new Store({ gate: '', detail: '' }) as any
    const btn = document.createElement('button')
    const d = createDisposer()
    const disabled = () => {
      void s.detail
      return !(s.gate.length >= 3 && s.detail === 'ok')
    }

    reactiveBool(btn, d, s, 'disabled', disabled)
    await flush()

    s.gate = 'a'
    await flush()
    s.gate = 'ab'
    await flush()
    s.gate = 'abc'
    await flush()
    s.detail = 'ok'
    await flush()

    assert.equal(btn.hasAttribute('disabled'), false)
  })
})

describe('reactiveBool – visible mode', () => {
  it('toggles style.display between "" and "none"', async () => {
    const s = new Store({ show: true }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveBool(el, d, s, '', ['show'], 'visible')
    await flush()
    assert.equal(el.style.display, '')
    s.show = false
    await flush()
    assert.equal(el.style.display, 'none')
    s.show = true
    await flush()
    assert.equal(el.style.display, '')
  })
  it('getter mode — tracks deps and re-evaluates', async () => {
    const s = new Store({ a: 1, b: 2 }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveBool(el, d, s, '', () => s.a > s.b, 'visible')
    assert.equal(el.style.display, 'none')
    s.a = 5
    await flush()
    assert.equal(el.style.display, '')
  })
})
