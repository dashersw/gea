/**
 * reactiveText — binds Text node content to a store path or getter.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveText } from '../../src/runtime/reactive-text'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('reactiveText – static path', () => {
  it('initial render patches text from store', async () => {
    const s = new Store({ name: 'alice' }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, ['name'])
    await flush()
    assert.equal(node.nodeValue, 'alice')
  })
  it('updates text after store mutation', async () => {
    const s = new Store({ name: 'alice' }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, ['name'])
    await flush()
    s.name = 'bob'
    await flush()
    assert.equal(node.nodeValue, 'bob')
  })
  it('dispose removes subscription — further mutations ignored', async () => {
    const s = new Store({ name: 'alice' }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, ['name'])
    await flush()
    s.name = 'bob'
    await flush()
    d.dispose()
    s.name = 'carol'
    await flush()
    assert.equal(node.nodeValue, 'bob')
  })
})

describe('reactiveText – getter mode', () => {
  it('tracks getter deps and updates on change', async () => {
    const s = new Store({ first: 'jane', last: 'doe' }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, () => s.first + ' ' + s.last)
    assert.equal(node.nodeValue, 'jane doe')
    s.last = 'roe'
    await flush()
    assert.equal(node.nodeValue, 'jane roe')
  })
  it('dispose halts getter re-runs', async () => {
    const s = new Store({ v: 1 }) as any
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, () => String(s.v))
    s.v = 2
    await flush()
    assert.equal(node.nodeValue, '2')
    d.dispose()
    s.v = 3
    await flush()
    assert.equal(node.nodeValue, '2')
  })
})
