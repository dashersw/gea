import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { serializeStores } from '../src/serialize.ts'
import { GEA_PROXY_GET_RAW_TARGET, Store } from '@geajs/core'
import { GEA_ROOT_PROXY_HANDLER_FACTORY } from '@geajs/core/ssr'
import { createSSRRootProxyHandler, SSR_DELETED } from '../src/ssr-proxy-handler.ts'
import { resolveOverlay, runInSSRContext } from '../src/ssr-context.ts'

function getRaw(store: object): object {
  const r = Reflect.get(store, GEA_PROXY_GET_RAW_TARGET)
  return typeof r === 'object' && r !== null ? r : store
}

describe('serializeStores – SSR overlay awareness', () => {
  beforeEach(() => {
    Store[GEA_ROOT_PROXY_HANDLER_FACTORY] = createSSRRootProxyHandler
  })

  afterEach(() => {
    Store[GEA_ROOT_PROXY_HANDLER_FACTORY] = null
  })

  it('serializes overlay values, not underlying store values', () => {
    const store = new Store({ count: 0, name: 'shared' })
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(getRaw(store))!
      Object.assign(overlay, { count: 42, name: 'request-local' })

      const result = serializeStores([store], { TestStore: store })
      const parsed = new Function('return ' + result)()

      assert.equal(parsed.TestStore.count, 42, 'Must serialize overlay value, not shared store value')
      assert.equal(parsed.TestStore.name, 'request-local', 'Must serialize overlay value')
    })
  })

  it('serializes overlay additions not present on underlying store', () => {
    const store = new Store({ base: 'yes' })
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(getRaw(store))!
      Object.assign(overlay, { base: 'yes', added: 'new-prop' })

      const result = serializeStores([store], { S: store })
      const parsed = new Function('return ' + result)()

      assert.equal(parsed.S.added, 'new-prop', 'Must serialize properties added in overlay')
    })
  })

  it('does not serialize tombstoned (deleted) properties', () => {
    const store = new Store({ keep: 'yes', remove: 'no' })
    runInSSRContext([store], () => {
      const overlay = resolveOverlay(getRaw(store))!
      overlay.remove = SSR_DELETED

      const result = serializeStores([store], { S: store })
      const parsed = new Function('return ' + result)()

      assert.equal(parsed.S.keep, 'yes')
      assert.equal(parsed.S.remove, undefined, 'Tombstoned property must not be serialized')
    })
  })
})
