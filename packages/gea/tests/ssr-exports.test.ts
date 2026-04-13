/**
 * Verify SSR bridge exports remain stable (imported by @geajs/ssr).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as ssr from '../src/ssr'

describe('SSR bridge exports', () => {
  it('re-exports resetUidCounter', () => {
    assert.equal(typeof ssr.resetUidCounter, 'function')
  })
  it('re-exports setUidProvider', () => {
    assert.equal(typeof ssr.setUidProvider, 'function')
  })
  it('re-exports clearUidProvider', () => {
    assert.equal(typeof ssr.clearUidProvider, 'function')
  })
  it('re-exports findPropertyDescriptor', () => {
    assert.equal(typeof ssr.findPropertyDescriptor, 'function')
  })
  it('re-exports isClassConstructorValue', () => {
    assert.equal(typeof ssr.isClassConstructorValue, 'function')
  })
  it('re-exports samePathParts', () => {
    assert.equal(typeof ssr.samePathParts, 'function')
  })
  it('re-exports rootGetValue', () => {
    assert.equal(typeof ssr.rootGetValue, 'function')
  })
  it('re-exports rootSetValue', () => {
    assert.equal(typeof ssr.rootSetValue, 'function')
  })
  it('re-exports root proxy factory bridge', () => {
    assert.equal(typeof ssr.GEA_ROOT_PROXY_HANDLER_FACTORY, 'symbol')
    assert.equal(typeof ssr.getRootProxyHandlerFactory, 'function')
    assert.equal(typeof ssr.setRootProxyHandlerFactory, 'function')
  })
})

describe('SSR helper behavior', () => {
  it('samePathParts returns true for equal arrays', () => {
    assert.equal(ssr.samePathParts(['a', 'b'], ['a', 'b']), true)
  })
  it('samePathParts returns false for different arrays', () => {
    assert.equal(ssr.samePathParts(['a'], ['b']), false)
  })
  it('samePathParts returns false for different lengths', () => {
    assert.equal(ssr.samePathParts(['a'], ['a', 'b']), false)
  })
  it('isClassConstructorValue returns true for classes', () => {
    class Foo {}
    assert.equal(ssr.isClassConstructorValue(Foo), true)
  })
  it('isClassConstructorValue returns false for arrow fns', () => {
    assert.equal(
      ssr.isClassConstructorValue(() => {}),
      false,
    )
  })
  it('isClassConstructorValue returns false for plain functions', () => {
    assert.equal(
      ssr.isClassConstructorValue(function plain() {}),
      false,
    )
  })
  it('isClassConstructorValue returns false for non-function values', () => {
    assert.equal(ssr.isClassConstructorValue(42), false)
    assert.equal(ssr.isClassConstructorValue(null), false)
    assert.equal(ssr.isClassConstructorValue({}), false)
  })
  it('findPropertyDescriptor finds own properties', () => {
    const o: any = { x: 1 }
    const d = ssr.findPropertyDescriptor(o, 'x')
    assert.ok(d)
  })
  it('findPropertyDescriptor finds inherited properties', () => {
    class P {
      get y() {
        return 2
      }
    }
    class C extends P {}
    const c: any = new C()
    const d = ssr.findPropertyDescriptor(c, 'y')
    assert.ok(d)
    assert.ok(d!.get)
  })
  it('findPropertyDescriptor returns undefined for unknown', () => {
    const o: any = { x: 1 }
    assert.equal(ssr.findPropertyDescriptor(o, 'nope'), undefined)
  })
  it('sets and restores the root proxy handler factory', () => {
    const original = ssr.getRootProxyHandlerFactory()
    const factory = () => ({})
    ssr.setRootProxyHandlerFactory(factory)
    assert.equal(ssr.getRootProxyHandlerFactory(), factory)
    ssr.setRootProxyHandlerFactory(original)
  })
})
