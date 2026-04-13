/**
 * reactiveClass — reconciles classList against string/array/object values.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveClass } from '../../src/runtime/reactive-class'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const sortedClasses = (el: Element): string[] => Array.from(el.classList).sort()

describe('reactiveClass – string value', () => {
  it('preserves an empty class attribute for initially empty bindings', () => {
    const s = new Store({ cls: '' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveClass(el, d, s, ['cls'])
    assert.equal(el.getAttribute('class'), '')
  })

  it('adds an initial single-token class', () => {
    const s = new Store({ cls: 'active' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveClass(el, d, s, ['cls'])
    assert.deepEqual(sortedClasses(el), ['active'])
  })

  it('adds initial classes and updates on change', async () => {
    const s = new Store({ cls: 'a b' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveClass(el, d, s, ['cls'])
    await flush()
    assert.deepEqual(sortedClasses(el), ['a', 'b'])
    s.cls = 'b c'
    await flush()
    assert.deepEqual(sortedClasses(el), ['b', 'c'])
  })
})

describe('reactiveClass – array value', () => {
  it('adds classes from array and diffs on change', async () => {
    const s = new Store<{ cls: string[] }>({ cls: ['x', 'y'] }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveClass(el, d, s, ['cls'])
    await flush()
    assert.deepEqual(sortedClasses(el), ['x', 'y'])
    s.cls = ['y', 'z']
    await flush()
    assert.deepEqual(sortedClasses(el), ['y', 'z'])
  })
})

describe('reactiveClass – object value', () => {
  it('adds truthy keys, removes falsy ones', async () => {
    const s = new Store({ cls: { a: true, b: false, c: true } as Record<string, boolean> }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveClass(el, d, s, ['cls'])
    await flush()
    assert.deepEqual(sortedClasses(el), ['a', 'c'])
    s.cls = { a: false, b: true, c: true }
    await flush()
    assert.deepEqual(sortedClasses(el), ['b', 'c'])
  })
  it('dispose halts updates', async () => {
    const s = new Store({ cls: 'a' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveClass(el, d, s, ['cls'])
    await flush()
    d.dispose()
    s.cls = 'z'
    await flush()
    assert.deepEqual(sortedClasses(el), ['a'])
  })
})

describe('reactiveClass – getter mode', () => {
  it('tracks deps through getter', async () => {
    const s = new Store({ active: false, primary: true }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveClass(el, d, s, () => ({ active: s.active, primary: s.primary }))
    assert.deepEqual(sortedClasses(el), ['primary'])
    s.active = true
    await flush()
    assert.deepEqual(sortedClasses(el), ['active', 'primary'])
  })
})
