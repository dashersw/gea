import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { Store } from '@geajs/core'
import { createSSRRootProxyHandler } from '../src/ssr-proxy-handler.ts'
import { runInSSRContext } from '../src/ssr-context.ts'

describe('Store SSR overlay – delete tombstone', () => {
  beforeEach(() => {
    Store._rootProxyHandlerFactory = createSSRRootProxyHandler
  })

  afterEach(() => {
    Store._rootProxyHandlerFactory = null
  })

  it('deleting a property in SSR overlay returns undefined on read, not the underlying value', () => {
    const store = new Store({ name: 'shared', count: 42 })
    runInSSRContext([store], () => {
      assert.equal(store.name, 'shared')
      assert.equal(store.count, 42)

      delete (store as Record<string, unknown>).name

      assert.equal(store.name, undefined, 'Deleted SSR property must be undefined, not fall through to shared store')
    })
  })

  it('deleted property does not appear in Object.keys', () => {
    const store = new Store({ a: 1, b: 2, c: 3 })
    runInSSRContext([store], () => {
      delete (store as Record<string, unknown>).b

      const keys = Object.keys(store)
      assert.ok(!keys.includes('b'), 'Deleted property must not appear in Object.keys')
      assert.ok(keys.includes('a'))
      assert.ok(keys.includes('c'))
    })
  })

  it('deleted property returns undefined via getOwnPropertyDescriptor', () => {
    const store = new Store({ x: 10 })
    runInSSRContext([store], () => {
      delete (store as Record<string, unknown>).x

      const desc = Object.getOwnPropertyDescriptor(store, 'x')
      assert.equal(desc, undefined, 'getOwnPropertyDescriptor must return undefined for tombstoned property')
    })
  })

  it('can set a new value after deleting in SSR overlay', () => {
    const store = new Store({ name: 'original' })
    runInSSRContext([store], () => {
      delete (store as Record<string, unknown>).name
      assert.equal(store.name, undefined)

      store.name = 'revived'
      assert.equal(store.name, 'revived')
    })
  })

  it('delete in SSR overlay does not affect the underlying store', () => {
    const store = new Store({ count: 99 })
    const raw = (store as Record<string, unknown>).__getRawTarget as Record<string, unknown>
    runInSSRContext([store], () => {
      delete (store as Record<string, unknown>).count

      assert.equal(raw.count, 99, 'Underlying store must not be affected by SSR delete')
    })
  })
})
