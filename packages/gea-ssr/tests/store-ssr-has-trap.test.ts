import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveOverlay, runInSSRContext, getSignalFields, hasSignalFields } from '../src/ssr-context.ts'
import { SSR_DELETED } from '../src/ssr-proxy-handler.ts'
import { signal } from '../../gea/src/signals/index.ts'

/** Helper to create a signal-based store. */
function createSignalStore(fields: Record<string, unknown>) {
  const store: any = {}
  for (const [name, value] of Object.entries(fields)) {
    const sym = Symbol.for(`gea.field.${name}`)
    store[sym] = signal(value)
    Object.defineProperty(store, name, {
      get() { return store[sym].peek() },
      set(v: unknown) { store[sym].value = v },
      enumerable: true,
      configurable: true,
    })
  }
  return store
}

describe('Signal field enumeration', () => {
  it('getSignalFields returns all compiled signal fields', () => {
    const store = createSignalStore({ name: 'Alice', count: 0 })
    const fields = getSignalFields(store)
    assert.equal(fields.size, 2)
    assert.ok(fields.has('name'))
    assert.ok(fields.has('count'))
    assert.equal(fields.get('name').peek(), 'Alice')
    assert.equal(fields.get('count').peek(), 0)
  })

  it('hasSignalFields returns true for signal-based stores', () => {
    const store = createSignalStore({ x: 1 })
    assert.ok(hasSignalFields(store))
  })

  it('hasSignalFields returns false for plain objects', () => {
    assert.ok(!hasSignalFields({ x: 1 }))
  })
})

describe('SSR overlay operations on plain-object stores', () => {
  it('tombstoned entries are marked with SSR_DELETED in overlay', () => {
    const store = { name: 'Alice' }
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)!
      overlay.name = SSR_DELETED as any
      assert.equal(overlay.name, SSR_DELETED)
    })
  })

  it('overlay-set properties are visible in overlay', () => {
    const store = {} as Record<string, unknown>
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)!
      overlay.name = 'Bob'
      assert.equal(overlay.name, 'Bob')
    })
  })

  it('overlay starts with cloned store data', () => {
    const store = { count: 0 }
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)!
      assert.equal(overlay.count, 0)
    })
  })

  it('missing properties return undefined from overlay', () => {
    const store = {} as Record<string, unknown>
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)!
      assert.equal(overlay.missing, undefined)
    })
  })
})
