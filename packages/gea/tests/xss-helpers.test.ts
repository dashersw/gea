import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { geaEscapeHtml, geaSanitizeAttr } from '../src/index'

describe('geaEscapeHtml', () => {
  it('escapes angle brackets', () => {
    assert.equal(geaEscapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })

  it('escapes ampersands', () => {
    assert.equal(geaEscapeHtml('a & b'), 'a &amp; b')
  })

  it('escapes single quotes', () => {
    assert.equal(geaEscapeHtml("it's"), 'it&#39;s')
  })

  it('escapes double quotes', () => {
    assert.equal(geaEscapeHtml('say "hello"'), 'say &quot;hello&quot;')
  })

  it('escapes img onerror payload', () => {
    const payload = '<img src=x onerror=alert(1)>'
    const result = geaEscapeHtml(payload)
    assert.ok(!result.includes('<img'), 'should not contain raw img tag')
    assert.ok(result.includes('&lt;img'), 'should have escaped angle bracket')
  })

  it('returns plain text unchanged', () => {
    assert.equal(geaEscapeHtml('hello world'), 'hello world')
  })

  it('handles empty string', () => {
    assert.equal(geaEscapeHtml(''), '')
  })
})

describe('geaSanitizeAttr', () => {
  it('blocks javascript: protocol on href', () => {
    assert.equal(geaSanitizeAttr('href', 'javascript:alert(1)'), '')
  })

  it('blocks javascript: with leading spaces', () => {
    assert.equal(geaSanitizeAttr('href', '  javascript:alert(1)'), '')
  })

  it('blocks javascript: with mixed case', () => {
    assert.equal(geaSanitizeAttr('href', 'JaVaScRiPt:alert(1)'), '')
  })

  it('blocks vbscript: protocol', () => {
    assert.equal(geaSanitizeAttr('href', 'vbscript:MsgBox("xss")'), '')
  })

  it('blocks data: protocol on href', () => {
    assert.equal(geaSanitizeAttr('href', 'data:text/html,<script>alert(1)</script>'), '')
  })

  it('allows data:image/ URLs', () => {
    const dataImg = 'data:image/png;base64,abc123'
    assert.equal(geaSanitizeAttr('src', dataImg), dataImg)
  })

  it('blocks javascript: on src attribute', () => {
    assert.equal(geaSanitizeAttr('src', 'javascript:alert(1)'), '')
  })

  it('blocks javascript: on action attribute', () => {
    assert.equal(geaSanitizeAttr('action', 'javascript:alert(1)'), '')
  })

  it('blocks javascript: on formaction attribute', () => {
    assert.equal(geaSanitizeAttr('formaction', 'javascript:alert(1)'), '')
  })

  it('allows normal https URLs', () => {
    assert.equal(geaSanitizeAttr('href', 'https://example.com'), 'https://example.com')
  })

  it('allows relative URLs', () => {
    assert.equal(geaSanitizeAttr('href', '/about'), '/about')
  })

  it('allows hash URLs', () => {
    assert.equal(geaSanitizeAttr('href', '#section'), '#section')
  })

  it('does not sanitize non-URL attributes', () => {
    assert.equal(geaSanitizeAttr('class', 'javascript:foo'), 'javascript:foo')
  })

  it('blocks javascript: with control characters', () => {
    assert.equal(geaSanitizeAttr('href', 'java\tscript:alert(1)'), '')
  })
})
