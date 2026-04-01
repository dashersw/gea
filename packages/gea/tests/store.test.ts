import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { Store } from '../src/lib/store'
import type { StoreChange } from '../src/lib/store'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('Store – construction', () => {
  it('creates with explicit initial state', () => {
    const store = new Store({ count: 0 })
    assert.equal(store.count, 0)
  })

  it('creates with empty state when no argument given', () => {
    const store = new Store()
    assert.ok(store)
  })

  it('returns a proxy from the constructor', () => {
    const store = new Store({ nested: { x: 1 } })
    assert.equal((store.nested as any).__isProxy, true)
  })
})

describe('Store – basic reactivity', () => {
  it('mutations are visible through the proxy', () => {
    const store = new Store({ name: 'hello' })
    store.name = 'world'
    assert.equal(store.name, 'world')
  })

  it('nested object mutations are reactive', () => {
    const store = new Store({ user: { name: 'Alice' } })
    store.user.name = 'Bob'
    assert.equal(store.user.name, 'Bob')
  })

  it('setting same value does not emit change', async () => {
    const store = new Store({ x: 5 })
    const changes: StoreChange[][] = []
    store.observe('x', (_v, c) => changes.push(c))
    store.x = 5
    await flush()
    assert.equal(changes.length, 0)
  })
})

describe('Store – observe and notify', () => {
  let store: Store
  beforeEach(() => {
    store = new Store({ count: 0, nested: { a: 1 } })
  })

  it('notifies observer on property change', async () => {
    const values: number[] = []
    store.observe('count', (v) => values.push(v))
    store.count = 10
    await flush()
    assert.deepEqual(values, [10])
  })

  it('notifies root observer on any change', async () => {
    const batches: StoreChange[][] = []
    store.observe([], (_v, c) => batches.push(c))
    store.count = 7
    await flush()
    assert.equal(batches.length, 1)
    assert.equal(batches[0][0].property, 'count')
  })

  it('notifies nested path observer', async () => {
    const values: number[] = []
    store.observe('nested.a', (v) => values.push(v))
    store.nested.a = 99
    await flush()
    assert.deepEqual(values, [99])
  })

  it('unsubscribe stops notifications', async () => {
    const values: number[] = []
    const unsub = store.observe('count', (v) => values.push(v))
    store.count = 1
    await flush()
    unsub()
    store.count = 2
    await flush()
    assert.deepEqual(values, [1])
  })

  it('multiple observers on same path', async () => {
    let a = 0
    let b = 0
    store.observe('count', () => a++)
    store.observe('count', () => b++)
    store.count = 5
    await flush()
    assert.equal(a, 1)
    assert.equal(b, 1)
  })

  it('parent path observer is notified by child changes', async () => {
    const changes: StoreChange[][] = []
    store.observe('nested', (_v, c) => changes.push(c))
    store.nested.a = 42
    await flush()
    assert.equal(changes.length, 1)
  })
})

describe('Store – batching via queueMicrotask', () => {
  it('batches synchronous mutations into one flush', async () => {
    const store = new Store({ a: 0, b: 0 })
    const batches: StoreChange[][] = []
    store.observe([], (_v, c) => batches.push(c))
    store.a = 1
    store.b = 2
    await flush()
    assert.equal(batches.length, 1)
    assert.equal(batches[0].length, 2)
  })

  it('uses the specialized top-level batch path for exact top-level observers', async () => {
    const store = new Store({ data: [] as number[], selected: 0 })
    let topLevelBatchCalls = 0
    const originalDeliverTopLevelBatch = (store as any)._deliverTopLevelBatch?.bind(store)

    assert.ok(originalDeliverTopLevelBatch, 'expected _deliverTopLevelBatch to exist')
    ;(store as any)._deliverTopLevelBatch = (batch: StoreChange[]) => {
      topLevelBatchCalls++
      return originalDeliverTopLevelBatch(batch)
    }

    const dataBatches: StoreChange[][] = []
    const selectedBatches: StoreChange[][] = []
    store.observe('data', (_v, c) => dataBatches.push(c))
    store.observe('selected', (_v, c) => selectedBatches.push(c))

    store.data = [1, 2, 3] as any
    store.selected = 1
    await flush()

    assert.equal(topLevelBatchCalls, 1)
    assert.equal(dataBatches.length, 1)
    assert.equal(selectedBatches.length, 1)
  })

  it('skips top-level proxy materialization for exact empty-array clears', async () => {
    const store = new Store({ data: [1, 2, 3] as number[], selected: 0 })
    let observedValue: unknown
    let topLevelValueCalls = 0
    const originalGetTopLevelObservedValue = (store as any)._getTopLevelObservedValue?.bind(store)

    assert.ok(originalGetTopLevelObservedValue, 'expected _getTopLevelObservedValue to exist')
    ;(store as any)._getTopLevelObservedValue = (change: StoreChange) => {
      topLevelValueCalls++
      return originalGetTopLevelObservedValue(change)
    }

    store.observe('data', (value) => {
      observedValue = value
    })

    store.data = [] as any
    await flush()

    assert.equal(topLevelValueCalls, 0)
    assert.ok(Array.isArray(observedValue))
    assert.equal((observedValue as any[]).length, 0)
  })
})

