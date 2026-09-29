/**
 * reactiveStyle — diffs a style object and applies minimal set/removeProperty.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveStyle, reactiveStyleProp } from '../../src/runtime/reactive-style'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('reactiveStyle – static path', () => {
  it('applies initial style object', async () => {
    const s = new Store({ st: { color: 'red', fontSize: '12px' } as Record<string, string> }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    assert.equal(el.style.color, 'red')
    assert.equal(el.style.getPropertyValue('font-size'), '12px')
  })
  it('adds new keys and removes missing ones on update', async () => {
    const s = new Store({ st: { color: 'red', margin: '4px' } as Record<string, string> }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    s.st = { color: 'blue', padding: '8px' }
    await flush()
    assert.equal(el.style.color, 'blue')
    assert.equal(el.style.padding, '8px')
    assert.equal(el.style.margin, '')
  })
  it('dispose halts updates', async () => {
    const s = new Store({ st: { color: 'red' } as Record<string, string> }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    d.dispose()
    s.st = { color: 'green' }
    await flush()
    assert.equal(el.style.color, 'red')
  })
})

describe('reactiveStyle – getter mode', () => {
  it('reacts via tracked deps', async () => {
    const s = new Store({ c: 'red', sz: 10 }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, () => ({ color: s.c, fontSize: s.sz + 'px' }))
    assert.equal(el.style.color, 'red')
    assert.equal(el.style.getPropertyValue('font-size'), '10px')
    s.sz = 20
    await flush()
    assert.equal(el.style.getPropertyValue('font-size'), '20px')
  })
})

describe('reactiveStyle – units and strings (#110)', () => {
  it('adds px to numbers except 0, unitless and custom properties', async () => {
    const s = new Store({ h: 120 }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, () => ({ height: s.h, margin: 0, opacity: 0.5, zIndex: 2, '--gap': 4 }))
    assert.equal(el.style.height, '120px')
    assert.equal(el.style.margin, '0px')
    assert.equal(el.style.opacity, '0.5')
    assert.equal(el.style.zIndex, '2')
    assert.equal(el.style.getPropertyValue('--gap'), '4')
    s.h = 60
    await flush()
    assert.equal(el.style.height, '60px')
  })
  it('applies a string and clears it on null/false', async () => {
    const s = new Store({ st: 'height: 10px; color: red' as unknown }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    assert.equal(el.style.height, '10px')
    assert.equal(el.style.color, 'red')
    s.st = 'height: 20px'
    await flush()
    assert.equal(el.style.height, '20px')
    assert.equal(el.style.color, '')
    s.st = null
    await flush()
    assert.equal(el.getAttribute('style') ?? '', '')
    s.st = 'width: 5px'
    await flush()
    s.st = false
    await flush()
    assert.equal(el.style.width, '')
  })
  it('switches between string and object values', async () => {
    const s = new Store({ st: 'height: 10px; color: red' as unknown }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    s.st = { width: 30 }
    await flush()
    assert.equal(el.style.width, '30px')
    assert.equal(el.style.height, '')
    assert.equal(el.style.color, '')
    s.st = 'color: blue'
    await flush()
    assert.equal(el.style.color, 'blue')
    assert.equal(el.style.width, '')
    s.st = { width: 40 }
    await flush()
    assert.equal(el.style.width, '40px')
    assert.equal(el.style.color, '')
  })
})

describe('reactiveStyle – string styles only touch their own properties (#126)', () => {
  it('keeps display: none from visible across string updates', async () => {
    const s = new Store({ c: 'red' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    el.style.display = 'none'
    reactiveStyle(el, d, s, () => `color: ${s.c}`)
    assert.equal(el.style.display, 'none')
    assert.equal(el.style.color, 'red')
    s.c = 'green'
    await flush()
    assert.equal(el.style.display, 'none')
    assert.equal(el.style.color, 'green')
  })
  it('keeps properties set by other code when switching to an object or null', async () => {
    const s = new Store({ st: 'color: red' as unknown }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    el.style.transform = 'scale(2)'
    s.st = { width: 10 }
    await flush()
    assert.equal(el.style.transform, 'scale(2)')
    assert.equal(el.style.color, '')
    assert.equal(el.style.width, '10px')
    s.st = 'height: 5px'
    await flush()
    assert.equal(el.style.transform, 'scale(2)')
    assert.equal(el.style.width, '')
    assert.equal(el.style.height, '5px')
    s.st = null
    await flush()
    assert.equal(el.style.transform, 'scale(2)')
    assert.equal(el.style.height, '')
  })
  it('does not rewrite an unchanged declaration after a changed one', async () => {
    const s = new Store({ c: 'red' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, () => `color: ${s.c}; display: flex`)
    el.style.display = 'none'
    s.c = 'blue'
    await flush()
    assert.equal(el.style.display, 'none')
    assert.equal(el.style.color, 'blue')
  })
  it('keeps ; inside quotes and url(), !important and comments', () => {
    const s = new Store({}) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(
      el,
      d,
      s,
      () => `/* a; b */ background-image: url(data:image/png;base64,AA==); --label: "x;y"; COLOR: red !important`,
    )
    assert.equal(el.style.getPropertyValue('background-image'), 'url("data:image/png;base64,AA==")')
    assert.equal(el.style.getPropertyValue('--label'), '"x;y"')
    assert.equal(el.style.color, 'red')
    assert.equal(el.style.getPropertyPriority('color'), 'important')
  })
  it('re-applies a longhand after its changed shorthand', async () => {
    const s = new Store({ p: 5 }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, () => `padding: ${s.p}px; padding-left: 0`)
    assert.equal(el.style.paddingTop, '5px')
    assert.equal(el.style.paddingLeft, '0px')
    s.p = 6
    await flush()
    assert.equal(el.style.paddingTop, '6px')
    assert.equal(el.style.paddingLeft, '0px')
  })
  it('restores a shorthand when a longhand override is removed', async () => {
    const s = new Store({ st: 'border: 1px solid red; border-left: none' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    assert.equal(el.style.borderLeftStyle, 'none')
    s.st = 'border: 1px solid red'
    await flush()
    assert.equal(el.style.borderLeftWidth, '1px')
    assert.equal(el.style.borderLeftStyle, 'solid')
    assert.equal(el.style.borderLeftColor, 'red')
  })
  it('restores a shorthand when a longhand override is changed and removed', async () => {
    const s = new Store({ st: 'border: 1px solid red; border-top-color: green' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    s.st = 'border: 1px solid red; border-top-color: blue'
    await flush()
    assert.equal(el.style.borderTopColor, 'blue')
    assert.equal(el.style.borderBottomColor, 'red')
    s.st = 'border: 1px solid red'
    await flush()
    assert.equal(el.style.borderTopColor, 'red')
  })
  it('restores a shorthand when an !important longhand is removed', async () => {
    const s = new Store({ st: 'margin: 4px; margin-top: 8px !important' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    assert.equal(el.style.marginTop, '8px')
    s.st = 'margin: 4px'
    await flush()
    assert.equal(el.style.marginTop, '4px')
    assert.equal(el.style.getPropertyPriority('margin-top'), '')
  })
  it('lets !important win over a later normal declaration, as cssText does', () => {
    const s = new Store({}) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, () => 'margin-top: 8px !important; margin: 4px; color: red !important; color: blue')
    assert.equal(el.style.marginTop, '8px')
    assert.equal(el.style.getPropertyPriority('margin-top'), 'important')
    assert.equal(el.style.marginLeft, '4px')
    assert.equal(el.style.color, 'red')
    assert.equal(el.style.getPropertyPriority('color'), 'important')
  })
  it('keeps an unchanged !important longhand after its shorthand changes', async () => {
    const s = new Store({ st: 'border: 1px solid red; border-top-color: blue !important' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    s.st = 'border: 2px dashed blue; border-top-color: blue !important'
    await flush()
    assert.equal(el.style.borderTopColor, 'blue')
    assert.equal(el.style.getPropertyPriority('border-top-color'), 'important')
    assert.equal(el.style.borderTopStyle, 'dashed')
  })
  it('follows the new order when declarations are reordered', async () => {
    const s = new Store({ st: 'padding-left: 0; padding: 5px' }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyle(el, d, s, ['st'])
    await flush()
    assert.equal(el.style.paddingLeft, '5px')
    s.st = 'padding: 5px; padding-left: 0'
    await flush()
    assert.equal(el.style.paddingLeft, '0px')
    assert.equal(el.style.paddingTop, '5px')
  })
})

describe('reactiveStyleProp – units (#110)', () => {
  it('adds px to static and reactive numbers', async () => {
    const s = new Store({ h: 120 }) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyleProp(el, d, s, 'width', () => 50)
    reactiveStyleProp(el, d, s, 'height', ['h'])
    await flush()
    assert.equal(el.style.width, '50px')
    assert.equal(el.style.height, '120px')
    s.h = 60
    await flush()
    assert.equal(el.style.height, '60px')
  })
  it('leaves 0, unitless, vendor-prefixed unitless and custom properties alone', () => {
    const s = new Store({}) as any
    const el = document.createElement('div')
    const d = createDisposer()
    reactiveStyleProp(el, d, s, 'margin', () => 0)
    reactiveStyleProp(el, d, s, 'opacity', () => 0.5)
    reactiveStyleProp(el, d, s, 'z-index', () => 2)
    reactiveStyleProp(el, d, s, 'line-height', () => 1.5)
    reactiveStyleProp(el, d, s, 'font-weight', () => 500)
    reactiveStyleProp(el, d, s, 'order', () => 3)
    reactiveStyleProp(el, d, s, '-webkit-line-clamp', () => 2)
    reactiveStyleProp(el, d, s, '--size', () => 8)
    assert.equal(el.style.margin, '0px')
    assert.equal(el.style.opacity, '0.5')
    assert.equal(el.style.zIndex, '2')
    assert.equal(el.style.lineHeight, '1.5')
    assert.equal(el.style.fontWeight, '500')
    assert.equal(el.style.order, '3')
    assert.equal(el.style.getPropertyValue('-webkit-line-clamp'), '2')
    assert.equal(el.style.getPropertyValue('--size'), '8')
  })
})
