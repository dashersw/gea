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
})
