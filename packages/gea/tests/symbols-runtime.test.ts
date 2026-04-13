/**
 * Coverage for GEA_* symbol exports after Phase 4 cleanup.
 *
 * The closure-compiled runtime ships only 8 well-known symbols — 6 identity +
 * 1 proxy-detect + 1 protocol. This test locks that count and asserts each is a
 * registered Symbol.for() entry.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as syms from '../src/runtime/symbols'

const expected = [
  'GEA_ELEMENT',
  'GEA_STORE_ROOT',
  'GEA_PROXY_RAW',
  'GEA_DOM_COMPONENT',
  'GEA_PARENT_COMPONENT',
  'GEA_ITEM_KEY',
  'GEA_PROXY_IS_PROXY',
  'GEA_CREATE_TEMPLATE',
]

describe('Symbols — 8-survivor surface', () => {
  for (const name of expected) {
    it(`exports ${name} as a Symbol`, () => {
      assert.equal(typeof (syms as any)[name], 'symbol', `${name} should be a symbol`)
    })
  }

  it('all 8 symbols are distinct', () => {
    const s = new Set(expected.map((n) => (syms as any)[n]))
    assert.equal(s.size, expected.length)
  })

  it('each symbol uses Symbol.for()', () => {
    for (const name of expected) {
      const sym = (syms as any)[name] as symbol
      assert.ok(Symbol.keyFor(sym), `${name} should be registered with Symbol.for`)
    }
  })
})
