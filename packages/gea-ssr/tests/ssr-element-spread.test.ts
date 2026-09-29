import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import { Component, GEA_CREATE_TEMPLATE } from '@geajs/core'
import { reactiveAttr, reactiveSpread } from '@geajs/core/compiler-runtime'
import { renderToString } from '../src/render.ts'

// `<p {...attrs}>` compiles to `reactiveSpread`. Its values must reach the
// HTML escaped exactly like a dynamic attribute written by `reactiveAttr`.

const nasty = `a"b<c>&d'`

class Spread extends Component {
  attrs = {
    title: nasty,
    'data-x': '"><script>alert(1)</script>',
    style: 'color: red !important',
    onClick: () => {},
  };
  [GEA_CREATE_TEMPLATE](d: any): Node {
    const root = document.createElement('div')
    const spread = document.createElement('p')
    spread.id = 'spread'
    reactiveSpread(spread, d, this, null, () => [this.attrs])
    const plain = document.createElement('p')
    plain.id = 'plain'
    reactiveAttr(plain, d, this, 'title', () => nasty)
    root.append(spread, plain)
    return root
  }
}

// Keys a spread object may hold that must not reach the HTML as written.
class Filtered extends Component {
  attrs = {
    'x><b id="added"></b><p q': 'v',
    'bad name': 'v',
    ONCLICK: 'x',
    OnMouseOver: 'y',
    href: 'javascript:void(0)',
    formaction: ' JavaScript:void(0)',
    'xlink:href': 'javascript:void(0)',
    title: 't',
  };
  [GEA_CREATE_TEMPLATE](d: any): Node {
    const root = document.createElement('div')
    const a = document.createElement('a')
    a.id = 'filtered'
    reactiveSpread(a, d, this, null, () => [this.attrs])
    root.append(a)
    return root
  }
}

// `srcdoc` and property-like keys in a spread object.
class TemplateOnly extends Component {
  frame = { srcdoc: '<p id="framed"></p>', SrcDoc: 'b', title: 'f' }
  attrs = { innerHTML: '<b id="inner"></b>', outerHTML: '<b id="outer"></b>', textContent: 'replaced' };
  [GEA_CREATE_TEMPLATE](d: any): Node {
    const root = document.createElement('div')
    const frame = document.createElement('iframe')
    reactiveSpread(frame, d, this, null, () => [this.frame])
    const p = document.createElement('p')
    p.textContent = 'kept'
    reactiveSpread(p, d, this, null, () => [this.attrs])
    root.append(frame, p)
    return root
  }
}

// Serialized attribute values in document order, and the DOM a browser-like
// parser builds back from the HTML.
const serialized = (html: string, name: string): string[] =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1])
const reparse = (html: string) => parseHTML(`<html><body>${html}</body></html>`).document

describe('SSR element spread', () => {
  it('escapes spread values like other dynamic attributes', () => {
    const html = renderToString(Spread)
    const [spreadTitle, plainTitle] = serialized(html, 'title')
    assert.equal(spreadTitle, plainTitle)
    assert.doesNotMatch(spreadTitle, /"/)

    const doc = reparse(html)
    assert.equal(doc.querySelector('#spread')!.getAttribute('title'), nasty)
    assert.equal(doc.querySelector('#spread')!.getAttribute('data-x'), '"><script>alert(1)</script>')
    assert.equal(doc.querySelectorAll('script').length, 0)
    assert.equal(doc.querySelectorAll('p').length, 2)
  })

  it('writes style and leaves handlers out of the HTML', () => {
    const html = renderToString(Spread)
    assert.match(reparse(html).querySelector('#spread')!.getAttribute('style')!, /color:\s*red !important/)
    assert.doesNotMatch(html, /onclick/i)
  })

  it('skips invalid attribute names and writes on* keys of any case nowhere', () => {
    const html = renderToString(Filtered)
    const doc = reparse(html)
    assert.equal(doc.querySelector('#added'), null)
    assert.equal(doc.querySelectorAll('p').length, 0)
    const a = doc.querySelector('#filtered')!
    assert.deepEqual(
      [...a.getAttributeNames()].filter((n) => n !== 'id' && n !== 'href' && n !== 'formaction' && n !== 'xlink:href'),
      ['title'],
    )
    assert.doesNotMatch(html, /onclick|onmouseover/i)
  })

  it('writes URL attribute values through sanitizeAttr', () => {
    const a = reparse(renderToString(Filtered)).querySelector('#filtered')!
    assert.equal(a.getAttribute('href'), '')
    assert.equal(a.getAttribute('formaction'), '')
    assert.equal(a.getAttribute('xlink:href'), '')
    assert.equal(a.getAttribute('title'), 't')
  })

  it('leaves srcdoc out and assigns no spread key as a property', () => {
    const html = renderToString(TemplateOnly)
    assert.doesNotMatch(html, /srcdoc/i)
    const doc = reparse(html)
    assert.equal(doc.querySelector('iframe')!.getAttribute('title'), 'f')
    assert.equal(doc.querySelector('p')!.textContent, 'kept')
    assert.equal(doc.querySelectorAll('#inner, #outer').length, 0)
  })
})
