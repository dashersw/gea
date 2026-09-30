import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Component, GEA_CREATE_TEMPLATE, Store } from '@geajs/core'
import { createDisposer, reactiveBool, reactiveStyle } from '@geajs/core/compiler-runtime'
import { renderToString } from '../src/render.ts'

// SSR renders with linkedom, whose style object drops `!important` and
// hyphenates camelCase custom property names. String styles must still reach
// the HTML as written, next to the `display: none` that `visible` writes.

class StringStyles extends Component {
  open = false
  color = 'red';
  [GEA_CREATE_TEMPLATE](d: any): Node {
    const root = document.createElement('div')
    const styled = document.createElement('p')
    styled.id = 'styled'
    reactiveStyle(styled, d, this, () => `color: ${this.color} !important; --myColor: blue; background: url(data:,a;b)`)
    const hidden = document.createElement('p')
    hidden.id = 'hidden'
    reactiveBool(hidden, d, this, 'display', ['open'], 'visible')
    reactiveStyle(hidden, d, this, () => `color: ${this.color}`)
    root.append(styled, hidden)
    return root
  }
}

const styleOf = (html: string, id: string): string => {
  const m =
    new RegExp(`id="${id}"[^>]*style="([^"]*)"`).exec(html) ?? new RegExp(`style="([^"]*)"[^>]*id="${id}"`).exec(html)
  assert.ok(m, `no style attribute on #${id} in ${html}`)
  return m[1]
}

describe('SSR string styles', () => {
  it('keep !important, custom property case and ; inside url()', () => {
    const style = styleOf(renderToString(StringStyles), 'styled')
    assert.match(style, /color:\s*red !important/)
    assert.match(style, /--myColor:\s*blue/)
    assert.match(style, /background:\s*url\(data:,a;b\)/)
  })

  it('keep the display: none that visible writes', () => {
    const style = styleOf(renderToString(StringStyles), 'hidden')
    assert.match(style, /display:\s*none/)
    assert.match(style, /color:\s*red/)
  })

  it('only replace their own declarations on update', async () => {
    const s = new Store({ st: 'color: red !important; --myColor: blue' as unknown }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    el.style.display = 'none'
    s.st = 'color: green !important'
    await new Promise((r) => setTimeout(r, 0))
    assert.match(el.getAttribute('style')!, /display:\s*none/)
    assert.match(el.getAttribute('style')!, /color:\s*green !important/)
    assert.doesNotMatch(el.getAttribute('style')!, /--my-?color/i)
    s.st = { width: '10px' }
    await new Promise((r) => setTimeout(r, 0))
    assert.match(el.getAttribute('style')!, /display:\s*none/)
    assert.match(el.getAttribute('style')!, /width:\s*10px/)
    assert.doesNotMatch(el.getAttribute('style')!, /color/)
    d.dispose()
  })

  it('keep the case of custom properties in style objects (#127)', () => {
    const s = new Store({ c: 'blue' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, () => ({ '--myColor': s.c, fontSize: '12px' }))
    assert.match(el.getAttribute('style')!, /--myColor:\s*blue/)
    assert.match(el.getAttribute('style')!, /font-size:\s*12px/)
    d.dispose()
  })
})
