/**
 * reactiveStyle — diffs a style object and applies minimal set/removeProperty.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveStyle } from '../../src/runtime/reactive-style'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('reactiveStyle – static path', () => {
  it('applies initial style object', async () => {
    const s = new Store({ st: { color: 'red', fontSize: '12px' } as Record<string, string> }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    assert.equal(el.style.color, 'red')
    assert.equal(el.style.getPropertyValue('font-size'), '12px')
  })
  it('adds new keys and removes missing ones on update', async () => {
    const s = new Store({ st: { color: 'red', margin: '4px' } as Record<string, string> }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    s.st = { color: 'blue', padding: '8px' }
    await flush()
    assert.equal(el.style.color, 'blue')
    assert.equal(el.style.padding, '8px')
    assert.equal(el.style.margin, '')
  })
  it('dispose halts updates', async () => {
    const s = new Store({ st: { color: 'red' } as Record<string, string> }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    d.dispose()
    s.st = { color: 'green' }
    await flush()
    assert.equal(el.style.color, 'red')
  })
})

describe('reactiveStyle – getter mode', () => {
  it('reacts via tracked deps', async () => {
    const s = new Store({ c: 'red', sz: 10 }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, () => ({ color: s.c, fontSize: s.sz + 'px' }))
    assert.equal(el.style.color, 'red')
    assert.equal(el.style.getPropertyValue('font-size'), '10px')
    s.sz = 20
    await flush()
    assert.equal(el.style.getPropertyValue('font-size'), '20px')
  })
})
