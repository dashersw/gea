import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '@geajs/core'
import { createSSRRootProxyHandler, SSR_DELETED } from '../src/ssr-proxy-handler.ts'
import { resolveOverlay, runInSSRContext } from '../src/ssr-context.ts'

function getRaw(store: object): object {
  const r = Reflect.get(store, '__getRawTarget')
  return typeof r === 'object' && r !== null ? r : store
}

describe('Store SSR Proxy has trap', () => {
  beforeEach(() => {
    Store._rootProxyHandlerFactory = createSSRRootProxyHandler
  })

  afterEach(() => {
    Store._rootProxyHandlerFactory = null
  })

  it('returns false for tombstoned properties via "in" operator', () => {
    const store = new Store({ name: 'Alice' })
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(getRaw(store))!
      Object.assign(overlay, { name: SSR_DELETED })
      assert.equal('name' in store, false)
    })
  })

  it('returns true for overlay-set properties via "in" operator', () => {
    const store = new Store()
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(getRaw(store))!
      overlay.name = 'Bob'
      assert.equal('name' in store, true)
    })
  })

  it('falls through to target for properties not in overlay', () => {
    const store = new Store({ count: 0 })
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(getRaw(store))!
      for (const k of Object.keys(overlay)) delete overlay[k]
      assert.equal('count' in store, true)
    })
  })

  it('returns false for non-existent properties not in overlay', () => {
    const store = new Store()
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(getRaw(store))!
      for (const k of Object.keys(overlay)) delete overlay[k]
      assert.equal('missing' in store, false)
    })
  })
})
