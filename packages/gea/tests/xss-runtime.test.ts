/**
 * Coverage for XSS helpers: escapeHtml and sanitizeAttr.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { escapeHtml, sanitizeAttr } from '../src/xss'

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b')
  })
  it('escapes less-than', () => {
    assert.equal(escapeHtml('<'), '&lt;')
  })
  it('escapes greater-than', () => {
    assert.equal(escapeHtml('>'), '&gt;')
  })
  it('escapes double-quote', () => {
    assert.equal(escapeHtml('"'), '&quot;')
  })
  it('escapes single-quote', () => {
    assert.equal(escapeHtml("'"), '&#39;')
  })
  it('handles null', () => {
    assert.equal(escapeHtml(null), '')
  })
  it('handles undefined', () => {
    assert.equal(escapeHtml(undefined), '')
  })
  it('handles numbers', () => {
    assert.equal(escapeHtml(42), '42')
  })
  it('concatenates arrays without escaping tags', () => {
    assert.equal(escapeHtml(['<li>a</li>', '<li>b</li>']), '<li>a</li><li>b</li>')
  })
  it('escapes empty string to empty', () => {
    assert.equal(escapeHtml(''), '')
  })
  it('escapes all specials together', () => {
    assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
  })
  it('arrays concatenate strings verbatim (assumed pre-escaped JSX output)', () => {
    assert.equal(escapeHtml(['<a>', '<b>']), '<a><b>')
  })
})

describe('sanitizeAttr', () => {
  it('rejects javascript: URLs in href', () => {
    assert.equal(sanitizeAttr('href', 'javascript:alert(1)'), '')
  })
  it('rejects vbscript: URLs in href', () => {
    assert.equal(sanitizeAttr('href', 'vbscript:doit'), '')
  })
  it('allows http: URLs', () => {
    assert.equal(sanitizeAttr('href', 'http://example.com'), 'http://example.com')
  })
  it('allows https: URLs', () => {
    assert.equal(sanitizeAttr('href', 'https://example.com'), 'https://example.com')
  })
  it('allows mailto: URLs', () => {
    assert.equal(sanitizeAttr('href', 'mailto:a@b.c'), 'mailto:a@b.c')
  })
  it('allows relative URLs', () => {
    assert.equal(sanitizeAttr('href', '/about'), '/about')
  })
  it('strips control characters from URL check', () => {
    assert.equal(sanitizeAttr('href', 'jav\u0000ascript:x'), '')
  })
  it('allows data:image/ URLs', () => {
    const v = sanitizeAttr('src', 'data:image/png;base64,xxx')
    assert.ok(v.includes('data:image/'))
  })
  it('rejects non-image data: URLs', () => {
    assert.equal(sanitizeAttr('src', 'data:text/html,<script>'), '')
  })
  it('passes through non-URL attributes unchanged', () => {
    assert.equal(sanitizeAttr('class', 'foo bar'), 'foo bar')
  })
  it('passes through action attribute URLs with validation', () => {
    assert.equal(sanitizeAttr('action', 'javascript:x'), '')
    assert.equal(sanitizeAttr('action', '/submit'), '/submit')
  })
  it('converts null to empty string', () => {
    assert.equal(sanitizeAttr('class', null), '')
  })
  it('converts undefined to empty string', () => {
    assert.equal(sanitizeAttr('class', undefined), '')
  })
  it('converts numbers to strings', () => {
    assert.equal(sanitizeAttr('data', 42), '42')
  })
  it('applies URL check to cite attribute', () => {
    assert.equal(sanitizeAttr('cite', 'javascript:x'), '')
  })
  it('applies URL check to poster attribute', () => {
    assert.equal(sanitizeAttr('poster', 'javascript:x'), '')
  })
  it('is case-insensitive on attribute name', () => {
    assert.equal(sanitizeAttr('HREF', 'javascript:x'), '')
  })
  it('is case-insensitive on javascript: prefix', () => {
    assert.equal(sanitizeAttr('href', 'JavaScript:x'), '')
  })
})
