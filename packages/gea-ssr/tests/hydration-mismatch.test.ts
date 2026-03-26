import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { detectHydrationMismatch } from '../src/mismatch.ts'

let dom: JSDOM
let previousDocument: unknown

beforeEach(() => {
  dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>')
  previousDocument = globalThis.document
  Object.defineProperty(globalThis, 'document', {
    value: dom.window.document,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'document', {
    value: previousDocument,
    writable: true,
    configurable: true,
  })
  dom?.window?.close()
})

describe('detectHydrationMismatch', () => {
  it('returns null when HTML matches', () => {
    const element = document.getElementById('app')!
    element.innerHTML = '<div><p>hello</p></div>'
    const result = detectHydrationMismatch(element, '<div><p>hello</p></div>')
    assert.equal(result, null)
  })

  it('returns mismatch info when HTML differs', () => {
    const element = document.getElementById('app')!
    element.innerHTML = '<div><p>server</p></div>'
    const result = detectHydrationMismatch(element, '<div><p>client</p></div>')
    assert.notEqual(result, null)
    assert.ok(result!.server.includes('server'))
    assert.ok(result!.client.includes('client'))
  })

  it('normalizes whitespace for comparison', () => {
    const element = document.getElementById('app')!
    element.innerHTML = '<div>  <p>hello</p>  </div>'
    const result = detectHydrationMismatch(element, '<div><p>hello</p></div>')
    assert.equal(result, null, 'whitespace differences should be ignored')
  })
})
