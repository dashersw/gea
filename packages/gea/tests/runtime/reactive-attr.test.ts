/**
 * reactiveAttr — binds an element attribute to a store path or getter.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveAttr } from '../../src/runtime/reactive-attr'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('reactiveAttr – static path', () => {
  it('sets attribute from initial store value', async () => {
    const s = new Store({ href: '/a' }) as any
    const a = document.createElement('a')
    const d = createDisposer()
    reactiveAttr(a, d, s, 'href', ['href'])
    await flush()
    assert.equal(a.getAttribute('href'), '/a')
  })
  it('updates attribute on store change', async () => {
    const s = new Store({ title: 'hi' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveAttr(el, d, s, 'title', ['title'])
    await flush()
    s.title = 'bye'
    await flush()
    assert.equal(el.getAttribute('title'), 'bye')
  })
  it('removes attribute when value is null', async () => {
    const s = new Store<{ title: string | null }>({ title: 'hi' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveAttr(el, d, s, 'title', ['title'])
    await flush()
    s.title = null
    await flush()
    assert.equal(el.hasAttribute('title'), false)
  })
  it('dispose halts updates', async () => {
    const s = new Store({ title: 'a' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveAttr(el, d, s, 'title', ['title'])
    await flush()
    d.dispose()
    s.title = 'b'
    await flush()
    assert.equal(el.getAttribute('title'), 'a')
  })
})

describe('reactiveAttr – getter mode', () => {
  it('reacts to any tracked dep in getter', async () => {
    const s = new Store({ base: 'u', id: 1 }) as any
    const el = document.createElement('a')
    const d = createDisposer()
    reactiveAttr(el, d, s, 'href', () => `/${s.base}/${s.id}`)
    assert.equal(el.getAttribute('href'), '/u/1')
    s.id = 2
    await flush()
    assert.equal(el.getAttribute('href'), '/u/2')
  })
})
