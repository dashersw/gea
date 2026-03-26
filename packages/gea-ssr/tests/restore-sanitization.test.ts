import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { restoreStoreState } from '../src/client.ts'

let dom: JSDOM
let previous: Record<string, unknown>

function setupDOM() {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  previous = {
    window: globalThis.window,
    document: globalThis.document,
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  })
}

function teardownDOM() {
  Object.assign(globalThis, previous)
  dom?.window?.close()
}

describe('restoreStoreState key sanitization', () => {
  beforeEach(() => {
    setupDOM()
  })

  afterEach(() => {
    teardownDOM()
  })

  it('skips internal props starting with underscore', () => {
    window.__GEA_STATE__ = {
      MyStore: {
        _observerRoot: 'injected',
        name: 'Alice',
      },
    }

    const store: Record<string, unknown> = { _observerRoot: 'original', name: '' }
    restoreStoreState({ MyStore: store })

    assert.equal(store._observerRoot, 'original', '_observerRoot must not be overwritten')
    assert.equal(store.name, 'Alice', 'name must be restored')
  })

  it('skips internal props ending with underscore', () => {
    window.__GEA_STATE__ = {
      MyStore: {
        _selfProxy_: 'injected',
        count: 7,
      },
    }

    const store: Record<string, unknown> = { _selfProxy_: 'original', count: 0 }
    restoreStoreState({ MyStore: store })

    assert.equal(store._selfProxy_, 'original', '_selfProxy_ must not be overwritten')
    assert.equal(store.count, 7, 'count must be restored')
  })

  it('skips the constructor key', () => {
    window.__GEA_STATE__ = {
      MyStore: {
        constructor: 'injected',
        items: ['a', 'b'],
      },
    }

    const store: Record<string, unknown> = { items: [] }
    restoreStoreState({ MyStore: store })

    assert.notEqual(store.constructor, 'injected', 'constructor must not be overwritten')
    assert.deepEqual(store.items, ['a', 'b'], 'items must be restored')
  })

  it('skips the __proto__ key', () => {
    // Use JSON.parse to faithfully reproduce the attack vector:
    // JSON.parse creates __proto__ as an own string key, unlike object literals
    // which set the prototype instead
    window.__GEA_STATE__ = {
      MyStore: JSON.parse('{"__proto__":{"polluted":true},"count":3}'),
    }

    const store: Record<string, unknown> = { count: 0 }
    restoreStoreState({ MyStore: store })

    // Prototype must not be polluted
    assert.equal(store.polluted, undefined, '__proto__ must not pollute the store prototype')
    assert.equal(store.count, 3, 'count must be restored')
  })

  it('restores normal data keys correctly', () => {
    window.__GEA_STATE__ = {
      AppStore: {
        name: 'Bob',
        count: 42,
        items: ['x', 'y', 'z'],
      },
    }

    const store: Record<string, unknown> = { name: '', count: 0, items: [] }
    restoreStoreState({ AppStore: store })

    assert.equal(store.name, 'Bob')
    assert.equal(store.count, 42)
    assert.deepEqual(store.items, ['x', 'y', 'z'])
  })

  it('skips multiple internal keys in a single serialized store', () => {
    window.__GEA_STATE__ = {
      BigStore: JSON.parse('{"_observerRoot":"bad1","_selfProxy_":"bad2","constructor":"bad3","__proto__":{"polluted":true},"title":"safe","value":99}'),
    }

    const store: Record<string, unknown> = {
      _observerRoot: 'orig1',
      _selfProxy_: 'orig2',
      title: '',
      value: 0,
    }
    restoreStoreState({ BigStore: store })

    assert.equal(store._observerRoot, 'orig1', '_observerRoot must not be overwritten')
    assert.equal(store._selfProxy_, 'orig2', '_selfProxy_ must not be overwritten')
    assert.notEqual(store.constructor, 'bad3', 'constructor must not be overwritten')
    assert.equal(store.polluted, undefined, 'prototype must not be polluted')
    assert.equal(store.title, 'safe', 'title must be restored')
    assert.equal(store.value, 99, 'value must be restored')
  })
})
