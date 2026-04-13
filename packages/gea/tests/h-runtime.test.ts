/**
 * Coverage for the runtime JSX 'h' factory.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { h } from '../src/h'

let restore: () => void
function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const prev: Record<string, any> = {}
  const g: Record<string, any> = {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLTemplateElement: dom.window.HTMLTemplateElement,
    Node: dom.window.Node,
  }
  for (const k in g) {
    prev[k] = (globalThis as any)[k]
    ;(globalThis as any)[k] = g[k]
  }
  restore = () => {
    for (const k in prev) (globalThis as any)[k] = prev[k]
    dom.window.close()
  }
}

describe('h — tag', () => {
  beforeEach(() => installDom())
  afterEach(() => restore())

  it('creates a simple div string', () => {
    assert.equal(h('div', null), '<div></div>')
  })
  it('handles self-closing void elements', () => {
    assert.equal(h('br', null), '<br />')
    assert.equal(h('img', { src: '/x.png' }), '<img src="/x.png" />')
  })
  it('creates element with text child', () => {
    assert.equal(h('p', null, 'hello'), '<p>hello</p>')
  })
  it('escapes text children', () => {
    assert.equal(h('p', null, 'a<b>c'), '<p>a&lt;b&gt;c</p>')
  })
  it('preserves HTML-string children starting with <', () => {
    assert.equal(h('div', null, '<span>s</span>'), '<div><span>s</span></div>')
  })
})

describe('h — props', () => {
  beforeEach(() => installDom())
  afterEach(() => restore())

  it('emits class attribute', () => {
    assert.equal(h('div', { class: 'foo' }), '<div class="foo"></div>')
  })
  it('supports className alias → class', () => {
    assert.equal(h('div', { className: 'foo' }), '<div class="foo"></div>')
  })
  it('escapes attribute values', () => {
    assert.ok(h('a', { href: '/x"y' }).includes('href="/x&quot;y"'))
  })
  it('skips null props', () => {
    assert.equal(h('div', { class: null }), '<div></div>')
  })
  it('skips false props', () => {
    assert.equal(h('div', { hidden: false }), '<div></div>')
  })
  it('emits boolean-true props as bare attributes', () => {
    assert.equal(h('input', { disabled: true }), '<input disabled />')
  })
  it('converts numeric attribute values', () => {
    assert.equal(h('div', { tabindex: 0 }), '<div tabindex="0"></div>')
  })
  it('handles style object with camelCase to kebab-case', () => {
    const s = h('div', { style: { backgroundColor: 'red' } })
    assert.ok(s.includes('background-color:red'))
  })
  it('skips function props (event handlers have no HTML repr)', () => {
    const s = h('button', { onClick: () => {} })
    assert.equal(s, '<button></button>')
  })
  it('skips key prop', () => {
    assert.equal(h('div', { key: 'k' }), '<div></div>')
  })
  it('skips ref prop', () => {
    assert.equal(h('div', { ref: {} }), '<div></div>')
  })
  it('skips children from props object (children come as rest args)', () => {
    assert.equal(h('div', { children: 'ignored' }), '<div></div>')
  })
})

describe('h — children', () => {
  beforeEach(() => installDom())
  afterEach(() => restore())

  it('flattens nested arrays', () => {
    assert.equal(h('ul', null, [[h('li', null, 'a'), h('li', null, 'b')]]), '<ul><li>a</li><li>b</li></ul>')
  })
  it('skips null children', () => {
    assert.equal(h('div', null, null, 'x', null), '<div>x</div>')
  })
  it('skips boolean children', () => {
    assert.equal(h('div', null, true, false, 'x'), '<div>x</div>')
  })
  it('converts numbers to strings', () => {
    assert.equal(h('span', null, 42), '<span>42</span>')
  })
  it('handles multiple text children', () => {
    assert.equal(h('p', null, 'a', 'b', 'c'), '<p>abc</p>')
  })
})

describe('h — component tags', () => {
  beforeEach(() => installDom())
  afterEach(() => restore())

  it('instantiates component class and stringifies via toString', () => {
    class MyComp {
      props: any
      constructor(props: any) {
        this.props = props
      }
      toString() {
        return `<my-comp data="${this.props?.data ?? ''}" />`
      }
    }
    const out = h(MyComp, { data: '42' })
    assert.equal(out, '<my-comp data="42" />')
  })
})
