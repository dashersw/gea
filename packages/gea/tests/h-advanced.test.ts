/**
 * Additional coverage for `h` factory: nested trees, all void elements,
 * deep nesting, array-of-arrays, and attribute edge cases.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { h } from '../src/h'

describe('h — void elements', () => {
  const voids = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']
  for (const tag of voids) {
    it(`self-closes ${tag}`, () => {
      const s = h(tag, null)
      assert.ok(s.endsWith('/>'), `${tag}: ${s}`)
    })
  }
})

describe('h — nested', () => {
  it('two levels of nesting', () => {
    assert.equal(h('div', null, h('span', null, 'x')), '<div><span>x</span></div>')
  })
  it('four levels of nesting', () => {
    const s = h('a', null, h('b', null, h('c', null, h('d', null, 'x'))))
    assert.equal(s, '<a><b><c><d>x</d></c></b></a>')
  })
  it('siblings stack correctly', () => {
    const s = h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'))
    assert.equal(s, '<ul><li>a</li><li>b</li><li>c</li></ul>')
  })
})

describe('h — attribute edge cases', () => {
  it('numeric 0 value', () => {
    assert.ok(h('div', { tabindex: 0 }).includes('tabindex="0"'))
  })
  it('empty string value emitted', () => {
    assert.ok(h('div', { 'data-x': '' }).includes('data-x=""'))
  })
  it('dash-cased attribute passes through', () => {
    assert.ok(h('div', { 'aria-label': 'hi' }).includes('aria-label="hi"'))
  })
  it('multiple attributes preserve order', () => {
    const s = h('div', { class: 'a', id: 'b', 'data-x': 'c' })
    assert.ok(s.indexOf('class') < s.indexOf('id'))
    assert.ok(s.indexOf('id') < s.indexOf('data-x'))
  })
})

describe('h — style object', () => {
  it('single property', () => {
    assert.ok(h('div', { style: { color: 'red' } }).includes('color:red'))
  })
  it('multiple properties joined by semicolon', () => {
    const s = h('div', { style: { color: 'red', fontSize: '14px' } })
    assert.ok(s.includes('color:red'))
    assert.ok(s.includes('font-size:14px'))
  })
  it('style values are attr-escaped', () => {
    const s = h('div', { style: { color: '"x"' } })
    assert.ok(s.includes('&quot;x&quot;'))
  })
})

describe('h — children mixing', () => {
  it('mixes text and elements', () => {
    const s = h('p', null, 'Hello, ', h('b', null, 'world'), '!')
    assert.equal(s, '<p>Hello, <b>world</b>!</p>')
  })
  it('array of HTML strings concatenated', () => {
    const s = h('ul', null, ['<li>a</li>', '<li>b</li>'])
    assert.equal(s, '<ul><li>a</li><li>b</li></ul>')
  })
  it('deeply nested arrays are flattened', () => {
    const s = h('ul', null, [[[h('li', null, 'a')]], h('li', null, 'b')])
    assert.equal(s, '<ul><li>a</li><li>b</li></ul>')
  })
})

describe('h — text escaping', () => {
  it('escapes ampersand in text children', () => {
    assert.equal(h('p', null, 'a & b'), '<p>a &amp; b</p>')
  })
  it('escapes less-than in text children', () => {
    assert.equal(h('p', null, 'a < b'), '<p>a &lt; b</p>')
  })
  it('escapes greater-than in text children', () => {
    assert.equal(h('p', null, 'a > b'), '<p>a &gt; b</p>')
  })
})
