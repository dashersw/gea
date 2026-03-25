import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeadTags, replaceTitle, minifyHtml } from '../src/head'

describe('buildHeadTags', () => {
  it('generates description meta tag', () => {
    const tags = buildHeadTags({ description: 'Test desc' })
    assert.ok(tags.includes('<meta name="description" content="Test desc">'))
  })

  it('generates og tags from title and description', () => {
    const tags = buildHeadTags({ title: 'My Title', description: 'My Desc' })
    assert.ok(tags.includes('<meta property="og:title" content="My Title">'))
    assert.ok(tags.includes('<meta property="og:description" content="My Desc">'))
  })

  it('generates twitter tags', () => {
    const tags = buildHeadTags({ title: 'T', description: 'D', image: '/og.png' })
    assert.ok(tags.includes('<meta name="twitter:title" content="T">'))
    assert.ok(tags.includes('<meta name="twitter:description" content="D">'))
    assert.ok(tags.includes('<meta name="twitter:image" content="/og.png">'))
    assert.ok(tags.includes('<meta name="twitter:card" content="summary_large_image">'))
  })

  it('generates canonical link from url', () => {
    const tags = buildHeadTags({ url: '/about' })
    assert.ok(tags.includes('<link rel="canonical" href="/about">'))
    assert.ok(tags.includes('<meta property="og:url" content="/about">'))
  })

  it('generates og:type', () => {
    const tags = buildHeadTags({ type: 'article' })
    assert.ok(tags.includes('<meta property="og:type" content="article">'))
  })

  it('defaults og:type to website', () => {
    const tags = buildHeadTags({ title: 'Test' })
    assert.ok(tags.includes('content="website"'))
  })

  it('generates JSON-LD with @context', () => {
    const tags = buildHeadTags({ jsonld: { '@type': 'BlogPosting', headline: 'Test' } })
    assert.ok(tags.includes('application/ld+json'))
    assert.ok(tags.includes('"@context":"https://schema.org"'))
    assert.ok(tags.includes('"@type":"BlogPosting"'))
  })

  it('handles jsonld array', () => {
    const tags = buildHeadTags({
      jsonld: [
        { '@type': 'WebSite', name: 'Test' },
        { '@type': 'Organization', name: 'Org' },
      ],
    })
    const count = (tags.match(/application\/ld\+json/g) || []).length
    assert.equal(count, 2)
  })

  it('generates custom meta tags', () => {
    const tags = buildHeadTags({ meta: [{ name: 'author', content: 'John' }] })
    assert.ok(tags.includes('<meta name="author" content="John">'))
  })

  it('generates custom link tags', () => {
    const tags = buildHeadTags({ link: [{ rel: 'alternate', hreflang: 'tr', href: '/tr' }] })
    assert.ok(tags.includes('<link rel="alternate" hreflang="tr" href="/tr">'))
  })

  it('escapes attribute values', () => {
    const tags = buildHeadTags({ title: 'A "quoted" <title>' })
    assert.ok(tags.includes('&quot;'))
    assert.ok(tags.includes('&lt;'))
  })

  it('escapes JSON-LD </script>', () => {
    const tags = buildHeadTags({ jsonld: { '@type': 'Test', desc: '</script>alert(1)' } })
    assert.ok(!tags.includes('</script>alert'))
    assert.ok(tags.includes('<\\/script>'))
  })

  it('returns empty string when no config', () => {
    const tags = buildHeadTags({})
    assert.ok(tags.includes('og:type'))
  })
})

describe('replaceTitle', () => {
  it('replaces title tag content', () => {
    const html = '<html><head><title>Old</title></head></html>'
    const result = replaceTitle(html, 'New Title')
    assert.ok(result.includes('<title>New Title</title>'))
    assert.ok(!result.includes('Old'))
  })

  it('escapes HTML in title', () => {
    const html = '<title>Test</title>'
    const result = replaceTitle(html, 'A <b>bold</b> title')
    assert.ok(result.includes('&lt;b'))
    assert.ok(!result.includes('<b>bold</b>'))
  })
})

describe('minifyHtml', () => {
  it('removes HTML comments', () => {
    const result = minifyHtml('<div><!-- comment --><p>text</p></div>')
    assert.ok(!result.includes('comment'))
    assert.ok(result.includes('<p>text</p>'))
  })

  it('preserves conditional comments', () => {
    const result = minifyHtml('<!--[if IE]><p>IE</p><![endif]--><p>ok</p>')
    assert.ok(result.includes('<!--[if IE]>'))
  })

  it('collapses whitespace', () => {
    const result = minifyHtml('<div>   text   with    spaces   </div>')
    assert.ok(!result.includes('   '))
  })

  it('removes inter-tag whitespace', () => {
    const result = minifyHtml('<div>  </div>  <p>  </p>')
    assert.ok(result.includes('><'))
  })

  it('preserves pre content', () => {
    const result = minifyHtml('<pre>  code\n  indented  </pre>')
    assert.ok(result.includes('  code\n  indented  '))
  })

  it('preserves script content', () => {
    const result = minifyHtml('<script>  var x = 1;  </script>')
    assert.ok(result.includes('  var x = 1;  '))
  })

  it('preserves code content', () => {
    const result = minifyHtml('<code>  exact  spaces  </code>')
    assert.ok(result.includes('  exact  spaces  '))
  })

  it('preserves textarea content', () => {
    const result = minifyHtml('<textarea>  user\n  text  </textarea>')
    assert.ok(result.includes('  user\n  text  '))
  })

  it('handles mixed content correctly', () => {
    const input = '<div>  text  </div>  <!-- comment -->  <pre>  preserved  </pre>  <p>  more  </p>'
    const result = minifyHtml(input)
    assert.ok(!result.includes('comment'))
    assert.ok(result.includes('  preserved  '))
  })
})
