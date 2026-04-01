import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Component } from '../src/index'

describe('Component.__escapeHtml', () => {
  it('escapes angle brackets', () => {
    assert.equal(
      Component.__escapeHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    )
  })

  it('escapes ampersands', () => {
    assert.equal(Component.__escapeHtml('a & b'), 'a &amp; b')
  })

  it('escapes single quotes', () => {
    assert.equal(Component.__escapeHtml("it's"), 'it&#39;s')
  })

  it('escapes double quotes', () => {
    assert.equal(Component.__escapeHtml('say "hello"'), 'say &quot;hello&quot;')
  })

  it('escapes img onerror payload', () => {
    const payload = '<img src=x onerror=alert(1)>'
    const result = Component.__escapeHtml(payload)
    assert.ok(!result.includes('<img'), 'should not contain raw img tag')
    assert.ok(result.includes('&lt;img'), 'should have escaped angle bracket')
  })

  it('returns plain text unchanged', () => {
    assert.equal(Component.__escapeHtml('hello world'), 'hello world')
  })

  it('handles empty string', () => {
    assert.equal(Component.__escapeHtml(''), '')
  })
})

describe('Component.__sanitizeAttr', () => {
  it('blocks javascript: protocol on href', () => {
    assert.equal(Component.__sanitizeAttr('href', 'javascript:alert(1)'), '')
  })

  it('blocks javascript: with leading spaces', () => {
    assert.equal(Component.__sanitizeAttr('href', '  javascript:alert(1)'), '')
  })

  it('blocks javascript: with mixed case', () => {
    assert.equal(Component.__sanitizeAttr('href', 'JaVaScRiPt:alert(1)'), '')
  })

  it('blocks vbscript: protocol', () => {
    assert.equal(Component.__sanitizeAttr('href', 'vbscript:MsgBox("xss")'), '')
  })

  it('blocks data: protocol on href', () => {
    assert.equal(Component.__sanitizeAttr('href', 'data:text/html,<script>alert(1)</script>'), '')
  })

  it('allows data:image/ URLs', () => {
    const dataImg = 'data:image/png;base64,abc123'
    assert.equal(Component.__sanitizeAttr('src', dataImg), dataImg)
  })

  it('blocks javascript: on src attribute', () => {
    assert.equal(Component.__sanitizeAttr('src', 'javascript:alert(1)'), '')
  })

  it('blocks javascript: on action attribute', () => {
    assert.equal(Component.__sanitizeAttr('action', 'javascript:alert(1)'), '')
  })

  it('blocks javascript: on formaction attribute', () => {
    assert.equal(Component.__sanitizeAttr('formaction', 'javascript:alert(1)'), '')
  })

  it('allows normal https URLs', () => {
    assert.equal(Component.__sanitizeAttr('href', 'https://example.com'), 'https://example.com')
  })

  it('allows relative URLs', () => {
    assert.equal(Component.__sanitizeAttr('href', '/about'), '/about')
  })

  it('allows hash URLs', () => {
    assert.equal(Component.__sanitizeAttr('href', '#section'), '#section')
  })

  it('does not sanitize non-URL attributes', () => {
    assert.equal(Component.__sanitizeAttr('class', 'javascript:foo'), 'javascript:foo')
  })

  it('blocks javascript: with control characters', () => {
    assert.equal(Component.__sanitizeAttr('href', 'java\tscript:alert(1)'), '')
  })
})