describe('Store – array methods', () => {
  let store: Store
  let changes: StoreChange[][]

  beforeEach(() => {
    store = new Store({ items: [1, 2, 3] })
    changes = []
    store.observe('items', (_v, c) => changes.push(c))
  })

  it('push appends and emits append change', async () => {
    store.items.push(4)
    await flush()
    assert.deepEqual([...store.items], [1, 2, 3, 4])
    assert.equal(changes.length, 1)
    assert.equal(changes[0][0].type, 'append')
    assert.equal(changes[0][0].start, 3)
    assert.equal(changes[0][0].count, 1)
  })

  it('push multiple items in one call', async () => {
    store.items.push(4, 5)
    await flush()
    assert.deepEqual([...store.items], [1, 2, 3, 4, 5])
    assert.equal(changes[0][0].count, 2)
  })

  it('pop removes last and emits delete', async () => {
    const result = store.items.pop()
    await flush()
    assert.equal(result, 3)
    assert.deepEqual([...store.items], [1, 2])
    assert.equal(changes[0][0].type, 'delete')
  })

  it('pop on empty array returns undefined', () => {
    const empty = new Store({ items: [] as number[] })
    const result = empty.items.pop()
    assert.equal(result, undefined)
  })

  it('shift removes first and emits delete', async () => {
    const result = store.items.shift()
    await flush()
    assert.equal(result, 1)
    assert.deepEqual([...store.items], [2, 3])
    assert.equal(changes[0][0].type, 'delete')
    assert.equal(changes[0][0].property, '0')
  })

  it('shift on empty array returns undefined', () => {
    const empty = new Store({ items: [] as number[] })
    const result = empty.items.shift()
    assert.equal(result, undefined)
  })

  it('unshift prepends and emits add', async () => {
    store.items.unshift(0)
    await flush()
    assert.deepEqual([...store.items], [0, 1, 2, 3])
    assert.equal(changes[0][0].type, 'add')
  })

  it('splice remove-only emits delete changes', async () => {
    store.items.splice(1, 1)
    await flush()
    assert.deepEqual([...store.items], [1, 3])
    assert.equal(changes[0][0].type, 'delete')
  })

  it('splice insert-at-end emits append', async () => {
    store.items.splice(3, 0, 4, 5)
    await flush()
    assert.deepEqual([...store.items], [1, 2, 3, 4, 5])
    assert.equal(changes[0][0].type, 'append')
  })

  it('splice insert-in-middle emits add changes', async () => {
    store.items.splice(1, 0, 99)
    await flush()
    assert.deepEqual([...store.items], [1, 99, 2, 3])
    assert.equal(changes[0][0].type, 'add')
  })

  it('splice replace emits delete + add', async () => {
    store.items.splice(1, 1, 99)
    await flush()
    assert.deepEqual([...store.items], [1, 99, 3])
    const flat = changes[0]
    assert.ok(flat.some((c) => c.type === 'delete'))
    assert.ok(flat.some((c) => c.type === 'add'))
  })

  it('sort emits reorder with permutation', async () => {
    const s = new Store({ items: [3, 1, 2] })
    const captured: StoreChange[][] = []
    s.observe('items', (_v, c) => captured.push(c))
    s.items.sort((a, b) => a - b)
    await flush()
    assert.deepEqual([...s.items], [1, 2, 3])
    assert.equal(captured[0][0].type, 'reorder')
    assert.ok(Array.isArray(captured[0][0].permutation))
  })

  it('reverse emits reorder', async () => {
    store.items.reverse()
    await flush()
    assert.deepEqual([...store.items], [3, 2, 1])
    assert.equal(changes[0][0].type, 'reorder')
  })
})

