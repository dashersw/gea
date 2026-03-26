import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const raf = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  const caf = (id: number) => clearTimeout(id)
  dom.window.requestAnimationFrame = raf
  dom.window.cancelAnimationFrame = caf

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
    MutationObserver: globalThis.MutationObserver,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
  })

  return () => {
    Object.assign(globalThis, prev)
    dom.window.close()
  }
}

describe('gea entry point', () => {
  let restoreDom: () => void
  beforeEach(() => {
    restoreDom = installDom()
  })
  afterEach(() => {
    restoreDom()
  })

  it('exports Store, Component, ComponentManager, applyListChanges', async () => {
    const seed = `idx-${Date.now()}-${Math.random()}`
    const gea = await import(`../src/index?${seed}`)
    assert.ok(gea.Store)
    assert.ok(gea.Component)
    assert.ok(gea.ComponentManager)
    assert.ok(gea.applyListChanges)
    assert.ok(gea.default)
    assert.equal(gea.default.Store, gea.Store)
    assert.equal(gea.default.Component, gea.Component)
    assert.equal(gea.default.applyListChanges, gea.applyListChanges)
  })
})

describe('JSX type entry (jsx.ts)', () => {
  it('can be imported without error', async () => {
    const jsx = await import('../src/jsx')
    assert.ok(jsx)
  })
})
