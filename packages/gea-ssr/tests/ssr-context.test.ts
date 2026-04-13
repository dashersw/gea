import { Component, GEA_CREATE_TEMPLATE, GEA_PROXY_GET_RAW_TARGET } from '@geajs/core'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../src/handle-request.ts'
import { resolveOverlay, runInSSRContext } from '../src/ssr-context.ts'
import type { GeaStore } from '../src/types.ts'
import { Store } from '../../gea/src/store.ts'

const mockIndexHtml = '<!DOCTYPE html><html><body><div id="app"></div></body></html>'

// A real Store instance — SSR overlay only works on Store Proxy instances
class TestStore extends Store {
  user = 'default'
  count = 0
}
const sharedStore: GeaStore = new TestStore()

class StoreReadingApp extends Component {
  [GEA_CREATE_TEMPLATE](): Node {
    const div = document.createElement('div')
    div.setAttribute('data-user', String(sharedStore.user))
    div.setAttribute('data-count', String(sharedStore.count))
    return div
  }
}

async function readResponse(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value)
  }
  return result
}

describe('SSR context isolation', () => {
  it('concurrent requests get isolated store state', async () => {
    // Reset store to known state
    sharedStore.user = 'default'
    sharedStore.count = 0

    const handler = handleRequest(StoreReadingApp, {
      indexHtml: mockIndexHtml,
      storeRegistry: { TestStore: sharedStore },
      async onBeforeRender(ctx) {
        // Each request mutates the store differently based on route
        const route = ctx.route
        if (route === '/alice') {
          sharedStore.user = 'Alice'
          sharedStore.count = 1
          // Simulate async work to increase overlap window
          await new Promise((r) => setTimeout(r, 20))
        } else if (route === '/bob') {
          sharedStore.user = 'Bob'
          sharedStore.count = 2
          await new Promise((r) => setTimeout(r, 20))
        }
      },
    })

    // Fire both requests concurrently
    const [aliceResponse, bobResponse] = await Promise.all([
      handler(new Request('http://localhost/alice')),
      handler(new Request('http://localhost/bob')),
    ])

    const aliceHtml = await readResponse(aliceResponse)
    const bobHtml = await readResponse(bobResponse)

    // Each response must contain its own store state, not the other's
    assert.ok(aliceHtml.includes('data-user="Alice"'), 'Alice response must show Alice')
    assert.ok(aliceHtml.includes('data-count="1"'), 'Alice response must show count=1')
    assert.ok(bobHtml.includes('data-user="Bob"'), 'Bob response must show Bob')
    assert.ok(bobHtml.includes('data-count="2"'), 'Bob response must show count=2')

    // Original singleton must be untouched
    assert.equal(sharedStore.user, 'default', 'Original store must not be mutated')
    assert.equal(sharedStore.count, 0, 'Original store count must not be mutated')
  })

  it('store mutations in onBeforeRender do not leak to other requests', async () => {
    // Reset outside SSR context — writes go to the raw Store
    sharedStore.user = 'initial'
    sharedStore.count = 0

    const handler = handleRequest(StoreReadingApp, {
      indexHtml: mockIndexHtml,
      storeRegistry: { TestStore: sharedStore },
      async onBeforeRender(ctx) {
        if (ctx.route === '/mutator') {
          sharedStore.user = 'mutated'
          sharedStore.count = 999
        }
        // /reader does not mutate — should see original state
      },
    })

    // Fire mutator first, reader second — but both concurrent
    const [mutatorResponse, readerResponse] = await Promise.all([
      handler(new Request('http://localhost/mutator')),
      handler(new Request('http://localhost/reader')),
    ])

    const mutatorHtml = await readResponse(mutatorResponse)
    const readerHtml = await readResponse(readerResponse)

    assert.ok(mutatorHtml.includes('data-user="mutated"'), 'Mutator sees its own mutation')
    assert.ok(readerHtml.includes('data-user="initial"'), 'Reader must not see mutator state')

    // Singleton untouched
    assert.equal(sharedStore.user, 'initial')
  })
})