describe('Store – array iterator proxies', () => {
  it('map returns proxied items', () => {
    const store = new Store({ items: [{ name: 'a' }, { name: 'b' }] })
    const names = store.items.map((item) => item.name)
    assert.deepEqual(names, ['a', 'b'])
  })

  it('filter returns proxied items', () => {
    const store = new Store({ items: [1, 2, 3, 4] })
    const even = store.items.filter((n) => n % 2 === 0)
    assert.equal(even.length, 2)
  })

  it('find returns proxied item', () => {
    const store = new Store({ items: [{ id: 1 }, { id: 2 }] })
    const found = store.items.find((item) => item.id === 2)
    assert.equal(found?.id, 2)
  })

  it('findIndex returns correct index', () => {
    const store = new Store({ items: [10, 20, 30] })
    const idx = store.items.findIndex((n) => n === 20)
    assert.equal(idx, 1)
  })

  it('some returns true when predicate matches', () => {
    const store = new Store({ items: [1, 2, 3] })
    assert.equal(
      store.items.some((n) => n > 2),
      true,
    )
  })

  it('every returns false when predicate fails', () => {
    const store = new Store({ items: [1, 2, 3] })
    assert.equal(
      store.items.every((n) => n > 2),
      false,
    )
  })

  it('reduce accumulates correctly', () => {
    const store = new Store({ items: [1, 2, 3] })
    const sum = store.items.reduce((acc, n) => acc + n, 0)
    assert.equal(sum, 6)
  })

  it('reduce without initializer uses first element', () => {
    const store = new Store({ items: [10, 20, 30] })
    const sum = store.items.reduce((acc, n) => acc + n)
    assert.equal(sum, 60)
  })

  it('forEach iterates all items', () => {
    const store = new Store({ items: ['a', 'b', 'c'] })
    const result: string[] = []
    store.items.forEach((item) => result.push(item))
    assert.deepEqual(result, ['a', 'b', 'c'])
  })

  it('indexOf with proxy item', () => {
    const raw = { id: 1 }
    const store = new Store({ items: [raw] })
    assert.equal(store.items.indexOf(store.items[0]), 0)
  })

  it('includes with proxy item', () => {
    const raw = { id: 1 }
    const store = new Store({ items: [raw] })
    assert.equal(store.items.includes(store.items[0]), true)
  })
})

describe('Store – swap detection', () => {
  it('annotates reciprocal index updates as swaps', async () => {
    const store = new Store({ items: ['a', 'b', 'c'] })
    const batches: StoreChange[][] = []
    store.observe('items', (_v, c) => batches.push(c))

    const temp = store.items[0]
    store.items[0] = store.items[2]
    store.items[2] = temp

    await flush()
    assert.equal(batches.length, 1)
    assert.ok(batches[0].some((c) => c.arrayOp === 'swap'))
  })
})

describe('Store – array item property updates', () => {
  it('marks nested property changes as isArrayItemPropUpdate', async () => {
    const store = new Store({ items: [{ done: false }] })
    const batches: StoreChange[][] = []
    store.observe('items', (_v, c) => batches.push(c))

    store.items[0].done = true
    await flush()
    assert.equal(batches.length, 1)
    assert.equal(batches[0][0].isArrayItemPropUpdate, true)
    assert.equal(batches[0][0].arrayIndex, 0)
  })

  it('skips generic batch normalization for homogeneous array item property batches', async () => {
    const store = new Store({ items: [{ label: 'a' }, { label: 'b' }] })
    const batches: StoreChange[][] = []
    let normalizeCalls = 0
    const originalNormalize = (store as any)._normalizeBatch.bind(store)

    ;(store as any)._normalizeBatch = (batch: StoreChange[]) => {
      normalizeCalls++
      return originalNormalize(batch)
    }

    store.observe('items', (_v, c) => batches.push(c))

    store.items[0].label = 'updated a'
    store.items[1].label = 'updated b'

    await flush()

    assert.equal(batches.length, 1)
    assert.equal(batches[0].length, 2)
    assert.equal(normalizeCalls, 0)
  })

  it('reuses parent array metadata when creating a direct index proxy', () => {
    const store = new Store({ items: [{ label: 'a' }] })
    const items = store.items
    let arrayMetaCalls = 0
    const originalGetCachedArrayMeta = (store as any)._getCachedArrayMeta?.bind(store)

    assert.ok(originalGetCachedArrayMeta, 'expected _getCachedArrayMeta to exist')
    ;(store as any)._getCachedArrayMeta = (baseParts: string[]) => {
      arrayMetaCalls++
      return originalGetCachedArrayMeta(baseParts)
    }

    void items[0]

    assert.equal(arrayMetaCalls, 0)
  })

  it('uses the specialized direct array-item primitive update path', async () => {
    const store = new Store({ items: [{ label: 'a' }] })
    let directPrimitiveCalls = 0
    const originalQueueDirectArrayItemPrimitiveChange = (store as any)._queueDirectArrayItemPrimitiveChange?.bind(store)

    assert.ok(originalQueueDirectArrayItemPrimitiveChange, 'expected _queueDirectArrayItemPrimitiveChange to exist')
    ;(store as any)._queueDirectArrayItemPrimitiveChange = (...args: any[]) => {
      directPrimitiveCalls++
      return originalQueueDirectArrayItemPrimitiveChange(...args)
    }

    store.items[0].label = 'updated'
    await flush()

    assert.equal(directPrimitiveCalls, 1)
  })
})

