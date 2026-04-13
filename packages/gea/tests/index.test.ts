import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { GEA_CREATE_TEMPLATE } from '../src/runtime/symbols'

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

  it('exports Store and Component', async () => {
    const seed = `idx-${Date.now()}-${Math.random()}`
    const gea = await import(`../src/index?${seed}`)
    assert.ok(gea.Store)
    assert.ok(gea.Component)
    assert.ok(gea.default)
    assert.equal(gea.default.Store, gea.Store)
    assert.equal(gea.default.Component, gea.Component)
  })

  it('keeps router runtime exports on the router subpath', async () => {
    const seed = `idx-router-${Date.now()}-${Math.random()}`
    const router = await import(`../src/router/index?${seed}`)
    assert.equal(typeof router.createRouter, 'function')
    assert.equal(typeof router.matchRoute, 'function')
    assert.equal(typeof router.Router, 'function')
    assert.equal(typeof router.RouterView, 'function')
    assert.equal(typeof router.Link, 'function')
    assert.equal(typeof router.Outlet, 'function')
    assert.ok(router.router)
  })

  it('keeps v1 router exports on the root entry', async () => {
    const seed = `idx-root-router-${Date.now()}-${Math.random()}`
    const gea = await import(`../src/index?${seed}`)
    assert.equal(typeof gea.createRouter, 'function')
    assert.equal(typeof gea.matchRoute, 'function')
    assert.equal(typeof gea.Router, 'function')
    assert.equal(typeof gea.RouterView, 'function')
    assert.equal(typeof gea.Link, 'function')
    assert.equal(typeof gea.Outlet, 'function')
    assert.ok(gea.router)
  })

  it('keeps router out of the browser global entry', async () => {
    const seed = `idx-browser-global-${Date.now()}-${Math.random()}`
    const gea = await import(`../src/runtime-only-browser?${seed}`)
    const routerExports = ['createRouter', 'matchRoute', 'Router', 'RouterView', 'Link', 'Outlet', 'router']
    for (const key of routerExports) {
      assert.equal(key in gea, false, `${key} should not be exported from the browser entry`)
    }
    assert.equal(typeof gea.Component, 'function')
    assert.equal(typeof gea.Store, 'function')
    assert.equal(typeof gea.h, 'function')
  })

  it('does not export compiler runtime helpers from the root entry', async () => {
    const seed = `idx-helpers-${Date.now()}-${Math.random()}`
    const gea = await import(`../src/index?${seed}`)
    const privateHelpers = [
      'createDisposer',
      'NOOP_DISPOSER',
      'subscribe',
      'readPath',
      'withTracking',
      'patch',
      'bind',
      'reactiveText',
      'reactiveAttr',
      'reactiveHtml',
      'reactiveBool',
      'reactiveClass',
      'relationalClass',
      'relationalClassProp',
      'reactiveStyle',
      'reactiveValue',
      'delegateEvent',
      'mount',
      'conditional',
      'keyedList',
      'keyedListProp',
      'GEA_DOM_ITEM',
      'GEA_DOM_KEY',
      'createItemObservable',
      'createItemProxy',
      '_rescue',
      'GEA_SET_PROPS',
      'GEA_DISPOSER',
      'GEA_CREATED_CALLED',
      'GEA_OBSERVE_DIRECT',
      'GEA_ROOT_PROXY_HANDLER_FACTORY',
      'GEA_NO_STORE_PROXY',
    ]

    for (const helper of privateHelpers) {
      assert.equal(helper in gea, false, `${helper} should not be exported from @geajs/core`)
    }
  })

  it('snapshots the root export surface', async () => {
    const seed = `idx-surface-${Date.now()}-${Math.random()}`
    const gea = await import(`../src/index?${seed}`)
    assert.deepEqual(
      Object.keys(gea).sort(),
      [
        'Component',
        'GEA_ATTACH_BINDINGS',
        'GEA_CHILD_COMPONENTS',
        'GEA_COMPILED',
        'GEA_COMPILED_CHILD',
        'GEA_CREATE_TEMPLATE',
        'GEA_DOM_COMPILED_CHILD_ROOT',
        'GEA_DOM_COMPONENT',
        'GEA_ELEMENT',
        'GEA_INSTANTIATE_CHILD_COMPONENTS',
        'GEA_IS_ROUTER_OUTLET',
        'GEA_ITEM_KEY',
        'GEA_MAPS',
        'GEA_MOUNT_COMPILED_CHILD_COMPONENTS',
        'GEA_OBSERVER_REMOVERS',
        'GEA_ON_PROP_CHANGE',
        'GEA_PARENT_COMPONENT',
        'GEA_PROXY_GET_RAW_TARGET',
        'GEA_PROXY_GET_TARGET',
        'GEA_PROXY_IS_PROXY',
        'GEA_PROXY_RAW',
        'GEA_RENDERED',
        'GEA_ROUTER_DEPTH',
        'GEA_ROUTER_REF',
        'GEA_SETUP_EVENT_DIRECTIVES',
        'GEA_STORE_ROOT',
        'Store',
        'Link',
        'Outlet',
        'Router',
        'RouterView',
        'createRouter',
        'default',
        'geaEscapeHtml',
        'geaSanitizeAttr',
        'matchRoute',
        'router',
      ].sort(),
    )
  })

  it('keeps component and store underscore internals off the public shape', async () => {
    const seed = `idx-api-${Date.now()}-${Math.random()}`
    const gea = await import(`../src/index?${seed}`)
    const { Component, Store } = gea

    class App extends Component {
      [GEA_CREATE_TEMPLATE](): Node {
        return document.createElement('div')
      }
    }

    const component = new App()
    const store = new Store()
    const componentInternals = ['_setProps', '_propThunks', '_createdCalled', '_disposer', 'onPropsUpdated']
    for (const key of componentInternals) {
      assert.equal(key in Component.prototype, false, `Component.prototype must not expose ${key}`)
      assert.equal(key in component, false, `Component instance must not expose ${key}`)
    }
    assert.equal('_observeDirect' in Store.prototype, false)
    assert.equal('_observeDirect' in store, false)

    const root = document.createElement('div')
    component.render(root)
    assert.equal(component.el, component[gea.GEA_ELEMENT])
    assert.deepEqual(
      Object.keys(component).filter((key) => key.startsWith('_')),
      [],
    )
    component.dispose()
  })
})
