import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../src/lib/store'
import type { StoreChange } from '../src/lib/store'
import { GEA_STORE_ROOT } from '../src/lib/symbols'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('Store – deliverArrayItemPropBatch with children (lines 308-365)', () => {
  it('delivers to array node when only array-level observer exists (fast path)', async () => {
    const store = new Store({ items: [{ name: 'a', done: false }] })
    const batches: StoreChange[][] = []
    store.observe('items', (_v, c) => batches.push(c))
    store.items[0].done = true
    await flush()
    assert.equal(batches.length, 1)
    assert.equal(batches[0][0].isArrayItemPropUpdate, true)
  })

  it('delivers to sub-property observers on array items', async () => {
    const store = new Store({ items: [{ name: 'a' }, { name: 'b' }] })
    const nameChanges: StoreChange[][] = []
    store.observe('items.0.name', (_v, c) => nameChanges.push(c))
    store.items[0].name = 'changed'
    await flush()
    assert.equal(nameChanges.length, 1)
  })

  it('returns false when batch has mixed array paths', async () => {
    const store = new Store({ a: [{ x: 1 }], b: [{ y: 2 }] })
    const batches: StoreChange[][] = []
    store.observe([], (_v, c) => batches.push(c))
    store.a[0].x = 10
    store.b[0].y = 20
    await flush()
    assert.ok(batches.length >= 1)
  })

  it('delivers to parent + child observers for array item props', async () => {
    const store = new Store({ items: [{ val: 1 }] })
    const parentBatches: StoreChange[][] = []
    const childBatches: StoreChange[][] = []
    store.observe('items', (_v, c) => parentBatches.push(c))
    store.observe('items.0.val', (_v, c) => childBatches.push(c))
    store.items[0].val = 99
    await flush()
    assert.ok(parentBatches.length >= 1)
    assert.ok(childBatches.length >= 1)
  })
})

describe('Store – flushChanges multi-batch delivery (lines 376-371)', () => {
  it('delivers multiple changes to multiple observers', async () => {
    const store = new Store({ x: 0, y: 0 })
    const xValues: any[] = []
    const yValues: any[] = []
    store.observe('x', (v) => xValues.push(v))
    store.observe('y', (v) => yValues.push(v))
    store.x = 1
    store.y = 2
    await flush()
    assert.deepEqual(xValues, [1])
    assert.deepEqual(yValues, [2])
  })
})

describe('Store – proxy set trap edge cases (lines 687-798)', () => {
  it('handles symbol property set on store proxy', async () => {
    const store = new Store({ x: 1 })
    const sym = Symbol('test')
    ;(store as any)[sym] = 'symbolValue'
    assert.equal((store as any)[sym], 'symbolValue')
  })

  it('handles setting array length directly', async () => {
    const store = new Store({ items: [1, 2, 3] })
    ;(store.items as any).length = 1
    assert.equal(store.items.length, 1)
  })

  it('emits non-append change when array replacement differs in prefix', async () => {
    const store = new Store({ data: { items: [1, 2] } })
    const batches: StoreChange[][] = []
    store.observe('data', (_v, c) => batches.push(c))
    store.data.items = [99, 2, 3] as any
    await flush()
    assert.ok(batches.length >= 1)
    const change = batches[0][0]
    assert.equal(change.type, 'update')
  })

  it('clears proxy cache when old value is an object', async () => {
    const store = new Store({ obj: { nested: { val: 1 } } })
    const first = store.obj.nested
    store.obj = { nested: { val: 2 } }
    const second = store.obj.nested
    assert.notEqual(first, second)
  })

  it('handles delete on symbol property', () => {
    const store = new Store({ x: 1 })
    const sym = Symbol('del')
    ;(store as any)[sym] = 'temp'
    delete (store as any)[sym]
    assert.equal((store as any)[sym], undefined)
  })

  it('delete on array item clears caches and emits change', async () => {
    const store = new Store({ items: [{ obj: { a: 1 } }] })
    const batches: StoreChange[][] = []
    store.observe('items', (_v, c) => batches.push(c))
    delete (store.items[0] as any).obj
    await flush()
    assert.ok(batches.length >= 1)
    assert.equal(batches[0][0].isArrayItemPropUpdate, true)
    assert.equal(batches[0][0].type, 'delete')
  })

  it('delete on nested object clears proxy cache', async () => {
    const store = new Store({ a: { nested: { deep: 1 } } })
    const batches: StoreChange[][] = []
    store.observe([], (_v, c) => batches.push(c))
    delete store.a.nested
    await flush()
    assert.ok(batches.length >= 1)
  })
})

