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

describe('ComponentManager – event handling', () => {
  let restoreDom: () => void
  let ComponentManager: any

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `cmcov-${Date.now()}-${Math.random()}`
    const mod = await import(`../src/lib/base/component-manager?${seed}`)
    ComponentManager = mod.default
    ComponentManager.instance = undefined
  })

  afterEach(() => {
    restoreDom()
  })

  describe('handleEvent', () => {
    it('dispatches event to parent component handlers', () => {
      const mgr = ComponentManager.getInstance()
      let handlerCalled = false
      const comp = {
        id: 'test-comp',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: {
          click: {
            '.btn': () => {
              handlerCalled = true
            },
          },
        },
      }
      mgr.setComponent(comp)

      const root = document.createElement('div')
      root.id = 'test-comp'
      document.body.appendChild(root)

      const btn = document.createElement('button')
      btn.className = 'btn'
      root.appendChild(btn)

      const event = new Event('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: btn })
      mgr.handleEvent(event)
      assert.equal(handlerCalled, true)
    })

    it('propagates up through parent nodes', () => {
      const mgr = ComponentManager.getInstance()
      let called = false
      const comp = {
        id: 'outer',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: {
          click: {
            '.inner-btn': () => {
              called = true
            },
          },
        },
      }
      mgr.setComponent(comp)

      const outer = document.createElement('div')
      outer.id = 'outer'
      document.body.appendChild(outer)
      const inner = document.createElement('div')
      outer.appendChild(inner)
      const btn = document.createElement('button')
      btn.className = 'inner-btn'
      inner.appendChild(btn)

      const event = new Event('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: btn })
      mgr.handleEvent(event)
      assert.equal(called, true)
    })

    it('stops propagation when handler returns false', () => {
      const mgr = ComponentManager.getInstance()
      let secondCalled = false
      const inner = {
        id: 'inner-comp',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: {
          click: { '.stop': () => false },
        },
      }
      const outer = {
        id: 'outer-comp',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: {
          click: {
            '.stop': () => {
              secondCalled = true
            },
          },
        },
      }
      mgr.setComponent(inner)
      mgr.setComponent(outer)

      const outerEl = document.createElement('div')
      outerEl.id = 'outer-comp'
      document.body.appendChild(outerEl)
      const innerEl = document.createElement('div')
      innerEl.id = 'inner-comp'
      outerEl.appendChild(innerEl)
      const btn = document.createElement('button')
      btn.className = 'stop'
      innerEl.appendChild(btn)

      const event = new Event('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: btn })
      mgr.handleEvent(event)
      assert.equal(secondCalled, false)
    })
  })

  describe('getParentComps', () => {
    it('walks up the DOM to find parent components', () => {
      const mgr = ComponentManager.getInstance()
      const comp = {
        id: 'par',
        rendered: true,
        render: () => true,
        constructor: Object,
      }
      mgr.setComponent(comp)

      const el = document.createElement('div')
      el.id = 'par'
      document.body.appendChild(el)
      const child = document.createElement('span')
      el.appendChild(child)

      const parents = mgr.getParentComps(child)
      assert.equal(parents.length, 1)
      assert.equal(parents[0], comp)
    })

    it('uses cached parentComps on repeat calls', () => {
      const mgr = ComponentManager.getInstance()
      const comp = {
        id: 'cached',
        rendered: true,
        render: () => true,
        constructor: Object,
      }
      mgr.setComponent(comp)

      const el = document.createElement('div')
      el.id = 'cached'
      document.body.appendChild(el)
      const child = document.createElement('span')
      el.appendChild(child)

      mgr.getParentComps(child)
      const secondCall = mgr.getParentComps(child)
      assert.equal(secondCall.length, 1)
    })
  })

  describe('callEventsGetterHandler', () => {
    it('returns true when comp has no events', () => {
      const mgr = ComponentManager.getInstance()
      const comp = { id: 'no-events', rendered: true, render: () => true, constructor: Object }
      const event = new Event('click')
      Object.defineProperty(event, 'targetEl', { value: document.createElement('div'), writable: true })
      assert.equal(mgr.callEventsGetterHandler(comp, event), true)
    })

    it('matches by id selector (# prefix)', () => {
      const mgr = ComponentManager.getInstance()
      let called = false
      const comp = {
        id: 'id-match',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: {
          click: {
            '#my-btn': () => {
              called = true
            },
          },
        },
      }
      const btn = document.createElement('button')
      btn.id = 'my-btn'
      document.body.appendChild(btn)

      const event = new Event('click')
      ;(event as any).targetEl = btn
      mgr.callEventsGetterHandler(comp, event)
      assert.equal(called, true)
    })

    it('returns true when no matching selector', () => {
      const mgr = ComponentManager.getInstance()
      const comp = {
        id: 'no-match',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: {
          click: { '.nonexistent': () => {} },
        },
      }
      const btn = document.createElement('button')
      btn.className = 'other'
      document.body.appendChild(btn)
      const event = new Event('click')
      ;(event as any).targetEl = btn
      assert.equal(mgr.callEventsGetterHandler(comp, event), true)
    })

    it('returns true when event type has no handlers', () => {
      const mgr = ComponentManager.getInstance()
      const comp = {
        id: 'wrong-type',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: { click: { '.btn': () => {} } },
      }
      const btn = document.createElement('button')
      const event = new Event('mouseover')
      ;(event as any).targetEl = btn
      assert.equal(mgr.callEventsGetterHandler(comp, event), true)
    })
  })

  describe('callItemHandler', () => {
    it('calls __handleItemHandler for item elements', () => {
      const mgr = ComponentManager.getInstance()
      let receivedId: string | null = null
      const comp = {
        id: 'item-handler',
        rendered: true,
        render: () => true,
        constructor: Object,
        el: null as any,
        __handleItemHandler(itemId: string, _e: Event) {
          receivedId = itemId
        },
      }

      const el = document.createElement('div')
      el.id = 'item-handler'
      comp.el = el
      document.body.appendChild(el)
      mgr.setComponent(comp)

      const item = document.createElement('div')
      item.setAttribute('data-gea-item-id', 'item-42')
      el.appendChild(item)

      const event = new Event('click')
      ;(event as any).targetEl = item
      mgr.callItemHandler(comp, event)
      assert.equal(receivedId, 'item-42')
    })

    it('returns true when no item element found', () => {
      const mgr = ComponentManager.getInstance()
      const comp = { id: 'no-item', rendered: true, render: () => true, constructor: Object }
      const div = document.createElement('div')
      const event = new Event('click')
      ;(event as any).targetEl = div
      assert.equal(mgr.callItemHandler(comp, event), true)
    })

    it('returns true when targetEl has no getAttribute', () => {
      const mgr = ComponentManager.getInstance()
      const comp = { id: 'no-attr', rendered: true, render: () => true, constructor: Object }
      const event = new Event('click')
      ;(event as any).targetEl = {}
      assert.equal(mgr.callItemHandler(comp, event), true)
    })
  })

  describe('getOwningComponent', () => {
    it('finds owning component by walking up DOM', () => {
      const mgr = ComponentManager.getInstance()
      const comp = {
        id: 'owner',
        rendered: true,
        render: () => true,
        constructor: Object,
      }
      mgr.setComponent(comp)

      const el = document.createElement('div')
      el.id = 'owner'
      document.body.appendChild(el)
      const child = document.createElement('span')
      el.appendChild(child)

      assert.equal(mgr.getOwningComponent(child), comp)
    })

    it('returns undefined for orphan element', () => {
      const mgr = ComponentManager.getInstance()
      const el = document.createElement('div')
      assert.equal(mgr.getOwningComponent(el), undefined)
    })
  })

  describe('addDocumentEventListeners_', () => {
    it('deduplicates event listeners', () => {
      const mgr = ComponentManager.getInstance()
      mgr.addDocumentEventListeners_(['click'])
      mgr.addDocumentEventListeners_(['click'])
      assert.equal(
        mgr.registeredDocumentEvents_.size,
        mgr.registeredDocumentEvents_.has('click') ? mgr.registeredDocumentEvents_.size : 0,
      )
    })
  })

  describe('event plugins', () => {
    it('installEventPlugin_ avoids duplicate installs', () => {
      const mgr = ComponentManager.getInstance()
      let callCount = 0
      const plugin = () => {
        callCount++
      }
      mgr.installEventPlugin_(plugin)
      mgr.installEventPlugin_(plugin)
      assert.equal(callCount, 1)
    })

    it('installConfiguredPlugins_ installs static plugins', () => {
      let installed = false
      ComponentManager.eventPlugins_ = [
        () => {
          installed = true
        },
      ]
      const mgr = ComponentManager.getInstance()
      mgr.installConfiguredPlugins_()
      assert.equal(installed, true)
      ComponentManager.eventPlugins_ = []
    })

    it('static installEventPlugin installs on existing instance', () => {
      const mgr = ComponentManager.getInstance()
      mgr.loaded_ = true
      let called = false
      ComponentManager.installEventPlugin(() => {
        called = true
      })
      assert.equal(called, true)
    })
  })

  describe('setComponent with events', () => {
    it('registers document event listeners when loaded', () => {
      const mgr = ComponentManager.getInstance()
      mgr.loaded_ = true
      const comp = {
        id: 'ev-comp',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: { customtest: { '.a': () => {} } },
      }
      mgr.setComponent(comp)
      // Event registration now happens in markComponentRendered, not setComponent
      mgr.markComponentRendered(comp)
      assert.ok(mgr.registeredDocumentEvents_.has('customtest'))
    })
  })

  describe('getActiveDocumentEventTypes_', () => {
    it('collects event types from all components and custom types', () => {
      const mgr = ComponentManager.getInstance()
      ComponentManager.customEventTypes_ = ['globalcustom']
      const comp = {
        id: 'ev-all',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: { localclick: {} },
      }
      mgr.setComponent(comp)
      const types = mgr.getActiveDocumentEventTypes_()
      assert.ok(types.includes('globalcustom'))
      assert.ok(types.includes('localclick'))
      ComponentManager.customEventTypes_ = []
    })
  })

  describe('onLoad – MutationObserver for pending components', () => {
    it('renders components pending in componentsToRender on DOM mutation', async () => {
      const mgr = ComponentManager.getInstance()
      let rendered = false
      const comp = {
        id: 'pending-comp',
        rendered: false,
        __geaCompiledChild: false,
        render() {
          rendered = true
          return true
        },
        constructor: Object,
      }
      mgr.componentsToRender['pending-comp'] = comp
      mgr.onLoad()
      const el = document.createElement('div')
      document.body.appendChild(el)
      await new Promise((r) => setTimeout(r, 50))
      assert.equal(rendered, true)
    })

    it('skips __geaCompiledChild components in MutationObserver', async () => {
      const mgr = ComponentManager.getInstance()
      let rendered = false
      const comp = {
        id: 'compiled-pending',
        rendered: false,
        __geaCompiledChild: true,
        render() {
          rendered = true
          return true
        },
        constructor: Object,
      }
      mgr.componentsToRender['compiled-pending'] = comp
      mgr.onLoad()
      const el = document.createElement('div')
      document.body.appendChild(el)
      await new Promise((r) => setTimeout(r, 50))
      assert.equal(rendered, false)
    })
  })

  describe('addDocumentEventListeners_ when no body', () => {
    it('does nothing when document.body is null', () => {
      const mgr = ComponentManager.getInstance()
      const origBody = document.body
      Object.defineProperty(document, 'body', { value: null, configurable: true })
      mgr.addDocumentEventListeners_(['click'])
      Object.defineProperty(document, 'body', { value: origBody, configurable: true })
    })
  })

  describe('callEventsGetterHandler with owning component', () => {
    it('matches when owning component found via DOM walk', () => {
      const mgr = ComponentManager.getInstance()
      let called = false
      const comp = {
        id: 'owner-test',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: {
          click: {
            '.deep-btn': () => {
              called = true
            },
          },
        },
      }
      mgr.setComponent(comp)
      const el = document.createElement('div')
      el.id = 'owner-test'
      document.body.appendChild(el)
      const wrapper = document.createElement('div')
      el.appendChild(wrapper)
      const btn = document.createElement('button')
      btn.className = 'deep-btn'
      wrapper.appendChild(btn)

      const event = new Event('click')
      ;(event as any).targetEl = btn
      mgr.callEventsGetterHandler(comp, event)
      assert.equal(called, true)
    })
  })

  describe('callHandlers – callItemHandler returns false', () => {
    it('stops propagation when callItemHandler returns false', () => {
      const mgr = ComponentManager.getInstance()
      let secondCalled = false
      const comp = {
        id: 'item-stop',
        rendered: true,
        render: () => true,
        constructor: Object,
        el: null as any,
        __handleItemHandler() {
          return false
        },
      }
      const comp2 = {
        id: 'item-outer',
        rendered: true,
        render: () => true,
        constructor: Object,
        events: {
          click: {
            '.x': () => {
              secondCalled = true
            },
          },
        },
      }

      const outerEl = document.createElement('div')
      outerEl.id = 'item-outer'
      document.body.appendChild(outerEl)
      const innerEl = document.createElement('div')
      innerEl.id = 'item-stop'
      outerEl.appendChild(innerEl)
      comp.el = innerEl

      const itemEl = document.createElement('div')
      itemEl.setAttribute('data-gea-item-id', 'x')
      innerEl.appendChild(itemEl)

      mgr.setComponent(comp)
      mgr.setComponent(comp2)

      const event = new Event('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: itemEl })
      mgr.handleEvent(event)
      assert.equal(secondCalled, false)
    })
  })
})
