import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matchRoute } from '../src/router/match'

describe('matchRoute', () => {
  it('matches root path', () => {
    const result = matchRoute('/', '/')
    assert.ok(result)
    assert.deepEqual(result.params, {})
    assert.equal(result.pattern, '/')
  })

  it('matches a static segment', () => {
    const result = matchRoute('/about', '/about')
    assert.ok(result)
    assert.deepEqual(result.params, {})
  })

  it('matches multi-segment static path', () => {
    const result = matchRoute('/docs/intro', '/docs/intro')
    assert.ok(result)
    assert.deepEqual(result.params, {})
  })

  it('returns null for non-matching static path', () => {
    assert.equal(matchRoute('/about', '/contact'), null)
  })

  it('returns null when segment counts differ (no wildcard)', () => {
    assert.equal(matchRoute('/a/b', '/a'), null)
    assert.equal(matchRoute('/a', '/a/b'), null)
  })

  it('extracts a single named param', () => {
    const result = matchRoute('/users/:id', '/users/42')
    assert.ok(result)
    assert.equal(result.params.id, '42')
  })

  it('extracts multiple named params', () => {
    const result = matchRoute('/users/:userId/posts/:postId', '/users/7/posts/99')
    assert.ok(result)
    assert.equal(result.params.userId, '7')
    assert.equal(result.params.postId, '99')
  })

  it('decodes URI-encoded param values', () => {
    const result = matchRoute('/search/:query', '/search/hello%20world')
    assert.ok(result)
    assert.equal(result.params.query, 'hello world')
  })

  it('returns null when param segment is missing', () => {
    assert.equal(matchRoute('/users/:id/posts', '/users/42'), null)
  })

  it('matches wildcard at the end', () => {
    const result = matchRoute('/files/*', '/files/docs/readme.md')
    assert.ok(result)
    assert.equal(result.params['*'], 'docs/readme.md')
  })

  it('wildcard matches empty rest', () => {
    const result = matchRoute('/files/*', '/files')
    assert.ok(result)
    assert.equal(result.params['*'], '')
  })

  it('wildcard with prefix params', () => {
    const result = matchRoute('/repo/:owner/*', '/repo/dashersw/src/index.ts')
    assert.ok(result)
    assert.equal(result.params.owner, 'dashersw')
    assert.equal(result.params['*'], 'src/index.ts')
  })

  it('returns null when wildcard prefix does not match', () => {
    assert.equal(matchRoute('/files/*', '/images/photo.png'), null)
  })
})