describe('Store – getters (computed values)', () => {
  it('getters on subclass are accessible', () => {
    class TodoStore extends Store {
      items = [{ done: false }, { done: true }, { done: false }]
      get completedCount(): number {
        return this.items.filter((i) => i.done).length
      }
    }
    const store = new TodoStore()
    assert.equal(store.completedCount, 1)
  })

  it('getters react to state changes', async () => {
    class CountStore extends Store {
      count = 0
      get doubled(): number {
        return this.count * 2
      }
    }
    const store = new CountStore()
    assert.equal(store.doubled, 0)
    store.count = 5
    assert.equal(store.doubled, 10)
  })
})

describe('Store – property reassignment', () => {
  it('reassigning a property emits change', async () => {
    const store = new Store({ x: 1 })
    const batches: StoreChange[][] = []
    store.observe('x', (_v, c) => batches.push(c))
    store.x = 99
    store.x = 100
    await flush()
    assert.equal(store.x, 100)
    assert.ok(batches.length > 0)
  })
})

describe('Store – delete property', () => {
  it('delete emits change', async () => {
    const store = new Store({ a: 1, b: 2 })
    const batches: StoreChange[][] = []
    store.observe([], (_v, c) => batches.push(c))
    delete (store as any).a
    await flush()
    assert.equal(batches.length, 1)
    assert.equal(batches[0][0].type, 'delete')
    assert.equal(batches[0][0].property, 'a')
  })
})

describe('Store – proxy identity', () => {
  it('__isProxy flag is set on nested objects', () => {
    const store = new Store({ nested: { val: 1 } })
    assert.equal((store.nested as any).__isProxy, true)
  })

  it('__getTarget returns raw object', () => {
    const raw = { val: 42 }
    const store = new Store({ nested: raw })
    assert.equal((store.nested as any).__getTarget, raw)
  })

  it('__getPath returns the property path', () => {
    const store = new Store({ nested: { deep: { val: 1 } } })
    assert.equal((store.nested as any).__getPath, 'nested')
    assert.equal((store.nested.deep as any).__getPath, 'nested.deep')
  })

  it('assigning proxy value unwraps it', async () => {
    const store = new Store({ items: [{ id: 1 }], selected: null as any })
    store.selected = store.items[0]
    await flush()
    assert.equal(store.selected.id, 1)
  })
})

describe('Store – array full replacement as append', () => {
  it('detects array extension as append', async () => {
    const store = new Store({ items: [1, 2] })
    const batches: StoreChange[][] = []
    store.observe('items', (_v, c) => batches.push(c))
    store.items = [1, 2, 3, 4] as any
    await flush()
    assert.equal(batches.length, 1)
    assert.equal(batches[0][0].type, 'append')
  })
})

describe('Store – __store accessor', () => {
  it('returns the store instance from nested proxy', () => {
    const store = new Store({ obj: { x: 1 } })
    assert.equal((store.obj as any).__store, store)
  })
})

describe('Store – observerRoot cleanup on unsubscribe', () => {
  it('cleans up empty observer tree branches', () => {
    const store = new Store({ a: { b: { c: 1 } } })
    const unsub = store.observe('a.b.c', () => {})
    unsub()
    const unsub2 = store.observe('a.b.c', () => {})
    unsub2()
  })
})

