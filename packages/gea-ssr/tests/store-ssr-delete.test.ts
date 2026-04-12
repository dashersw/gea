import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runInSSRContext, resolveOverlay } from '../src/ssr-context.ts'
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

describe('Store SSR overlay – delete / tombstone (plain objects)', () => {
  it('overlay can mark a property as deleted via SSR_DELETED sentinel', () => {
    const store = { name: 'shared', count: 42 }
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)!
      assert.equal(overlay.name, 'shared')

      overlay.name = SSR_DELETED as any
      assert.equal(overlay.name, SSR_DELETED, 'Overlay should hold the tombstone')
    })
  })

  it('tombstoned property can be revived with a new value in overlay', () => {
    const store = { name: 'original' }
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)!
      overlay.name = SSR_DELETED as any
      assert.equal(overlay.name, SSR_DELETED)

      overlay.name = 'revived'
      assert.equal(overlay.name, 'revived')
    })
  })

  it('overlay operations do not affect the underlying store', () => {
    const store = { count: 99 }
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)!
      overlay.count = 0
      assert.equal(store.count, 99, 'Underlying store must not be affected by overlay writes')
    })
  })
})

describe('Store SSR overlay – signal-based stores', () => {
  it('signal values are isolated in SSR context', () => {
    const store = createSignalStore({ name: 'shared' })

    runInSSRContext([store], () => {
      assert.equal(store.name, 'shared', 'Should start with cloned value')
      store.name = 'modified'
      assert.equal(store.name, 'modified', 'Signal write should work within SSR context')
    })

    assert.equal(store.name, 'shared', 'Original signal must be restored after SSR context')
  })

  it('setting signal to undefined effectively "deletes" the value in SSR context', () => {
    const store = createSignalStore({ count: 42 })

    runInSSRContext([store], () => {
      store.count = undefined
      assert.equal(store.count, undefined, 'Signal value should be undefined within SSR')
    })

    assert.equal(store.count, 42, 'Original value must be restored')
  })
})
