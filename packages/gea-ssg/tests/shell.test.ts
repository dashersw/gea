import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseShell, injectIntoShell } from '../src/shell'

const BASIC_SHELL = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`

describe('parseShell', () => {
  it('parses a basic HTML shell', () => {
    const parts = parseShell(BASIC_SHELL)
    assert.ok(parts.before.endsWith('<div id="app">'))
    assert.ok(parts.after.startsWith('</div>'))
  })

  it('throws when app element is not found', () => {
    assert.throws(() => parseShell('<html><body></body></html>'), { message: /not found in shell HTML/ })
  })

  it('throws when closing div is missing', () => {
    assert.throws(() => parseShell('<html><body><div id="app"></body></html>'), {
      message: /Closing <\/div> not found/,
    })
  })

  it('supports custom appElementId', () => {
    const html = '<html><body><div id="root"></div></body></html>'
    const parts = parseShell(html, 'root')
    assert.ok(parts.before.endsWith('<div id="root">'))
  })

  it('handles existing content inside app div', () => {
    const html = '<html><head></head><body><div id="app">loading...</div></body></html>'
    const parts = parseShell(html)
    assert.ok(parts.before.endsWith('<div id="app">'))
    assert.ok(parts.after.startsWith('</div>'))
  })

  it('escapes regex metacharacters in appElementId', () => {
    const html = '<html><body><div id="app.main"></div></body></html>'
    const parts = parseShell(html, 'app.main')
    assert.ok(parts.before.endsWith('<div id="app.main">'))
    assert.ok(parts.after.startsWith('</div>'))
  })

  it('handles nested divs inside app div', () => {
    const html =
      '<html><body><div id="app"><div class="spinner"><div>inner</div></div></div><footer>f</footer></body></html>'
    const parts = parseShell(html)
    assert.ok(parts.before.endsWith('<div id="app">'))
    assert.ok(parts.after.startsWith('</div>'))
    assert.ok(parts.after.includes('<footer>f</footer>'))
    // Ensure the nested content is NOT included in "before" or "after"
    assert.ok(!parts.before.includes('spinner'))
    assert.ok(!parts.after.includes('spinner'))
  })
})

describe('injectIntoShell', () => {
  it('injects rendered HTML between shell parts', () => {
    const parts = parseShell(BASIC_SHELL)
    const result = injectIntoShell(parts, '<h1>Hello</h1>')
    assert.ok(result.includes('<div id="app"><h1>Hello</h1></div>'))
  })

  it('injects head tags before </head>', () => {
    const parts = parseShell(BASIC_SHELL)
    const result = injectIntoShell(parts, '<p>content</p>', '<meta name="desc" content="test">')
    assert.ok(result.includes('<meta name="desc" content="test"></head>'))
  })

  it('skips head injection when no headTags provided', () => {
    const parts = parseShell(BASIC_SHELL)
    const result = injectIntoShell(parts, '<p>content</p>')
    assert.equal(result.includes('undefined'), false)
  })

  it('produces valid full HTML', () => {
    const parts = parseShell(BASIC_SHELL)
    const result = injectIntoShell(parts, '<main>SSG Content</main>')
    assert.ok(result.startsWith('<!DOCTYPE html>'))
    assert.ok(result.includes('<main>SSG Content</main>'))
    assert.ok(result.includes('</html>'))
  })
})
