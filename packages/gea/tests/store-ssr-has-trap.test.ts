import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../src/lib/store'

function setupSSROverlay(store: InstanceType<typeof Store>, overlay: Record<string, unknown>) {
  const raw = (store as Record<string, unknown>).__getRawTarget as object
  Store._ssrOverlayResolver = (target: object) => {
    if (target === raw) return overlay
    return undefined
  }
}

describe('Store SSR Proxy has trap', () => {
  afterEach(() => {
    Store._ssrOverlayResolver = null
  })

  it('returns false for tombstoned properties via "in" operator', () => {
    const store = new Store({ name: 'Alice' })
    setupSSROverlay(store, { name: Store._ssrDeleted })

    assert.equal('name' in store, false)
  })

  it('returns true for overlay-set properties via "in" operator', () => {
    const store = new Store()
    setupSSROverlay(store, { name: 'Bob' })

    assert.equal('name' in store, true)
  })

  it('falls through to target for properties not in overlay', () => {
    const store = new Store({ count: 0 })
    setupSSROverlay(store, {})

    assert.equal('count' in store, true)
  })

  it('returns false for non-existent properties not in overlay', () => {
    const store = new Store()
    setupSSROverlay(store, {})

    assert.equal('missing' in store, false)
  })
})
