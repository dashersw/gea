import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseQuery } from '../src/router/query'

describe('parseQuery', () => {
  it('returns empty object for empty string', () => {
    assert.deepEqual(parseQuery(''), {})
  })

  it('returns empty object for bare "?"', () => {
    assert.deepEqual(parseQuery('?'), {})
  })

  it('parses single param', () => {
    assert.deepEqual(parseQuery('?foo=bar'), { foo: 'bar' })
  })

  it('parses multiple params', () => {
    assert.deepEqual(parseQuery('?a=1&b=2'), { a: '1', b: '2' })
  })

  it('works without leading "?"', () => {
    assert.deepEqual(parseQuery('foo=bar'), { foo: 'bar' })
  })

  it('handles empty value (key=)', () => {
    assert.deepEqual(parseQuery('?key='), { key: '' })
  })

  it('handles missing value (key only)', () => {
    assert.deepEqual(parseQuery('?key'), { key: '' })
  })

  it('collects repeated keys into an array', () => {
    assert.deepEqual(parseQuery('?tag=a&tag=b&tag=c'), { tag: ['a', 'b', 'c'] })
  })

  it('mixes single and repeated keys', () => {
    assert.deepEqual(parseQuery('?x=1&y=2&x=3'), { x: ['1', '3'], y: '2' })
  })

  it('decodes URI-encoded values', () => {
    assert.deepEqual(parseQuery('?msg=hello%20world&key=a%26b'), {
      msg: 'hello world',
      key: 'a&b',
    })
  })

  it('decodes URI-encoded keys', () => {
    assert.deepEqual(parseQuery('?hello%20world=1'), { 'hello world': '1' })
  })

  it('handles value with equals sign', () => {
    assert.deepEqual(parseQuery('?expr=a%3Db'), { expr: 'a=b' })
  })

  it('handles value containing literal equals sign', () => {
    assert.deepEqual(parseQuery('?data=a=b=c'), { data: 'a=b=c' })
  })

  it('skips empty segments from double ampersand', () => {
    assert.deepEqual(parseQuery('?a=1&&b=2'), { a: '1', b: '2' })
  })
})
