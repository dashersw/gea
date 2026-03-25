import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { Toaster } from '../src/components/toast'

test('Toast: _createToastElement prevents XSS via description', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window as any
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement

  // We can test the Toaster component directly
  const toaster = new Toaster()
  
  const maliciousPayload = "<img src=x onerror='window.xssDetected=true'>"
  const toastData = {
    id: 'test-toast',
    title: 'Safe Title',
    description: maliciousPayload
  }

  // @ts-ignore - access to internal method
  const el = toaster._createToastElement(toastData)

  // In JSDOM, when assigning textContent, the string is not parsed as HTML.
  // We check that the malicious img tag is NOT present as an element.
  const img = el.querySelector('img')
  assert.equal(img, null, 'Malicious img tag should NOT be rendered')
  
  const descEl = el.querySelector('[data-part="description"]')
  assert.ok(descEl, 'Description element should exist')
  assert.equal(descEl.textContent, maliciousPayload, 'Payload should be rendered as plain text')

  // Cleanup
  dom.window.close()
  delete (globalThis as any).window
  delete (globalThis as any).document
  delete (globalThis as any).HTMLElement
})
