import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseShell } from '../src/shell.ts'

describe('parseShell', () => {
  it('splits index.html at div#app', () => {
    const html = '<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>'
    const { before, after } = parseShell(html, 'app')
    assert.equal(before, '<!DOCTYPE html><html><head></head><body><div id="app">')
    assert.equal(after, '</div></body></html>')
  })

  it('handles custom app element id', () => {
    const html = '<html><body><div id="root"></div></body></html>'
    const { before, after } = parseShell(html, 'root')
    assert.equal(before, '<html><body><div id="root">')
    assert.equal(after, '</div></body></html>')
  })

  it('handles single quotes in id attribute', () => {
    const html = "<html><body><div id='app'></div></body></html>"
    const { before, after } = parseShell(html, 'app')
    assert.equal(before, "<html><body><div id='app'>")
    assert.equal(after, '</div></body></html>')
  })

  it('throws if app element not found', () => {
    const html = '<html><body><div id="other"></div></body></html>'
    assert.throws(() => parseShell(html, 'app'), /Could not find.*id="app"/)
  })

  it('handles main element as app root', () => {
    const html = '<html><body><main id="app"></main></body></html>'
    const { before, after } = parseShell(html, 'app')
    assert.equal(before, '<html><body><main id="app">')
    assert.equal(after, '</main></body></html>')
  })

  it('handles section element as app root', () => {
    const html = '<html><body><section id="root" class="app"></section></body></html>'
    const { before, after } = parseShell(html, 'root')
    assert.equal(before, '<html><body><section id="root" class="app">')
    assert.equal(after, '</section></body></html>')
  })

  it('handles whitespace and attributes on app div', () => {
    const html = '<html><body><div id="app" class="main" ></div></body></html>'
    const { before, after } = parseShell(html, 'app')
    assert.ok(before.endsWith('>'))
    assert.ok(after.startsWith('</div>'))
  })
})

describe('parseShell — escapeRegex coverage', () => {
  it('handles app element ID with dots', () => {
    const html = '<html><head></head><body><div id="my.app"></div></body></html>'
    const result = parseShell(html, 'my.app')
    assert.ok(result.before.includes('id="my.app"'))
  })

  it('handles app element ID with brackets', () => {
    const html = '<html><head></head><body><div id="app[0]"></div></body></html>'
    const result = parseShell(html, 'app[0]')
    assert.ok(result.before.includes('id="app[0]"'))
  })

  it('handles app element ID with plus and star', () => {
    const html = '<html><head></head><body><div id="app+star*"></div></body></html>'
    const result = parseShell(html, 'app+star*')
    assert.ok(result.before.includes('id="app+star*"'))
  })

  it('handles app element ID with parentheses', () => {
    const html = '<html><head></head><body><div id="app(1)"></div></body></html>'
    const result = parseShell(html, 'app(1)')
    assert.ok(result.before.includes('id="app(1)"'))
  })
})
