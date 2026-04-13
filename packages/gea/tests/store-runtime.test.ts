/**
 * Coverage for the Store: root proxy, nested proxy, observers, derived
 * observers (getter-backed), swap detection, and flush semantics.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../src/store'
import { GEA_PROXY_RAW, GEA_STORE_ROOT } from '../src/symbols'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('Store – construction and root proxy', () => {
  it('returns a proxy (not the raw instance)', () => {
    const s = new Store({ x: 1 })
    assert.notEqual((s as any)[GEA_PROXY_RAW], s)
  })
  it('initializes fields from initialData', () => {
    const s = new Store({ a: 1, b: 'hi' })
    assert.equal((s as any).a, 1)
    assert.equal((s as any).b, 'hi')
  })
  it('exposes GEA_STORE_ROOT pointing to the proxy', () => {
    const s = new Store({ x: 1 })
    const root = (s as any)[GEA_STORE_ROOT]
    root.x = 42
    assert.equal((s as any).x, 42)
  })
  it('reads GEA_PROXY_RAW returns the raw target', () => {
    const s = new Store({ x: 1 })
    const raw = (s as any)[GEA_PROXY_RAW]
    assert.ok(raw)
    assert.equal(raw.x, 1)
  })
  it('class-subclass initializes own fields as store state', () => {
    class Sub extends Store {
      foo = 5
      bar = 'q'
    }
    const s = new Sub()
    assert.equal((s as any).foo, 5)
    assert.equal((s as any).bar, 'q')
  })
  it('method access returns bound functions', async () => {
    class Sub extends Store {
      name = 'x'
      rename(n: string): void {
        this.name = n
      }
    }
    const s = new Sub()
    const fn = (s as any).rename
    fn('ok')
    assert.equal((s as any).name, 'ok')
  })
  it('symbol property get returns raw value', () => {
    const s = new Store({})
    const sym = Symbol('k')
    ;(s as any)[sym] = 7
    assert.equal((s as any)[sym], 7)
  })
})

describe('Store – observer basics', () => {
  it('fires observer on scalar change', async () => {
    const s = new Store({ x: 1 })
    const seen: any[] = []
    s.observe('x', (v: any) => seen.push(v))
    ;(s as any).x = 2
    await flush()
    assert.deepEqual(seen, [2])
  })
  it('does not fire when same value assigned', async () => {
    const s = new Store({ x: 1 })
    const seen: any[] = []
    s.observe('x', (v: any) => seen.push(v))
    ;(s as any).x = 1
    await flush()
    assert.deepEqual(seen, [])
  })
  it('fires multiple observers for same prop', async () => {
    const s = new Store({ x: 1 })
    const a: any[] = [],
      b: any[] = []
    s.observe('x', (v: any) => a.push(v))
    s.observe('x', (v: any) => b.push(v))
    ;(s as any).x = 2
    await flush()
    assert.deepEqual(a, [2])
    assert.deepEqual(b, [2])
  })
  it('remover unsubscribes the observer', async () => {
    const s = new Store({ x: 1 })
    const seen: any[] = []
    const off = s.observe('x', (v: any) => seen.push(v))
    off()
    ;(s as any).x = 2
    await flush()
    assert.deepEqual(seen, [])
  })
  it('batches multiple same-tick changes into one observer call', async () => {
    const s = new Store({ x: 0 })
    let callCount = 0
    s.observe('x', () => callCount++)
    ;(s as any).x = 1
    ;(s as any).x = 2
    ;(s as any).x = 3
    await flush()
    assert.equal(callCount, 1)
  })
  it('empty-path observer fires on any change', async () => {
    const s = new Store({ a: 1, b: 2 })
    let count = 0
    s.observe('', () => count++)
    ;(s as any).a = 10
    ;(s as any).b = 20
    await flush()
    assert.equal(count, 1)
  })
})

describe('Store – derived observers (getter-backed)', () => {
  it('fires a getter observer when its underlying state changes', async () => {
    class Sub extends Store {
      items: number[] = [1, 2, 3]
      get total() {
        return this.items.reduce((a, b) => a + b, 0)
      }
    }
    const s = new Sub()
    const seen: number[] = []
    s.observe('total', (v: any) => seen.push(v))
    ;(s as any).items = [1, 2, 3, 4]
    await flush()
    assert.deepEqual(seen, [10])
  })
  it('derived observer receives the computed value, not the source', async () => {
    class Sub extends Store {
      count = 3
      get doubled() {
        return this.count * 2
      }
    }
    const s = new Sub()
    const seen: any[] = []
    s.observe('doubled', (v: any) => seen.push(v))
    ;(s as any).count = 5
    await flush()
    assert.deepEqual(seen, [10])
  })
})

describe('Store – nested array proxy', () => {
  it('push emits a change on the root path', async () => {
    const s = new Store({ arr: [1, 2] })
    let fired = false
    s.observe('arr', () => {
      fired = true
    })
    ;(s as any).arr.push(3)
    await flush()
    assert.equal(fired, true)
  })
  it('splice emits a change', async () => {
    const s = new Store({ arr: [1, 2, 3] })
    let fired = false
    s.observe('arr', () => {
      fired = true
    })
    ;(s as any).arr.splice(1, 1)
    await flush()
    assert.equal(fired, true)
  })
  it('index write emits aipu change', async () => {
    const s = new Store({ arr: [{ v: 1 }, { v: 2 }] })
    const changes: any[] = []
    s.observe('arr', (_v: any, c: any) => changes.push(c))
    ;(s as any).arr[0] = { v: 99 }
    await flush()
    assert.equal(changes.length, 1)
    assert.equal(changes[0][0]?.aipu, true)
    assert.equal(changes[0][0]?.arix, 0)
  })
  it('nested object property write fires array observer', async () => {
    const s = new Store({ items: [{ n: 1 }, { n: 2 }] })
    const seen: any[] = []
    s.observe('items', (_v: any, c: any) => seen.push(c))
    ;(s as any).items[0].n = 99
    await flush()
    assert.ok(seen.length >= 1)
  })
  it('reads return cached proxy (same reference across calls)', () => {
    const s = new Store({ arr: [{ n: 1 }] })
    const a = (s as any).arr
    const b = (s as any).arr
    assert.equal(a, b)
  })
  it('array iteration works (for-of)', () => {
    const s = new Store({ arr: [1, 2, 3] })
    let sum = 0
    for (const n of (s as any).arr) sum += n
    assert.equal(sum, 6)
  })
  it('array.length reflects current size', () => {
    const s = new Store({ arr: [1, 2, 3] })
    ;(s as any).arr.push(4)
    assert.equal((s as any).arr.length, 4)
  })
})

describe('Store – nested object proxy', () => {
  it('writes to nested object fire root observer', async () => {
    const s = new Store({ obj: { a: 1, b: 2 } })
    let count = 0
    s.observe('obj', () => count++)
    ;(s as any).obj.a = 10
    await flush()
    assert.equal(count, 1)
  })
  it('delete on nested property fires observer', async () => {
    const s = new Store({ obj: { a: 1, b: 2 } })
    let count = 0
    s.observe('obj', () => count++)
    delete (s as any).obj.a
    await flush()
    assert.equal(count, 1)
  })
  it('deep nested write fires root observer', async () => {
    const s = new Store({ a: { b: { c: 1 } } })
    let count = 0
    s.observe('a', () => count++)
    ;(s as any).a.b.c = 99
    await flush()
    assert.equal(count, 1)
  })
})

describe('Store – getter-only accessors', () => {
  it('silently ignores writes to getter-only accessors', async () => {
    class Sub extends Store {
      items: number[] = [1, 2]
      get count() {
        return this.items.length
      }
    }
    const s = new Sub()
    ;(s as any).count = 99 // getter-only, ignored
    assert.equal((s as any).count, 2)
  })
})

describe('Store – async flush', () => {
  it('changes delivered in a microtask (not synchronous)', async () => {
    const s = new Store({ x: 1 })
    let fired = false
    s.observe('x', () => {
      fired = true
    })
    ;(s as any).x = 2
    assert.equal(fired, false)
    await flush()
    assert.equal(fired, true)
  })
  it('multiple stores flush independently', async () => {
    const a = new Store({ v: 1 })
    const b = new Store({ v: 1 })
    const seenA: any[] = []
    const seenB: any[] = []
    a.observe('v', (v: any) => seenA.push(v))
    b.observe('v', (v: any) => seenB.push(v))
    ;(a as any).v = 10
    ;(b as any).v = 20
    await flush()
    assert.deepEqual(seenA, [10])
    assert.deepEqual(seenB, [20])
  })
})

describe('Store – silent()', () => {
  it('discards pending changes made inside silent()', async () => {
    const s = new Store({ x: 1 })
    const seen: any[] = []
    s.observe('x', (v: any) => seen.push(v))
    s.silent(() => {
      ;(s as any).x = 99
    })
    await flush()
    assert.deepEqual(seen, [])
  })
})

describe('Store – flushSync()', () => {
  it('delivers pending changes synchronously', () => {
    const s = new Store({ x: 1 })
    const seen: any[] = []
    s.observe('x', (v: any) => seen.push(v))
    ;(s as any).x = 2
    s.flushSync()
    assert.deepEqual(seen, [2])
  })
})

describe('Store – cross-path proxy caching', () => {
  it('same raw array reached via different props returns different proxies', () => {
    class Sub extends Store {
      items: any[] = [{ n: 1 }]
      get itemsView() {
        return this.items
      }
    }
    const s = new Sub()
    const a = (s as any).items
    const b = (s as any).itemsView
    // Reads via different root props produce different proxy wrappers so
    // mutations notify the correct root observer.
    assert.notEqual(a, b)
  })
})
