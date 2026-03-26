import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { snapshotStores, restoreStores } from '../src/store-isolation.ts'
import type { GeaStore } from '../src/types.ts'

describe('store isolation', () => {
  it('snapshots and restores primitive values', () => {
    const store = { count: 0, name: 'original' }
    const snapshot = snapshotStores([store])
    store.count = 42
    store.name = 'modified'
    restoreStores(snapshot)
    assert.equal(store.count, 0)
    assert.equal(store.name, 'original')
  })

  it('snapshots and restores arrays', () => {
    const store = { items: [1, 2, 3] }
    const snapshot = snapshotStores([store])
    store.items.push(4)
    restoreStores(snapshot)
    assert.deepEqual(store.items, [1, 2, 3])
  })

  it('snapshots and restores nested objects', () => {
    const store = { user: { name: 'Alice', age: 30 } }
    const snapshot = snapshotStores([store])
    store.user.name = 'Bob'
    restoreStores(snapshot)
    assert.equal(store.user.name, 'Alice')
  })

  it('handles multiple stores', () => {
    const a = { x: 1 }
    const b = { y: 2 }
    const snapshot = snapshotStores([a, b])
    a.x = 10
    b.y = 20
    restoreStores(snapshot)
    assert.equal(a.x, 1)
    assert.equal(b.y, 2)
  })

  it('does not snapshot functions', () => {
    const store = { count: 0, increment() { this.count++ } }
    const snapshot = snapshotStores([store])
    store.count = 5
    restoreStores(snapshot)
    assert.equal(store.count, 0)
    assert.equal(typeof store.increment, 'function')
  })

  it('removes keys added after snapshot was taken', () => {
    const store: GeaStore = { count: 0 }
    const snapshot = snapshotStores([store])
    store.requestData = 'should be removed'
    restoreStores(snapshot)
    assert.equal('requestData' in store, false, 'request-added key must be deleted')
    assert.equal(store.count, 0)
  })

  it('preserves methods and getters while removing request-added data on class instances', () => {
    class TestStore {
      count = 0
      increment() { this.count++ }
    }
    const store: GeaStore = new TestStore()
    const snapshot = snapshotStores([store])
    store.requestData = 'temp'
    store.count = 99
    restoreStores(snapshot)
    assert.equal('requestData' in store, false, 'request-added key must be deleted')
    assert.equal(store.count, 0, 'data should be restored')
    assert.equal(typeof store.increment, 'function', 'methods must be preserved')
  })

  it('snapshots and restores Date values as Dates', () => {
    const date = new Date('2026-01-01T00:00:00Z')
    const store: GeaStore = { created: date }
    const snapshot = snapshotStores([store])
    store.created = new Date('2099-01-01')
    restoreStores(snapshot)
    assert.ok(store.created instanceof Date, 'restored value should be a Date instance')
    assert.equal((store.created as Date).getTime(), date.getTime())
  })

  it('logs warning for unserializable properties instead of silently dropping', () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])) }
    try {
      const store: GeaStore = {
        name: 'test',
        socket: new (class WebSocket { url = 'ws://x' })(),
      }
      const snapshot = snapshotStores([store])
      // Should still snapshot the valid properties
      assert.equal(snapshot[0][1].name, 'test')
      // Should have logged a warning about the unserializable property
      assert.ok(
        warnings.some(w => w.includes('socket') && w.includes('SSR')),
        `Expected warning about "socket", got: ${JSON.stringify(warnings)}`,
      )
    } finally {
      console.warn = originalWarn
    }
  })

  it('skips internal props (underscore prefix/suffix)', () => {
    const store: GeaStore = { _private: 'a', public_: 'b', visible: 'c' }
    const snapshot = snapshotStores([store])
    store._private = 'modified'
    store.public_ = 'modified'
    store.visible = 'modified'
    restoreStores(snapshot)
    assert.equal(store.visible, 'c', 'public prop should be restored')
    assert.equal(store._private, 'modified', '_prefixed prop must NOT be snapshot/restored')
    assert.equal(store.public_, 'modified', '_suffixed prop must NOT be snapshot/restored')
  })
})
