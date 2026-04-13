/**
 * Array derivation helpers on proxied store arrays: filter / find / etc. must see
 * proxied item objects so nested writes still notify the store.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../src/store'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('Store – array derivations (filter, find, …)', () => {
  it('filter callback receives live row objects; mutating the chosen row updates the store', async () => {
    const s = new Store({ xs: [{ v: 1 }, { v: 2 }, { v: 3 }] }) as { xs: Array<{ v: number }> }
    const row = s.xs.filter((x) => x.v === 1)[0]
    row.v = 99
    await flush()
    assert.equal(s.xs[0].v, 99)
  })

  it('find returns a proxied item; write propagates to the backing array', async () => {
    const s = new Store({ items: [{ id: 'a', n: 0 }] }) as { items: Array<{ id: string; n: number }> }
    const hit = s.items.find((x) => x.id === 'a')
    assert.ok(hit)
    hit!.n = 7
    await flush()
    assert.equal(s.items[0].n, 7)
  })

  it('map() over a store array is a real array; indexed writes still go through the root array proxy', () => {
    const s = new Store({ data: [10, 20] }) as { data: number[] }
    const doubled = s.data.map((n) => n * 2)
    assert.ok(Array.isArray(doubled))
    assert.deepEqual(doubled, [20, 40])
  })
})