describe('Store – derived arrays passed as values', () => {
  it('filtered store array is a real array that supports .map()', () => {
    const store = new Store({
      items: [
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true },
      ],
    })
    const filtered = store.items.filter((x: any) => x.active)
    assert.ok(Array.isArray(filtered), 'filter result should be a real Array')
    const ids = filtered.map((x: any) => x.id)
    assert.deepEqual(ids, [1, 3])
  })

  it('mapped store array is a real array that supports .filter()', () => {
    const store = new Store({
      items: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ],
    })
    const names = store.items.map((x: any) => x.name)
    assert.ok(Array.isArray(names), 'map result should be a real Array')
    assert.deepEqual(names, ['a', 'b'])
    const filtered = names.filter((n: string) => n === 'a')
    assert.deepEqual(filtered, ['a'])
  })

  it('store array proxy itself supports .map() and .filter()', () => {
    const store = new Store({
      items: [
        { id: 1, v: 10 },
        { id: 2, v: 20 },
      ],
    })
    const doubled = store.items.map((x: any) => x.v * 2)
    assert.deepEqual(doubled, [20, 40])
    const big = store.items.filter((x: any) => x.v > 15)
    assert.equal(big.length, 1)
  })
})

describe('Store – silent()', () => {
  it('updates values but does not notify observers', async () => {
    const store = new Store({ count: 0 })
    let notified = false
    store.observe('count', () => {
      notified = true
    })

    store.silent(() => {
      store.count = 42
    })

    assert.equal(store.count, 42, 'value must be updated')
    await flush()
    assert.equal(notified, false, 'observer must not fire')
  })

  it('suppresses notifications for nested mutations', async () => {
    const store = new Store({ user: { name: 'Alice' } })
    let notified = false
    store.observe('user', () => {
      notified = true
    })

    store.silent(() => {
      store.user.name = 'Bob'
    })

    assert.equal(store.user.name, 'Bob')
    await flush()
    assert.equal(notified, false, 'observer must not fire for nested mutation')
  })

  it('does not suppress notifications after silent() returns', async () => {
    const store = new Store({ x: 0 })
    const values: number[] = []
    store.observe('x', (v) => values.push(v))

    store.silent(() => {
      store.x = 1
    })

    store.x = 2
    await flush()
    assert.deepEqual(values, [2], 'only the post-silent mutation should notify')
  })

  it('suppresses array mutations', async () => {
    const store = new Store({ items: [1, 2, 3] })
    let notified = false
    store.observe('items', () => {
      notified = true
    })

    store.silent(() => {
      store.items.push(4)
      store.items.splice(0, 1)
    })

    assert.deepEqual(store.items, [2, 3, 4])
    await flush()
    assert.equal(notified, false, 'observer must not fire for array mutations inside silent()')
  })
})

describe('Store - circular reference protection', () => {
  it('does not infinite loop when an object references itself', () => {
    const store = new Store<any>({ obj: {} })
    store.obj.self = store.obj.__getTarget ?? store.obj

    // Accessing the circular ref should return a proxy, not hang
    assert.ok(store.obj.self)
    assert.equal((store.obj.self as any).__isProxy, true)
  })

  it('does not infinite loop when an array contains itself', () => {
    const arr: any[] = []
    arr.push(arr)
    const store = new Store<any>({ arr })

    // arr[0] === arr - accessing nested index should not recurse infinitely
    const nested = store.arr[0]
    assert.ok(nested !== undefined)
  })

  it('returns the same proxy for the same array on repeated access', () => {
    const store = new Store<any>({ items: [1, 2, 3] })
    const proxy1 = (store as any)._createProxy
      ? store.items
      : store.items
    const proxy2 = store.items
    assert.strictEqual(proxy1, proxy2, 'same array should return same proxy reference')
  })

  it('cross-type circular: object references array that references object', () => {
    const obj: any = { name: 'root' }
    const arr: any[] = [obj]
    obj.arr = arr
    const store = new Store<any>({ obj })

    // obj.arr[0] === obj - should not recurse
    assert.equal(store.obj.name, 'root')
    assert.ok(store.obj.arr)
    assert.ok(Array.isArray(store.obj.arr.__getTarget ?? []))
  })

  it('circular object does not prevent reactivity', async () => {
    const store = new Store<any>({ data: { value: 0 } })
    store.data.self = store.data.__getTarget ?? store.data
    const values: number[] = []
    store.observe('data.value', (v) => values.push(v as number))

    store.data.value = 42
    await flush()
    assert.deepEqual(values, [42])
  })
})
