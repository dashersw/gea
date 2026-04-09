import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cloneStoreData } from '../src/ssr-context.ts'

/**
 * Tests that cloneStoreData fails fast on unsupported types
 * instead of silently dropping them.
 */

describe('cloneStoreData – fail fast on unsupported types', () => {
  it('clones primitive values correctly', () => {
    const store = { count: 42, name: 'test', active: true, empty: null }
    Object.defineProperty(store, 'count', { value: 42, writable: true, enumerable: true, configurable: true })
    Object.defineProperty(store, 'name', { value: 'test', writable: true, enumerable: true, configurable: true })
    Object.defineProperty(store, 'active', { value: true, writable: true, enumerable: true, configurable: true })
    Object.defineProperty(store, 'empty', { value: null, writable: true, enumerable: true, configurable: true })

    const cloned = cloneStoreData(store)
    assert.equal(cloned.count, 42)
    assert.equal(cloned.name, 'test')
    assert.equal(cloned.active, true)
    assert.equal(cloned.empty, null)
  })

  it('deep-clones nested objects (not shared references)', () => {
    const nested = { x: 1 }
    const store = Object.create(null)
    Object.defineProperty(store, 'data', { value: nested, writable: true, enumerable: true, configurable: true })

    const cloned = cloneStoreData(store)
    assert.deepEqual(cloned.data, { x: 1 })
    // Must be a deep copy, not same reference
    assert.notEqual(cloned.data, nested)
  })

  it('throws on Map values instead of silently dropping', () => {
    const store = Object.create(null)
    Object.defineProperty(store, 'data', {
      value: new Map([['a', 1]]),
      writable: true,
      enumerable: true,
      configurable: true,
    })

    assert.throws(
      () => cloneStoreData(store),
      (err: Error) => err.message.includes('data'),
      'Must throw with property name in error message',
    )
  })

  it('throws on Set values instead of silently dropping', () => {
    const store = Object.create(null)
    Object.defineProperty(store, 'data', {
      value: new Set([1, 2, 3]),
      writable: true,
      enumerable: true,
      configurable: true,
    })

    assert.throws(
      () => cloneStoreData(store),
      (err: Error) => err.message.includes('data'),
      'Must throw with property name in error message',
    )
  })

  it('throws on symbol values instead of silently dropping', () => {
    const store = Object.create(null)
    Object.defineProperty(store, 'tag', {
      value: Symbol('test'),
      writable: true,
      enumerable: true,
      configurable: true,
    })

    assert.throws(
      () => cloneStoreData(store),
      (err: Error) => err.message.includes('tag'),
      'Must throw with property name in error message',
    )
  })

  it('skips functions without error (existing behavior)', () => {
    const store = Object.create(null)
    Object.defineProperty(store, 'count', { value: 5, writable: true, enumerable: true, configurable: true })
    Object.defineProperty(store, 'increment', { value: () => {}, writable: true, enumerable: true, configurable: true })

    const cloned = cloneStoreData(store)
    assert.equal(cloned.count, 5)
    assert.equal(cloned.increment, undefined)
  })

  it('clones underscore-shaped user fields', () => {
    const store = Object.create(null)
    Object.defineProperty(store, '_private', { value: 'secret', writable: true, enumerable: true, configurable: true })
    Object.defineProperty(store, 'visible', { value: 'yes', writable: true, enumerable: true, configurable: true })

    const cloned = cloneStoreData(store)
    assert.equal(cloned._private, 'secret')
    assert.equal(cloned.visible, 'yes')
  })
})

describe('cloneStoreData – deep structures', () => {
  it('clones deeply nested objects (5 levels) with independence', () => {
    const store = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: 'deep-value',
            },
          },
        },
      },
    }
    const result = cloneStoreData(store)
    const l1 = result.level1 as Record<string, unknown>
    const l2 = l1.level2 as Record<string, unknown>
    const l3 = l2.level3 as Record<string, unknown>
    const l4 = l3.level4 as Record<string, unknown>
    assert.equal(l4.level5, 'deep-value')

    // Verify deep independence
    l4.level5 = 'mutated'
    assert.equal(store.level1.level2.level3.level4.level5, 'deep-value')
  })

  it('clones arrays of objects with independence', () => {
    const store = {
      items: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ],
    }
    const result = cloneStoreData(store)
    const items = result.items as Array<Record<string, unknown>>
    assert.equal(items.length, 2)
    assert.equal(items[0].id, 1)
    items[0].name = 'mutated'
    assert.equal(store.items[0].name, 'a', 'original unchanged')
  })

  it('clones Date objects preserving time', () => {
    const date = new Date('2026-01-15T10:30:00Z')
    const store = { created: date }
    const result = cloneStoreData(store)
    assert.ok(result.created instanceof Date)
    assert.equal((result.created as Date).getTime(), date.getTime())
    assert.notEqual(result.created, date, 'different Date instance')
  })

  it('handles mixed nested structure with arrays and objects', () => {
    const store = {
      config: {
        tags: ['alpha', 'beta'],
        settings: { theme: 'dark', sizes: [10, 20, 30] },
      },
    }
    const result = cloneStoreData(store)
    const config = result.config as Record<string, unknown>
    const tags = config.tags as string[]
    assert.deepEqual(tags, ['alpha', 'beta'])
    const settings = config.settings as Record<string, unknown>
    assert.equal(settings.theme, 'dark')
    assert.deepEqual(settings.sizes, [10, 20, 30])
  })
})
