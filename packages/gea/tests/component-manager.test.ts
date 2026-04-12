import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_COMPILED } from '../src/symbols'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'

// TODO: ComponentManager does not exist in v2 (signal-based reactivity).
// v2 uses direct DOM event delegation (src/dom/events.ts) instead of a
// centralised ComponentManager. These tests need to be rewritten once
// an equivalent manager API is added, or permanently replaced with tests
// for the v2 event-delegation system.
//
// For now, we test the v2 event-delegation module (ensureDelegation /
// delegateEvent) which is the closest v2 equivalent.

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

describe('v2 event delegation (replaces ComponentManager)', () => {
  let restoreDom: () => void
  let delegateEvent: typeof import('../src/dom/events').delegateEvent
  let ensureDelegation: typeof import('../src/dom/events').ensureDelegation
  let resetDelegation: typeof import('../src/dom/events').resetDelegation

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `ev-${Date.now()}-${Math.random()}`
    const mod = await import(`../src/dom/events?${seed}`)
    delegateEvent = mod.delegateEvent
    ensureDelegation = mod.ensureDelegation
    resetDelegation = mod.resetDelegation
  })

  afterEach(() => {
    restoreDom()
  })

  describe('ensureDelegation', () => {
    it('installs a document-level listener for the given event type', () => {
      // Should not throw
      ensureDelegation('click')
    })

    it('can be called multiple times for the same event without error', () => {
      ensureDelegation('click')
      ensureDelegation('click')
    })

    it('supports multiple event types', () => {
      ensureDelegation('click')
      ensureDelegation('input')
      ensureDelegation('change')
    })
  })

  describe('delegateEvent', () => {
    it('attaches a handler property to the element', () => {
      const el = document.createElement('button')
      const handler = () => {}
      delegateEvent(el, 'click', handler)
      assert.equal((el as any).__gea_click, handler)
    })

    it('dispatches to handler on click via delegation', async () => {
      let called = false
      const btn = document.createElement('button')
      document.body.appendChild(btn)
      delegateEvent(btn, 'click', () => {
        called = true
      })
      btn.click()
      // Give the event loop a tick for the delegated handler
      await new Promise((r) => setTimeout(r, 0))
      assert.equal(called, true)
    })

    it('handler receives the event object', async () => {
      let receivedEvent: Event | null = null
      const btn = document.createElement('button')
      document.body.appendChild(btn)
      delegateEvent(btn, 'click', (e: any) => {
        receivedEvent = e
      })
      btn.click()
      await new Promise((r) => setTimeout(r, 0))
      assert.ok(receivedEvent)
      assert.equal(receivedEvent!.type, 'click')
    })

    it('bubbles up from child to parent handler', async () => {
      let parentCalled = false
      const parent = document.createElement('div')
      const child = document.createElement('span')
      parent.appendChild(child)
      document.body.appendChild(parent)
      delegateEvent(parent, 'click', () => {
        parentCalled = true
      })
      child.click()
      await new Promise((r) => setTimeout(r, 0))
      assert.equal(parentCalled, true)
    })

    it('inner handler takes priority over outer handler', async () => {
      const calls: string[] = []
      const outer = document.createElement('div')
      const inner = document.createElement('div')
      outer.appendChild(inner)
      document.body.appendChild(outer)
      delegateEvent(outer, 'click', () => {
        calls.push('outer')
      })
      delegateEvent(inner, 'click', () => {
        calls.push('inner')
      })
      inner.click()
      await new Promise((r) => setTimeout(r, 0))
      // v2 delegation stops at the first handler found
      assert.deepEqual(calls, ['inner'])
    })

    it('replaces handler when delegateEvent called again on same element', async () => {
      let firstCalled = false
      let secondCalled = false
      const btn = document.createElement('button')
      document.body.appendChild(btn)
      delegateEvent(btn, 'click', () => {
        firstCalled = true
      })
      delegateEvent(btn, 'click', () => {
        secondCalled = true
      })
      btn.click()
      await new Promise((r) => setTimeout(r, 0))
      assert.equal(firstCalled, false)
      assert.equal(secondCalled, true)
    })
  })

  describe('resetDelegation', () => {
    it('clears the installed delegation set', () => {
      ensureDelegation('click')
      resetDelegation()
      // After reset, ensureDelegation should re-install
      // (no direct way to check, but it should not throw)
      ensureDelegation('click')
    })
  })

  describe('UID generation', () => {
    it('generates unique ids via getUid', async () => {
      const seed = `uid-${Date.now()}-${Math.random()}`
      const mod = await import(`../src/component/uid?${seed}`)
      const getUid = mod.default
      const a = getUid()
      const b = getUid()
      assert.notEqual(a, b)
      assert.equal(typeof a, 'string')
    })

    it('resetUidCounter resets the counter', async () => {
      const seed = `uid-reset-${Date.now()}-${Math.random()}`
      const mod = await import(`../src/component/uid?${seed}`)
      const getUid = mod.default
      mod.resetUidCounter(100)
      const a = getUid()
      mod.resetUidCounter(100)
      const b = getUid()
      assert.equal(a, b)
    })
  })

  describe('Component mount helpers', () => {
    it('mountComponent creates and appends to parent', async () => {
      const seed = `mount-${Date.now()}-${Math.random()}`
      const { Component } = await import(`../src/component/component?${seed}`)
      const { mountComponent } = await import(`../src/dom/mount?${seed}`)

      class TestComp extends Component {
        [GEA_CREATE_TEMPLATE]() {
          const el = document.createElement('div')
          el.className = 'mounted'
          el.textContent = 'hello'
          return el
        }
      }
      const container = document.createElement('div')
      document.body.appendChild(container)
      const node = mountComponent(TestComp, { text: () => 'hi' }, container)
      assert.equal(container.children.length, 1)
      assert.equal(container.children[0].className, 'mounted')
    })

    it('mountComponent inserts before anchor when provided', async () => {
      const seed = `mount-anchor-${Date.now()}-${Math.random()}`
      const { Component } = await import(`../src/component/component?${seed}`)
      const { mountComponent } = await import(`../src/dom/mount?${seed}`)

      class TestComp extends Component {
        [GEA_CREATE_TEMPLATE]() {
          const el = document.createElement('div')
          el.className = 'inserted'
          return el
        }
      }
      const container = document.createElement('div')
      const existing = document.createElement('span')
      existing.className = 'existing'
      container.appendChild(existing)
      document.body.appendChild(container)

      mountComponent(TestComp, {}, container, existing)
      assert.equal(container.children[0].className, 'inserted')
      assert.equal(container.children[1].className, 'existing')
    })

    it('mountFunctionComponent calls function with props proxy', async () => {
      const seed = `mountfn-${Date.now()}-${Math.random()}`
      const { mountFunctionComponent } = await import(`../src/dom/mount?${seed}`)

      let receivedProps: any = null
      function MyFn(props: Record<string, unknown>) {
        receivedProps = props
        const el = document.createElement('div')
        el.textContent = String(props.text)
        return el
      }
      const container = document.createElement('div')
      document.body.appendChild(container)
      mountFunctionComponent(MyFn, { text: () => 'hello' }, container)
      assert.equal(container.children.length, 1)
      assert.equal(container.children[0].textContent, 'hello')
      assert.ok(receivedProps)
    })

    it('mount detects class vs function', async () => {
      // mount's internal `import { Component }` resolves to the canonical
      // (non-seeded) module, so we must use the same canonical Component
      // for the instanceof check to succeed.
      const { Component } = await import('../src/component/component')
      const { mount } = await import('../src/dom/mount')

      class TestComp extends Component {
        [GEA_CREATE_TEMPLATE]() {
          const el = document.createElement('div')
          el.className = 'class-comp'
          return el
        }
      }
      function FnComp(props: Record<string, unknown>) {
        const el = document.createElement('div')
        el.className = 'fn-comp'
        return el
      }

      const container1 = document.createElement('div')
      const container2 = document.createElement('div')
      document.body.appendChild(container1)
      document.body.appendChild(container2)

      mount(TestComp, {}, container1)
      mount(FnComp, {}, container2)

      assert.equal(container1.children[0].className, 'class-comp')
      assert.equal(container2.children[0].className, 'fn-comp')
    })
  })
})