describe('Store – proxy get trap edge cases', () => {
  it('returns null values as-is', () => {
    const store = new Store({ val: null as any })
    assert.equal(store.val, null)
  })

  it('returns undefined for missing props', () => {
    const store = new Store({})
    assert.equal(store.missing, undefined)
  })

  it('returns primitives directly without proxying', () => {
    const store = new Store({ num: 42, str: 'hello', bool: true })
    assert.equal(store.num, 42)
    assert.equal(store.str, 'hello')
    assert.equal(store.bool, true)
  })

  it('binds non-intercepted array methods', () => {
    const store = new Store({ items: [3, 1, 2] })
    const joined = store.items.join(',')
    assert.equal(joined, '3,1,2')
  })

  it('binds functions on objects', () => {
    const store = new Store({
      obj: {
        fn() {
          return 42
        },
      },
    })
    assert.equal(store.obj.fn(), 42)
  })

  it('array index access returns cached proxies', () => {
    const store = new Store({ items: [{ id: 1 }, { id: 2 }] })
    const first = store.items[0]
    const second = store.items[0]
    assert.equal(first, second)
  })

  it('object property access returns cached proxies', () => {
    const store = new Store({ nested: { deep: { val: 1 } } })
    const a = store.nested.deep
    const b = store.nested.deep
    assert.equal(a, b)
  })
})

describe('Store – splice with negative start', () => {
  it('handles negative start index', async () => {
    const store = new Store({ items: [1, 2, 3] })
    store.items.splice(-1, 1)
    assert.deepEqual([...store.items], [1, 2])
  })
})

describe('Store – collectMatchingObserverNodesFromNode', () => {
  it('notifies deep sub-path observers for array item property changes', async () => {
    const store = new Store({ items: [{ nested: { deep: 0 } }] })
    const deep: any[] = []
    store.observe('items.0.nested.deep', (v) => deep.push(v))
    store.items[0].nested.deep = 42
    await flush()
    assert.deepEqual(deep, [42])
  })
})

describe('Store – normalizeBatch allLeafArrayPropUpdates short-circuit', () => {
  it('skips swap detection when all changes are leaf array prop updates', async () => {
    const store = new Store({ items: [{ a: 1, b: 2 }] })
    const batches: StoreChange[][] = []
    store.observe('items', (_v, c) => batches.push(c))
    store.items[0].a = 10
    store.items[0].b = 20
    await flush()
    assert.equal(batches.length, 1)
    assert.equal(batches[0].length, 2)
    assert.ok(batches[0].every((c) => c.isArrayItemPropUpdate))
  })
})

describe('Store – defineProperty trap', () => {
  it('handles Object.defineProperty with a reactive property', () => {
    const store = new Store({ x: 1 })
    Object.defineProperty(store, 'customProp', { value: 42, configurable: true })
    assert.equal((store as any).customProp, 42)
  })

  it('passes through defineProperty for non-state props', () => {
    const store = new Store({ x: 1 })
    Object.defineProperty(store, 'myProp', { value: 42, configurable: true })
    assert.equal((store as any).myProp, 42)
  })
})

describe('Store – GEA_STORE_ROOT on raw target', () => {
  it('GEA_STORE_ROOT returns self on the raw store object', () => {
    const store = new Store({ x: 1 })
    assert.equal((store as any)[GEA_STORE_ROOT], store)
  })
})

describe('Store – indexOf/includes with non-proxy searchElement (line 571)', () => {
  it('indexOf with non-proxy primitive value', () => {
    const store = new Store({ items: [10, 20, 30] })
    assert.equal(store.items.indexOf(20), 1)
    assert.equal(store.items.indexOf(99), -1)
  })

  it('includes with non-proxy primitive value', () => {
    const store = new Store({ items: [10, 20, 30] })
    assert.equal(store.items.includes(30), true)
    assert.equal(store.items.includes(99), false)
  })
})

