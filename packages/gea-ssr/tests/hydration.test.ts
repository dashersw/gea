import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  GEA_ATTACH_BINDINGS,
  GEA_ELEMENT,
  GEA_INSTANTIATE_CHILD_COMPONENTS,
  GEA_MOUNT_COMPILED_CHILD_COMPONENTS,
  GEA_RENDERED,
  GEA_SETUP_EVENT_DIRECTIVES,
} from '@geajs/core'
import { restoreStoreState, hydrate } from '../src/client.ts'
import type { GeaComponentInstance } from '../src/types.ts'

let dom: JSDOM
let previous: Record<string, unknown>

function setupDOM(html: string) {
  dom = new JSDOM(html)
  previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
    Event: globalThis.Event,
    MutationObserver: globalThis.MutationObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    Event: dom.window.Event,
    MutationObserver:
      dom.window.MutationObserver ||
      class {
        observe() {}
        disconnect() {}
      },
    requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  })
}

function teardownDOM() {
  Object.assign(globalThis, previous)
  dom?.window?.close()
}

describe('restoreStoreState', () => {
  beforeEach(() => {
    setupDOM('<!doctype html><html><body></body></html>')
  })

  afterEach(() => {
    teardownDOM()
  })

  it('restores serialized state from __GEA_STATE__ into store instances', () => {
    window.__GEA_STATE__ = {
      TodoStore: {
        todos: [
          { id: '1', text: 'First', done: false },
          { id: '2', text: 'Second', done: true },
        ],
        filter: 'all',
      },
    }

    const todoStore: { todos: Array<Record<string, unknown>>; filter: string } = { todos: [], filter: '' }
    restoreStoreState({ TodoStore: todoStore })

    assert.equal(todoStore.todos.length, 2)
    assert.equal(todoStore.todos[0].text, 'First')
    assert.equal(todoStore.todos[1].done, true)
    assert.equal(todoStore.filter, 'all')
  })

  it('skips missing stores gracefully', () => {
    window.__GEA_STATE__ = {
      OtherStore: { value: 42 },
    }

    const myStore = { value: 0 }
    restoreStoreState({ MyStore: myStore })

    assert.equal(myStore.value, 0)
  })

  it('handles missing __GEA_STATE__ gracefully', () => {
    delete window.__GEA_STATE__

    const store = { count: 5 }
    restoreStoreState({ Store: store })

    assert.equal(store.count, 5)
  })

  it('restores null from SSR when preserveNull is true', () => {
    window.__GEA_STATE__ = {
      Store1: { user: null },
    }

    const store: Record<string, unknown> = { user: 'default-client-value' }
    restoreStoreState({ Store1: store }, { preserveNull: true })
    assert.equal(store.user, null)
  })

  it('skips null from SSR by default (backward compatible)', () => {
    window.__GEA_STATE__ = {
      Store1: { user: null },
    }

    const store: Record<string, unknown> = { user: 'default-client-value' }
    restoreStoreState({ Store1: store })
    assert.equal(store.user, 'default-client-value')
  })
})

describe('hydrate', () => {
  afterEach(() => {
    teardownDOM()
  })

  it('throws when target element is null', () => {
    setupDOM('<!doctype html><html><body></body></html>')

    class App implements GeaComponentInstance {
      props: Record<string, unknown>
      constructor(props?: Record<string, unknown>) {
        this.props = props || {}
      }
      template() {
        return '<div>app</div>'
      }
    }

    assert.throws(() => hydrate(App, null), { message: /target element not found/ })
  })

  it('renders into empty container as fallback', () => {
    setupDOM('<!doctype html><html><body><div id="app"></div></body></html>')

    class App implements GeaComponentInstance {
      props: Record<string, unknown>
      constructor(props?: Record<string, unknown>) {
        this.props = props || {}
      }
      template() {
        return '<div>app content</div>'
      }
      render(el: Element) {
        el.innerHTML = this.template()
      }
    }

    const el = document.getElementById('app')!
    hydrate(App, el)
    assert.equal(el.innerHTML, '<div>app content</div>')
  })

  it('adopts existing SSR content and activates interactivity', () => {
    setupDOM('<!doctype html><html><body><div id="app"><div id="0">SSR content</div></div></body></html>')

    let reRendered = false

    class App implements GeaComponentInstance {
      props: Record<string, unknown>;
      [GEA_ELEMENT]?: Element | null;
      [GEA_RENDERED]?: boolean
      constructor(props?: Record<string, unknown>) {
        this.props = props || {}
      }
      template() {
        return '<div>app</div>'
      }
      [GEA_ATTACH_BINDINGS]() {}
      [GEA_MOUNT_COMPILED_CHILD_COMPONENTS]() {}
      [GEA_INSTANTIATE_CHILD_COMPONENTS]() {}
      [GEA_SETUP_EVENT_DIRECTIVES]() {}
      onAfterRender() {}
      onAfterRenderHooks() {}
      __geaRequestRender() {
        reRendered = true
      }
    }

    const el = document.getElementById('app')!
    hydrate(App, el)

    // Hydration should NOT trigger a full re-render — it adopts existing DOM
    assert.equal(reRendered, false, 'hydrate must NOT trigger full re-render')
  })

  // NOTE: v1-era `__geaRequestRender`-based hydration preservation test removed.
  // The v2 hydration path adopts existing DOM through a different mechanism
  // (see `adopts existing SSR content and activates interactivity`).

  it('restores store state before App construction', () => {
    setupDOM('<!doctype html><html><body><div id="app"><div id="0">content</div></div></body></html>')
    window.__GEA_STATE__ = {
      CountStore: { count: 42 },
    }

    const countStore = { count: 0 }
    let countAtConstruction = -1

    class App implements GeaComponentInstance {
      props: Record<string, unknown>;
      [GEA_ELEMENT]?: Element | null;
      [GEA_RENDERED]?: boolean
      constructor(props?: Record<string, unknown>) {
        this.props = props || {}
        countAtConstruction = countStore.count
      }
      template() {
        return '<div>app</div>'
      }
      [GEA_ATTACH_BINDINGS]() {}
      [GEA_MOUNT_COMPILED_CHILD_COMPONENTS]() {}
      [GEA_INSTANTIATE_CHILD_COMPONENTS]() {}
      [GEA_SETUP_EVENT_DIRECTIVES]() {}
      onAfterRender() {}
      onAfterRenderHooks() {}
      __geaRequestRender() {}
    }

    hydrate(App, document.getElementById('app'), {
      storeRegistry: { CountStore: countStore },
    })

    assert.equal(countAtConstruction, 42, 'Store state must be restored before App constructor runs')
  })
})