describe('resolveOverlay()', () => {
  it('returns undefined outside SSR context', () => {
    const store = { count: 0 }
    const result = resolveOverlay(store)
    assert.equal(result, undefined)
  })

  it('returns cloned overlay inside SSR context', async () => {
    const store = { count: 5, name: 'test' }
    await runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)
      assert.ok(overlay !== undefined)
      assert.equal(overlay!.count, 5)
      assert.equal(overlay!.name, 'test')
    })
  })

  it('overlay is independent from original store', async () => {
    const store = { count: 5 }
    await runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)
      overlay!.count = 99
      assert.equal(store.count, 5, 'original store unchanged')
      assert.equal(overlay!.count, 99, 'overlay mutated independently')
    })
  })
})

describe('unwrapProxy via runInSSRContext', () => {
  it('uses GEA_PROXY_GET_RAW_TARGET when present on store', async () => {
    const realStore = { count: 10 }
    const proxy = {
      count: 10,
      [GEA_PROXY_GET_RAW_TARGET]: realStore,
    }
    await runInSSRContext([proxy], () => {
      // resolveOverlay uses the raw target as key
      const overlayViaProxy = resolveOverlay(proxy)
      assert.equal(overlayViaProxy, undefined, 'proxy itself is not the key')
      const overlayViaRaw = resolveOverlay(realStore)
      assert.ok(overlayViaRaw !== undefined, 'raw target is the key')
      assert.equal(overlayViaRaw!.count, 10)
    })
  })

  it('uses store directly when GEA_PROXY_GET_RAW_TARGET is not an object', async () => {
    const store = { count: 7, [GEA_PROXY_GET_RAW_TARGET]: 'not-an-object' }
    await runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)
      assert.ok(overlay !== undefined, 'store itself is the key')
    })
  })
})

describe('store isolation — advanced concurrency', () => {
  it('nested async operations see same overlay within one context', async () => {
    const store = { count: 0 }
    await runInSSRContext([store], async () => {
      const overlay1 = resolveOverlay(store)
      overlay1!.count = 10

      await new Promise((resolve) => setTimeout(resolve, 1))

      const overlay2 = resolveOverlay(store)
      assert.equal(overlay2!.count, 10, 'same overlay across async boundary')
      assert.equal(overlay1, overlay2, 'same reference')
    })
  })

  it('parallel SSR contexts get independent overlays', async () => {
    const store = { count: 0 }
    const results: number[] = []

    await Promise.all([
      runInSSRContext([store], async () => {
        const overlay = resolveOverlay(store)!
        overlay.count = 100
        await new Promise((resolve) => setTimeout(resolve, 5))
        results.push(overlay.count)
      }),
      runInSSRContext([store], async () => {
        const overlay = resolveOverlay(store)!
        overlay.count = 200
        await new Promise((resolve) => setTimeout(resolve, 5))
        results.push(overlay.count)
      }),
    ])

    assert.ok(results.includes(100))
    assert.ok(results.includes(200))
    assert.equal(store.count, 0, 'original store untouched')
  })

  it('overlay not accessible after context ends', async () => {
    const store = { count: 0 }
    await runInSSRContext([store], async () => {
      const overlay = resolveOverlay(store)
      assert.ok(overlay !== undefined)
    })
    const afterOverlay = resolveOverlay(store)
    assert.equal(afterOverlay, undefined, 'overlay gone after context exits')
  })

  it('handles multiple stores in parallel contexts', async () => {
    const storeA = { value: 'a' }
    const storeB = { value: 'b' }

    await Promise.all([
      runInSSRContext([storeA, storeB], async () => {
        resolveOverlay(storeA)!.value = 'a-modified'
        resolveOverlay(storeB)!.value = 'b-modified'
        await new Promise((resolve) => setTimeout(resolve, 2))
        assert.equal(resolveOverlay(storeA)!.value, 'a-modified')
        assert.equal(resolveOverlay(storeB)!.value, 'b-modified')
      }),
      runInSSRContext([storeA, storeB], async () => {
        assert.equal(resolveOverlay(storeA)!.value, 'a')
        assert.equal(resolveOverlay(storeB)!.value, 'b')
      }),
    ])
  })
})
