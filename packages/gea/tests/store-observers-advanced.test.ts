/**
 * Advanced Store observer behaviors: flushSync, silent, arrays-of-objects,
 * nested arrays, mixed mutations, observer-in-observer.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../src/store'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('Store – mixed mutation batching', () => {
  it('batches scalar + array mutations into one flush', async () => {
    const s = new Store({ x: 1, arr: [1, 2] })
    let xCount = 0
    let arrCount = 0
    s.observe('x', () => xCount++)
    s.observe('arr', () => arrCount++)
    ;(s as any).x = 2
    ;(s as any).arr.push(3)
    ;(s as any).x = 3
    await flush()
    assert.equal(xCount, 1)
    assert.equal(arrCount, 1)
  })
  it('observer can trigger another store change', async () => {
    const a = new Store({ x: 1 })
    const b = new Store({ y: 0 })
    const seen: any[] = []
    a.observe('x', (v: any) => {
      ;(b as any).y = v * 10
    })
    b.observe('y', (v: any) => seen.push(v))
    ;(a as any).x = 5
    await flush()
    await flush()
    assert.deepEqual(seen, [50])
  })
})

describe('Store – observer isolation', () => {
  it('throwing observer does not break sibling observers', async () => {
    const s = new Store({ x: 1 })
    const seen: any[] = []
    s.observe('x', () => {
      throw new Error('boom')
    })
    s.observe('x', (v: any) => seen.push(v))
    ;(s as any).x = 2
    await flush()
    assert.deepEqual(seen, [2])
  })
})

describe('Store – arrays of objects', () => {
  it('replaces array entry and fires observer', async () => {
    const s = new Store({ items: [{ id: 1 }, { id: 2 }] })
    let fired = false
    s.observe('items', () => {
      fired = true
    })
    ;(s as any).items[0] = { id: 99 }
    await flush()
    assert.equal(fired, true)
  })
  it('deep mutation on array object fires observer', async () => {
    const s = new Store({ items: [{ x: { y: 1 } }] })
    let fired = false
    s.observe('items', () => {
      fired = true
    })
    ;(s as any).items[0].x.y = 2
    await flush()
    assert.equal(fired, true)
  })
})

describe('Store – array method coverage', () => {
  it('pop emits a change', async () => {
    const s = new Store({ arr: [1, 2, 3] })
    let fired = false
    s.observe('arr', () => {
      fired = true
    })
    ;(s as any).arr.pop()
    await flush()
    assert.equal(fired, true)
  })
  it('shift emits a change', async () => {
    const s = new Store({ arr: [1, 2, 3] })
    let fired = false
    s.observe('arr', () => {
      fired = true
    })
    ;(s as any).arr.shift()
    await flush()
    assert.equal(fired, true)
  })
  it('unshift emits a change', async () => {
    const s = new Store({ arr: [1, 2, 3] })
    let fired = false
    s.observe('arr', () => {
      fired = true
    })
    ;(s as any).arr.unshift(0)
    await flush()
    assert.equal(fired, true)
  })
  it('sort emits a change', async () => {
    const s = new Store({ arr: [3, 1, 2] })
    let fired = false
    s.observe('arr', () => {
      fired = true
    })
    ;(s as any).arr.sort()
    await flush()
    assert.equal(fired, true)
  })
  it('reverse emits a change', async () => {
    const s = new Store({ arr: [1, 2, 3] })
    let fired = false
    s.observe('arr', () => {
      fired = true
    })
    ;(s as any).arr.reverse()
    await flush()
    assert.equal(fired, true)
  })
})

describe('Store – flushSync / silent interaction', () => {
  it('observer triggering another write schedules next flush', async () => {
    const s = new Store({ x: 1, y: 10 })
    const seen: any[] = []
    s.observe('x', (v: any) => {
      seen.push(`x=${v}`)
      if (v === 2) (s as any).y = 99
    })
    s.observe('y', (v: any) => seen.push(`y=${v}`))
    ;(s as any).x = 2
    await flush()
    await flush()
    await flush()
    assert.ok(seen.includes('x=2'), 'x=2 seen: ' + JSON.stringify(seen))
  })
  it('silent() suppresses only enclosed changes', async () => {
    const s = new Store({ x: 1 })
    const seen: any[] = []
    s.observe('x', (v: any) => seen.push(v))
    s.silent(() => {
      ;(s as any).x = 99
    })
    ;(s as any).x = 42
    await flush()
    assert.deepEqual(seen, [42])
  })
})

describe('Store – Static.flushAll', () => {
  it('drains pending changes across stores', () => {
    const a = new Store({ v: 1 })
    const b = new Store({ v: 1 })
    const seen: any[] = []
    a.observe('v', (v: any) => seen.push(`a=${v}`))
    b.observe('v', (v: any) => seen.push(`b=${v}`))
    ;(a as any).v = 10
    ;(b as any).v = 20
    Store.flushAll()
    assert.ok(seen.includes('a=10'))
    assert.ok(seen.includes('b=20'))
  })
})

describe('Store – symbols and GEA_STORE_ROOT', () => {
  it('assigning symbol props bypasses observers', async () => {
    const s = new Store({ x: 1 })
    let count = 0
    s.observe('x', () => count++)
    const sym = Symbol('meta')
    ;(s as any)[sym] = 'hidden'
    await flush()
    assert.equal(count, 0)
    assert.equal((s as any)[sym], 'hidden')
  })
})
