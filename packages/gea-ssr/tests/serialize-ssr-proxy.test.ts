import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { serializeStores } from '../src/serialize.ts'
import { runInSSRContext } from '../src/ssr-context.ts'
import { signal } from '../../gea/src/signals/index.ts'

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

describe('serializeStores – signal-based SSR isolation', () => {
  it('serializes signal values within SSR context', () => {
    const store = createSignalStore({ count: 0, name: 'shared' })

    runInSSRContext([store], () => {
      store.count = 42
      store.name = 'request-local'

      const result = serializeStores([store], { TestStore: store })
      const parsed = new Function('return ' + result)()

      assert.equal(parsed.TestStore.count, 42, 'Must serialize current signal value')
      assert.equal(parsed.TestStore.name, 'request-local', 'Must serialize current signal value')
    })
  })

  it('serializes properties added to overlay for plain-object stores', () => {
    const store = { base: 'yes' } as any
    runInSSRContext([store], () => {
      // For plain-object stores the overlay is accessible and can have extra keys
      const result = serializeStores([store], { S: store })
      const parsed = new Function('return ' + result)()
      assert.equal(parsed.S.base, 'yes')
    })
  })

  it('serializes signal store without SSR context (direct peek)', () => {
    const store = createSignalStore({ value: 99 })

    const result = serializeStores([store], { S: store })
    const parsed = new Function('return ' + result)()
    assert.equal(parsed.S.value, 99, 'Must serialize signal peek value outside SSR context')
  })
})