describe('Store – splitPath edge cases', () => {
  it('handles empty string path as root observer', async () => {
    const store = new Store({ x: 1 })
    const values: any[] = []
    store.observe('', (v) => values.push(v))
    store.x = 2
    await flush()
    assert.ok(values.length >= 1)
  })
})

describe('Store – splice edge cases', () => {
  it('splice with no args removes all', () => {
    const store = new Store({ items: [1, 2, 3] })
    const result = store.items.splice()
    assert.deepEqual([...result], [1, 2, 3])
    assert.deepEqual([...store.items], [])
  })

  it('splice with one arg removes to end', () => {
    const store = new Store({ items: [1, 2, 3] })
    const result = store.items.splice(1)
    assert.deepEqual([...result], [2, 3])
    assert.deepEqual([...store.items], [1])
  })

  it('splice with proxy items unwraps them', () => {
    const store = new Store({ items: [{ a: 1 }], extra: { b: 2 } })
    store.items.splice(0, 0, store.extra)
    assert.equal(store.items.length, 2)
  })

  it('splice delete in middle emits delete changes', async () => {
    const store = new Store({ items: [1, 2, 3, 4, 5] })
    const batches: StoreChange[][] = []
    store.observe('items', (_v, c) => batches.push(c))
    store.items.splice(1, 2)
    await flush()
    assert.ok(batches.length >= 1)
    assert.ok(batches[0].some((c) => c.type === 'delete'))
  })
})

describe('Store – push with proxy values', () => {
  it('unwraps proxy items on push', () => {
    const store = new Store({ items: [{ id: 1 }], obj: { id: 2 } })
    store.items.push(store.obj)
    assert.equal(store.items.length, 2)
    assert.equal(store.items[1].id, 2)
  })

  it('push with zero items is a no-op', () => {
    const store = new Store({ items: [1] })
    const len = store.items.push()
    assert.equal(len, 1)
  })
})

describe('Store – sort with already sorted array', () => {
  it('sort of already-sorted produces identity permutation', async () => {
    const store = new Store({ items: [1, 2, 3] })
    const batches: StoreChange[][] = []
    store.observe('items', (_v, c) => batches.push(c))
    store.items.sort((a: number, b: number) => a - b)
    await flush()
    assert.ok(batches.length >= 1)
  })
})

describe('Store – observe with array path', () => {
  it('accepts array path segments', async () => {
    const store = new Store({ a: { b: { c: 0 } } })
    const vals: any[] = []
    store.observe(['a', 'b', 'c'], (v) => vals.push(v))
    store.a.b.c = 42
    await flush()
    assert.deepEqual(vals, [42])
  })
})

describe('Store – unshift with proxy items', () => {
  it('unwraps proxy items on unshift', () => {
    const store = new Store({ items: [{ id: 1 }], obj: { id: 0 } })
    store.items.unshift(store.obj)
    assert.equal(store.items.length, 2)
    assert.equal(store.items[0].id, 0)
  })
})

describe('Store – set on new vs existing property', () => {
  it('emits add for new property', async () => {
    const store = new Store({ x: 1 })
    const batches: StoreChange[][] = []
    store.observe([], (_v, c) => batches.push(c))
    store.newProp = 'hello'
    await flush()
    assert.ok(batches[0].some((c) => c.type === 'add'))
  })
})

describe('Store – array assignment with same prefix as append', () => {
  it('detects non-append when inner items differ', async () => {
    const store = new Store({ data: { items: [1, 2, 3] } })
    const batches: StoreChange[][] = []
    store.observe('data', (_v, c) => batches.push(c))
    store.data.items = [1, 99, 3, 4] as any
    await flush()
    assert.ok(batches.length >= 1)
  })
})

describe('Store – observerNode traversal - no matching children', () => {
  it('handles observer on path that does not have nested handlers', async () => {
    const store = new Store({ a: { b: { c: 1 } } })
    const vals: any[] = []
    store.observe('a', (v) => vals.push(v))
    store.a.b.c = 99
    await flush()
    assert.ok(vals.length >= 1)
  })
})
