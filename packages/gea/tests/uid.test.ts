import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import getUid from '../src/component/uid'

describe('getUid', () => {
  it('returns a string', () => {
    assert.equal(typeof getUid(), 'string')
  })

  it('returns unique values on successive calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) ids.add(getUid())
    assert.equal(ids.size, 1000)
  })

  it('returns base-36 encoded strings', () => {
    const id = getUid()
    assert.ok(/^[0-9a-z]+$/.test(id), `Expected base-36 string, got "${id}"`)
  })
})
