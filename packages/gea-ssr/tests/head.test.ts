import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { serializeHead } from '../src/head.ts'

describe('serializeHead', () => {
  it('renders title tag', () => {
    const html = serializeHead({ title: 'My Page' })
    assert.equal(html, '<title>My Page</title>')
  })

  it('escapes title content', () => {
    const html = serializeHead({ title: '<script>xss</script>' })
    assert.ok(!html.includes('<script>xss'))
    assert.ok(html.includes('&lt;script&gt;'))
  })

  it('renders meta tags', () => {
    const html = serializeHead({
      meta: [{ name: 'description', content: 'A page about things' }],
    })
    assert.equal(html, '<meta name="description" content="A page about things">')
  })

  it('renders link tags', () => {
    const html = serializeHead({
      link: [{ rel: 'canonical', href: 'https://example.com/page' }],
    })
    assert.equal(html, '<link rel="canonical" href="https://example.com/page">')
  })

  it('renders multiple tags in order', () => {
    const html = serializeHead({
      title: 'Test',
      meta: [{ charset: 'utf-8' }],
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    })
    assert.ok(html.startsWith('<title>Test</title>'))
    assert.ok(html.includes('<meta charset="utf-8">'))
    assert.ok(html.includes('<link rel="icon" href="/favicon.ico">'))
  })

  it('returns empty string for empty config', () => {
    assert.equal(serializeHead({}), '')
  })

  it('escapes attribute values', () => {
    const html = serializeHead({
      meta: [{ name: 'test', content: 'value with "quotes" & <brackets>' }],
    })
    assert.ok(html.includes('&quot;'))
    assert.ok(html.includes('&amp;'))
    assert.ok(html.includes('&lt;'))
  })
})
