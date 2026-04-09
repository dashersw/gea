import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { GEA_CTOR_TAG_NAME } from '../src/lib/symbols'

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

describe('ComponentManager', () => {
  let restoreDom: () => void
  let ComponentManager: any

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `cm-${Date.now()}-${Math.random()}`
    const mod = await import(`../src/lib/base/component-manager?${seed}`)
    ComponentManager = mod.default
    ComponentManager.instance = undefined
  })

  afterEach(() => {
    restoreDom()
  })

  describe('singleton', () => {
    it('getInstance returns same instance', () => {
      const a = ComponentManager.getInstance()
      const b = ComponentManager.getInstance()
      assert.equal(a, b)
    })
  })

  describe('getUid', () => {
    it('generates unique ids', () => {
      const mgr = ComponentManager.getInstance()
      const a = mgr.getUid()
      const b = mgr.getUid()
      assert.notEqual(a, b)
    })
  })

  describe('createElement', () => {
    it('creates element from HTML string', () => {
      const mgr = ComponentManager.getInstance()
      const el = mgr.createElement('<div class="test">Hello</div>')
      assert.equal(el.tagName, 'DIV')
      assert.equal(el.className, 'test')
      assert.equal(el.textContent, 'Hello')
    })
  })

  describe('rcc', () => {
    it('registers class with auto-generated tag name', () => {
      const mgr = ComponentManager.getInstance()
      class MyWidget {}
      mgr.registerComponentClass(MyWidget)
      assert.ok(mgr.getComponentConstructor('my-widget'))
    })

    it('registers class with explicit tag name', () => {
      const mgr = ComponentManager.getInstance()
      class Foo {}
      mgr.registerComponentClass(Foo, 'custom-foo')
      assert.equal(mgr.getComponentConstructor('custom-foo'), Foo)
    })

    it('does not re-register same class', () => {
      const mgr = ComponentManager.getInstance()
      class Bar {
        static [GEA_CTOR_TAG_NAME]?: string
      }
      mgr.registerComponentClass(Bar)
      const tag1 = (Bar as any)[GEA_CTOR_TAG_NAME]
      mgr.registerComponentClass(Bar, 'different-bar')
      assert.equal((Bar as any)[GEA_CTOR_TAG_NAME], tag1)
    })
  })

  describe('gtn', () => {
    it('converts PascalCase to kebab-case', () => {
      const mgr = ComponentManager.getInstance()
      assert.equal(mgr.generateTagName_({ name: 'MyComponent' }), 'my-component')
    })

    it('prefixes single-word names that have no hyphen', () => {
      const mgr = ComponentManager.getInstance()
      assert.equal(mgr.generateTagName_({ name: 'Link' }), 'gea-link')
      assert.equal(mgr.generateTagName_({ name: 'Label' }), 'gea-label')
      assert.equal(mgr.generateTagName_({ name: 'Foo' }), 'gea-foo')
    })

    it('uses displayName when available', () => {
      const mgr = ComponentManager.getInstance()
      assert.equal(mgr.generateTagName_({ displayName: 'CustomName', name: 'Other' }), 'custom-name')
    })

    it('falls back to "gea-component"', () => {
      const mgr = ComponentManager.getInstance()
      assert.equal(mgr.generateTagName_({}), 'gea-component')
    })
  })

  describe('component registry', () => {
    it('sc and gc round-trip', () => {
      const mgr = ComponentManager.getInstance()
      const comp = { id: 'test-1', rendered: true, render: () => true, constructor: Object }
      mgr.setComponent(comp)
      assert.equal(mgr.getComponent('test-1'), comp)
    })

    it('rc deletes from registry', () => {
      const mgr = ComponentManager.getInstance()
      const comp = { id: 'test-2', rendered: true, render: () => true, constructor: Object }
      mgr.setComponent(comp)
      mgr.removeComponent(comp)
      assert.equal(mgr.getComponent('test-2'), undefined)
    })

    it('unrendered components go to componentsToRender', () => {
      const mgr = ComponentManager.getInstance()
      const comp = { id: 'test-3', rendered: false, render: () => true, constructor: Object }
      mgr.setComponent(comp)
      assert.ok(mgr.componentsToRender['test-3'])
    })

    it('mcr removes from componentsToRender', () => {
      const mgr = ComponentManager.getInstance()
      const comp = { id: 'test-4', rendered: false, render: () => true, constructor: Object }
      mgr.setComponent(comp)
      mgr.markComponentRendered(comp)
      assert.equal(mgr.componentsToRender['test-4'], undefined)
    })
  })

  describe('gcs', () => {
    it('returns tag names of registered classes', () => {
      const mgr = ComponentManager.getInstance()
      class Alpha {}
      mgr.registerComponentClass(Alpha)
      const selectors = mgr.getComponentSelectors()
      assert.ok(selectors.includes('gea-alpha'))
    })

    it('caches selectors', () => {
      const mgr = ComponentManager.getInstance()
      const a = mgr.getComponentSelectors()
      const b = mgr.getComponentSelectors()
      assert.equal(a, b)
    })

    it('invalidates cache on new registration', () => {
      const mgr = ComponentManager.getInstance()
      const a = mgr.getComponentSelectors()
      class Beta {}
      mgr.registerComponentClass(Beta)
      const b = mgr.getComponentSelectors()
      assert.notEqual(a, b)
    })
  })

  describe('registerEventTypes (static)', () => {
    it('adds custom event types', () => {
      ComponentManager.customEventTypes_ = []
      ComponentManager.registerEventTypes(['customclick'])
      assert.ok(ComponentManager.customEventTypes_.includes('customclick'))
    })

    it('deduplicates event types', () => {
      ComponentManager.customEventTypes_ = []
      ComponentManager.registerEventTypes(['x', 'x'])
      assert.equal(ComponentManager.customEventTypes_.filter((t: string) => t === 'x').length, 1)
    })
  })
})
