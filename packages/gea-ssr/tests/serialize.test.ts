import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { serializeStores } from '../src/serialize.ts'
import type { GeaStore } from '../src/types.ts'

/** Evaluate a devalue.uneval() output string back into a JS object */
function evaluate(expr: string): unknown {
  return new Function('return ' + expr)()
}

describe('serializeStores', () => {
  it('serializes primitive store properties', () => {
    const store = { count: 42, name: 'test', active: true }
    const result = serializeStores([store], { CountStore: store })
    const parsed = evaluate(result) as Record<string, Record<string, unknown>>
    assert.deepEqual(parsed.CountStore, { count: 42, name: 'test', active: true })
  })

  it('serializes nested objects and arrays', () => {
    const store = { todos: [{ id: 1, text: 'hello' }], filter: 'all' }
    const result = serializeStores([store], { TodoStore: store })
    const parsed = evaluate(result) as Record<string, Record<string, unknown>>
    assert.deepEqual(parsed.TodoStore.todos, [{ id: 1, text: 'hello' }])
  })

  it('skips functions and methods', () => {
    const store = { count: 1, increment() {} }
    const result = serializeStores([store], { S: store })
    const parsed = evaluate(result) as Record<string, Record<string, unknown>>
    assert.equal(parsed.S.count, 1)
    assert.equal(parsed.S.increment, undefined)
  })

  it('skips private fields starting with _', () => {
    const store: GeaStore = { _internal: 'secret', visible: 'yes' }
    const result = serializeStores([store], { S: store })
    const parsed = evaluate(result) as Record<string, Record<string, unknown>>
    assert.equal(parsed.S._internal, undefined)
    assert.equal(parsed.S.visible, 'yes')
  })

  it('skips fields ending with _', () => {
    const store: GeaStore = { element_: {}, rendered_: true, name: 'ok' }
    const result = serializeStores([store], { S: store })
    const parsed = evaluate(result) as Record<string, Record<string, unknown>>
    assert.equal(parsed.S.element_, undefined)
    assert.equal(parsed.S.rendered_, undefined)
    assert.equal(parsed.S.name, 'ok')
  })

  it('handles circular references gracefully', () => {
    const store: GeaStore = { name: 'test' }
    store.self = store
    const result = serializeStores([store], { S: store })
    const parsed = evaluate(result) as Record<string, Record<string, unknown>>
    assert.equal(parsed.S.name, 'test')
    // devalue preserves circular refs — the inner object's self points back to itself
    assert.equal(parsed.S.self.self, parsed.S.self)
  })

  it('escapes HTML-unsafe characters in output', () => {
    const store = { html: '</script><img onerror=alert(1)>' }
    const result = serializeStores([store], { S: store })
    assert.ok(!result.includes('</script>'))
  })

  it('preserves Date, Map, Set, URL types', () => {
    const store = { data: new Map([['a', 1]]), link: new URL('https://example.com') }
    const registry = { TestStore: store }
    const result = serializeStores([store], registry)
    const parsed = evaluate(result) as Record<string, Record<string, unknown>>
    assert.ok(parsed.TestStore.data instanceof Map, 'Map should be preserved')
    assert.ok(parsed.TestStore.link instanceof URL, 'URL should be preserved')
  })

  it('skips __proto__ key to prevent prototype pollution', () => {
    const store: GeaStore = Object.create(null)
    Object.defineProperty(store, '__proto__', {
      value: 'malicious',
      enumerable: true,
      configurable: true,
    })
    store.safe = 'value'
    const result = serializeStores([store], { S: store })
    const parsed = evaluate(result) as Record<string, Record<string, unknown>>
    assert.equal(parsed.S.safe, 'value')
    assert.equal(Object.hasOwn(parsed.S, '__proto__'), false,
      '__proto__ key should not appear as own property in serialized output')
  })

  it('handles empty store registry', () => {
    const result = serializeStores([], {})
    const parsed = evaluate(result) as Record<string, unknown>
    assert.deepEqual(parsed, {})
  })
})
