import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../src/store'
import { GEA_PROXY_RAW, GEA_STORE_ROOT } from '../src/symbols'

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('Store – user field names that look internal', () => {
  it('observes double-underscore, single-underscore, and trailing-underscore fields', async () => {
    const s = new Store({ __stack: [] as string[], _draft: '', name_: 'A' }) as any
    const seen: string[] = []
    s.observe('__stack', () => seen.push('__stack'))
    s.observe('_draft', () => seen.push('_draft'))
    s.observe('name_', () => seen.push('name_'))

    s.__stack.push('x')
    s._draft = 'hello'
    s.name_ = 'B'
    await flush()

    assert.deepEqual(seen.sort(), ['__stack', '_draft', 'name_'].sort())
  })

  it('treats props and handlers as normal reactive user data', async () => {
    const s = new Store({ props: { label: 'a' }, handlers: { click: 1 } }) as any
    const seen: string[] = []
    s.observe('props', () => seen.push('props'))
    s.observe('handlers', () => seen.push('handlers'))

    s.props.label = 'b'
    s.handlers = { click: 2 }
    await flush()

    assert.deepEqual(seen.sort(), ['handlers', 'props'])
  })

  it('keeps root observers working for internal-looking fields', async () => {
    const s = new Store({ __stack: [] as string[] }) as any
    const changes: string[] = []
    s.observe([], (_value: unknown, batch) => {
      for (const change of batch) changes.push(change.prop)
    })

    s.__stack = ['a']
    await flush()

    assert.deepEqual(changes, ['__stack'])
  })
})

describe('Store – proxy values and cache invalidation', () => {
  it('unwraps proxy values assigned to root properties', () => {
    const source = new Store({ item: { id: 'a' } }) as any
    const target = new Store({ item: null as any }) as any

    target.item = source.item

    assert.equal(target[GEA_PROXY_RAW].item, source.item[GEA_PROXY_RAW])
  })

  it('unwraps proxy values inserted by array mutators', () => {
    const source = new Store({ item: { id: 'a' }, other: { id: 'b' } }) as any
    const target = new Store({ items: [] as Array<{ id: string }> }) as any

    target.items.push(source.item)
    target.items.unshift(source.other)
    target.items.splice(1, 0, source.item)

    assert.equal(target[GEA_PROXY_RAW].items[0], source.other[GEA_PROXY_RAW])
    assert.equal(target[GEA_PROXY_RAW].items[1], source.item[GEA_PROXY_RAW])
    assert.equal(target[GEA_PROXY_RAW].items[2], source.item[GEA_PROXY_RAW])
  })

  it('returns a fresh nested proxy after replacing an object property', () => {
    const s = new Store({ obj: { a: 1 } }) as any
    const first = s.obj
    s.obj = { a: 2 }
    const second = s.obj

    assert.notEqual(first, second)
    assert.equal(second.a, 2)
  })

  it('returns a fresh nested proxy after deleting and re-adding an object property', () => {
    const s = new Store({ obj: { a: 1 } }) as any
    const first = s.obj
    delete s.obj
    s.obj = { a: 3 }

    assert.notEqual(s.obj, first)
    assert.equal(s.obj.a, 3)
  })
})

describe('Store – array mutation metadata edge cases', () => {
  it('reports append metadata for push with multiple items', async () => {
    const s = new Store({ items: [1] }) as any
    const batches: any[][] = []
    s.observe('items', (_value, changes) => batches.push(changes))

    s.items.push(2, 3)
    await flush()

    assert.equal(batches[0][0].type, 'append')
    assert.equal(batches[0][0].start, 1)
    assert.equal(batches[0][0].count, 2)
  })

  it('reports remove metadata for pop, shift, and splice removals', async () => {
    const s = new Store({ items: [1, 2, 3, 4] }) as any
    const changes: any[] = []
    s.observe('items', (_value, batch) => changes.push(...batch))

    s.items.pop()
    s.items.shift()
    s.items.splice(1, 1)
    await flush()

    assert.deepEqual(
      changes.map((change) => [change.type, change.start, change.count]),
      [
        ['remove', 3, 1],
        ['remove', 0, 1],
        ['remove', 1, 1],
      ],
    )
  })

  it('reports reorder metadata for unshift, sort, reverse, and same-length splice', async () => {
    const s = new Store({ items: [3, 1, 2] }) as any
    const types: string[] = []
    s.observe('items', (_value, batch) => {
      for (const change of batch) types.push(change.type)
    })

    s.items.unshift(0)
    s.items.sort()
    s.items.reverse()
    s.items.splice(1, 1, 9)
    await flush()

    assert.deepEqual(types, ['reorder', 'reorder', 'reorder', 'reorder'])
  })

  it('observes array paths and resolves the nested value at delivery time', async () => {
    const s = new Store({ rows: [{ title: 'A' }] }) as any
    const seen: string[] = []
    s.observe(['rows', '0', 'title'], (value) => seen.push(value))

    s.rows[0].title = 'B'
    await flush()

    assert.deepEqual(seen, ['B'])
  })

  it('observes dotted string paths for nested object mutations', async () => {
    const s = new Store({ user: { profile: { name: 'Ada' } } }) as any
    const seen: string[] = []
    s.observe('user.profile.name', (value) => seen.push(value))

    s.user.profile.name = 'Grace'
    await flush()

    assert.deepEqual(seen, ['Grace'])
  })

  it('observes dotted string paths when the parent object is replaced', async () => {
    const s = new Store({ user: { profile: { name: 'Ada' } } }) as any
    const seen: string[] = []
    s.observe('user.profile.name', (value) => seen.push(value))

    s.user = { profile: { name: 'Grace' } }
    await flush()

    assert.deepEqual(seen, ['Grace'])
  })
})

describe('Store – descriptors, symbols, silent, and flushSync', () => {
  it('notifies when Object.defineProperty creates or replaces a data property', async () => {
    const s = new Store({ value: 1 }) as any
    const seen: number[] = []
    s.observe('value', (value) => seen.push(value))

    Object.defineProperty(s, 'value', { value: 2, configurable: true, enumerable: true, writable: true })
    await flush()

    assert.deepEqual(seen, [2])
  })

  it('symbol set/delete bypass observers but preserve symbol values', async () => {
    const s = new Store({ value: 1 }) as any
    const sym = Symbol('user')
    let count = 0
    s.observe('value', () => count++)

    s[sym] = 123
    assert.equal(s[sym], 123)
    delete s[sym]
    await flush()

    assert.equal(count, 0)
    assert.equal(sym in s, false)
  })

  it('GEA_STORE_ROOT on raw target points at the live proxy', () => {
    const s = new Store({ value: 1 }) as any
    const raw = s[GEA_PROXY_RAW]

    raw[GEA_STORE_ROOT].value = 4

    assert.equal(s.value, 4)
  })

  it('silent clears pending notifications and later writes still notify', async () => {
    const s = new Store({ value: 0 }) as any
    const seen: number[] = []
    s.observe('value', (value) => seen.push(value))

    s.value = 1
    s.silent(() => {
      s.value = 2
    })
    await flush()
    s.value = 3
    await flush()

    assert.deepEqual(seen, [3])
  })

  it('flushSync drains pending changes for the current store only', () => {
    const a = new Store({ value: 0 }) as any
    const b = new Store({ value: 0 }) as any
    const seen: string[] = []
    a.observe('value', (value) => seen.push(`a=${value}`))
    b.observe('value', (value) => seen.push(`b=${value}`))

    a.value = 1
    b.value = 2
    a.flushSync()

    assert.deepEqual(seen, ['a=1'])
  })
})
