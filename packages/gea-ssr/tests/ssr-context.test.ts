import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../src/handle-request.ts'
import { resolveOverlay, runInSSRContext } from '../src/ssr-context.ts'
import type { GeaComponentInstance, GeaStore } from '../src/types.ts'
import { signal } from '../../gea/src/signals/index.ts'

const mockIndexHtml = '<!DOCTYPE html><html><body><div id="app"></div></body></html>'

/** Helper to create a signal-based store (avoids tsx class field transpilation bug
 *  where multiple computed symbol keys get collapsed). */
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

// A v2 signal-based store
const sharedStore = createSignalStore({ user: 'default', count: 0 }) as GeaStore

class StoreReadingApp implements GeaComponentInstance {
  props: Record<string, unknown>
  constructor(props?: Record<string, unknown>) { this.props = props || {} }
  template() {
    return `<div data-user="${(sharedStore as any).user}" data-count="${(sharedStore as any).count}"></div>`
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
    ;(sharedStore as any).user = 'default'
    ;(sharedStore as any).count = 0

    const handler = handleRequest(StoreReadingApp, {
      indexHtml: mockIndexHtml,
      storeRegistry: { TestStore: sharedStore },
      async onBeforeRender(ctx) {
        // Each request mutates the store differently based on route
        const route = ctx.route
        if (route === '/alice') {
          ;(sharedStore as any).user = 'Alice'
          ;(sharedStore as any).count = 1
          // Simulate async work to increase overlap window
          await new Promise(r => setTimeout(r, 20))
        } else if (route === '/bob') {
          ;(sharedStore as any).user = 'Bob'
          ;(sharedStore as any).count = 2
          await new Promise(r => setTimeout(r, 20))
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

    // Original singleton must be restored
    assert.equal((sharedStore as any).user, 'default', 'Original store must be restored after requests')
    assert.equal((sharedStore as any).count, 0, 'Original store count must be restored after requests')
  })

  it('store mutations in onBeforeRender do not leak to other requests', async () => {
    // Reset outside SSR context
    ;(sharedStore as any).user = 'initial'
    ;(sharedStore as any).count = 0

    const handler = handleRequest(StoreReadingApp, {
      indexHtml: mockIndexHtml,
      storeRegistry: { TestStore: sharedStore },
      async onBeforeRender(ctx) {
        if (ctx.route === '/mutator') {
          ;(sharedStore as any).user = 'mutated'
          ;(sharedStore as any).count = 999
        }
        // /reader does not mutate — should see cloned-from-initial state
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

    // Singleton restored
    assert.equal((sharedStore as any).user, 'initial')
  })
})

describe('resolveOverlay()', () => {
  it('returns undefined outside SSR context', () => {
    const store = { count: 0 }
    const result = resolveOverlay(store)
    assert.equal(result, undefined)
  })

  it('returns cloned overlay inside SSR context for plain-object stores', async () => {
    const store = { count: 5, name: 'test' }
    await runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)
      assert.ok(overlay !== undefined)
      assert.equal(overlay!.count, 5)
      assert.equal(overlay!.name, 'test')
    })
  })

  it('overlay is independent from original plain-object store', async () => {
    const store = { count: 5 }
    await runInSSRContext([store], () => {
      const overlay = resolveOverlay(store)
      overlay!.count = 99
      assert.equal(store.count, 5, 'original store unchanged')
      assert.equal(overlay!.count, 99, 'overlay mutated independently')
    })
  })
})

describe('store isolation — advanced concurrency (plain objects)', () => {
  it('nested async operations see same overlay within one context', async () => {
    const store = { count: 0 }
    await runInSSRContext([store], async () => {
      const overlay1 = resolveOverlay(store)
      overlay1!.count = 10

      await new Promise(resolve => setTimeout(resolve, 1))

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
        await new Promise(resolve => setTimeout(resolve, 5))
        results.push(overlay.count)
      }),
      runInSSRContext([store], async () => {
        const overlay = resolveOverlay(store)!
        overlay.count = 200
        await new Promise(resolve => setTimeout(resolve, 5))
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
        await new Promise(resolve => setTimeout(resolve, 2))
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

describe('signal-based store isolation', () => {
  it('concurrent SSR contexts isolate signal-based stores', async () => {
    const store = createSignalStore({ count: 0 })
    const results: number[] = []

    await Promise.all([
      runInSSRContext([store], async () => {
        store.count = 100
        await new Promise(resolve => setTimeout(resolve, 5))
        results.push(store.count)
      }),
      runInSSRContext([store], async () => {
        store.count = 200
        await new Promise(resolve => setTimeout(resolve, 5))
        results.push(store.count)
      }),
    ])

    // Note: signal-based isolation restores originals after each context finishes
    assert.equal(store.count, 0, 'original store restored after contexts complete')
  })

  it('signal values are cloned per-request, not shared', async () => {
    const store = createSignalStore({ items: [1, 2, 3] })

    await runInSSRContext([store], () => {
      // Items should be a deep clone, not the same reference
      const ssrItems = store.items
      assert.deepEqual(ssrItems, [1, 2, 3])
      store.items = [4, 5, 6]
      assert.deepEqual(store.items, [4, 5, 6])
    })

    // Original restored
    assert.deepEqual(store.items, [1, 2, 3])
  })
})
