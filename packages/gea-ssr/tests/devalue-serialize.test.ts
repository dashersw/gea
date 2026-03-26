import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { serializeStores } from '../src/serialize.ts'

describe('devalue-based serialization', () => {
  it('round-trips Date objects', () => {
    const store: Record<string, unknown> = { createdAt: new Date('2025-06-15T10:30:00Z') }
    const result = serializeStores([store], { myStore: store })
    assert.ok(result.includes('new Date'), 'should serialize Date as constructor')
  })

  it('round-trips Map', () => {
    const store: Record<string, unknown> = { lookup: new Map([['a', 1]]) }
    const result = serializeStores([store], { myStore: store })
    assert.ok(result.includes('new Map'), 'should serialize Map as constructor')
  })

  it('round-trips Set', () => {
    const store: Record<string, unknown> = { tags: new Set(['x', 'y']) }
    const result = serializeStores([store], { myStore: store })
    assert.ok(result.includes('new Set'), 'should serialize Set as constructor')
  })

  it('handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { name: 'root' }
    obj.self = obj
    const store: Record<string, unknown> = { circular: obj }
    const result = serializeStores([store], { myStore: store })
    assert.ok(typeof result === 'string')
  })

  it('escapes </script> for safe embedding', () => {
    const store: Record<string, unknown> = { xss: '</script><script>alert(1)</script>' }
    const result = serializeStores([store], { myStore: store })
    assert.ok(!result.includes('</script>'), 'must escape closing script tags')
  })

  it('still filters internal props and functions', () => {
    const store: Record<string, unknown> = {
      _internal: 'hidden',
      visible: 'shown',
      method: () => {},
      constructor: Object,
    }
    const result = serializeStores([store], { myStore: store })
    assert.ok(!result.includes('_internal'))
    assert.ok(!result.includes('method'))
    assert.ok(result.includes('shown'))
  })
})
