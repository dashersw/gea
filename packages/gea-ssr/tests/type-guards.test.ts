import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isRecord,
  isComponentConstructor,
  isRouteGroup,
  isInternalProp,
  flattenHeaders,
} from '../src/types.ts'

describe('isRecord()', () => {
  it('returns true for plain objects', () => {
    assert.equal(isRecord({}), true)
    assert.equal(isRecord({ a: 1 }), true)
  })

  it('returns true for Object.create(null)', () => {
    assert.equal(isRecord(Object.create(null)), true)
  })

  it('returns false for arrays', () => {
    assert.equal(isRecord([]), false)
    assert.equal(isRecord([1, 2]), false)
  })

  it('returns false for null and primitives', () => {
    assert.equal(isRecord(null), false)
    assert.equal(isRecord(undefined), false)
    assert.equal(isRecord(42), false)
    assert.equal(isRecord('string'), false)
    assert.equal(isRecord(true), false)
  })

  it('returns false for class instances', () => {
    assert.equal(isRecord(new Date()), false)
    assert.equal(isRecord(new Map()), false)
  })
})

describe('isComponentConstructor()', () => {
  it('returns true for functions (constructors)', () => {
    class Comp { props = {}; template() { return '' } }
    assert.equal(isComponentConstructor(Comp), true)
  })

  it('returns false for objects and strings', () => {
    assert.equal(isComponentConstructor({ children: {} }), false)
    assert.equal(isComponentConstructor('/redirect'), false)
  })
})

describe('isRouteGroup()', () => {
  it('returns true for objects with children property', () => {
    class Page {}
    assert.equal(isRouteGroup({ children: { '/a': Page } }), true)
  })

  it('returns false for functions and strings', () => {
    class Page {}
    assert.equal(isRouteGroup(Page), false)
    assert.equal(isRouteGroup('/redirect'), false)
  })
})

describe('isInternalProp()', () => {
  it('returns true for underscore-prefixed keys', () => {
    assert.equal(isInternalProp('_private'), true)
  })

  it('returns true for underscore-suffixed keys', () => {
    assert.equal(isInternalProp('element_'), true)
  })

  it('returns false for normal keys', () => {
    assert.equal(isInternalProp('count'), false)
    assert.equal(isInternalProp('name'), false)
  })

  it('returns true for single underscore', () => {
    assert.equal(isInternalProp('_'), true)
  })
})

describe('flattenHeaders()', () => {
  it('passes through string values unchanged', () => {
    const result = flattenHeaders({ 'content-type': 'text/html' })
    assert.equal(result['content-type'], 'text/html')
  })

  it('joins array values with comma-space', () => {
    const result = flattenHeaders({ 'accept': ['text/html', 'application/json'] })
    assert.equal(result['accept'], 'text/html, application/json')
  })

  it('omits undefined values', () => {
    const result = flattenHeaders({ 'x-real': 'yes', 'x-missing': undefined })
    assert.equal(result['x-real'], 'yes')
    assert.equal('x-missing' in result, false)
  })

  it('handles empty headers object', () => {
    const result = flattenHeaders({})
    assert.deepEqual(result, {})
  })
})
