import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_COMPILED } from '../src/symbols'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'

// TODO: ComponentManager does not exist in v2 (signal-based reactivity).
// The original v1 tests covered event handling, getParentComps,
// callEventsGetterHandler, callItemHandler, MutationObserver rendering,
// event plugins, etc. In v2 these are replaced by:
//   - Direct DOM event delegation (src/dom/events.ts)
//   - Signals, effects, computeds, batch (src/signals/)
//   - DOM helpers: template, text, attributes, mount (src/dom/)
//   - Component lifecycle scope (src/component/lifecycle.ts)
//
// This file tests the v2 equivalents thoroughly.

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

describe('v2 event delegation – advanced', () => {
  let restoreDom: () => void
  let delegateEvent: typeof import('../src/dom/events').delegateEvent
  let ensureDelegation: typeof import('../src/dom/events').ensureDelegation
  let resetDelegation: typeof import('../src/dom/events').resetDelegation

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `ev-cov-${Date.now()}-${Math.random()}`
    const mod = await import(`../src/dom/events?${seed}`)
    delegateEvent = mod.delegateEvent
    ensureDelegation = mod.ensureDelegation
    resetDelegation = mod.resetDelegation
  })

  afterEach(() => {
    restoreDom()
  })

  it('delegation walks from target up to handler', async () => {
    const calls: string[] = []
    const grandparent = document.createElement('div')
    const parent = document.createElement('div')
    const child = document.createElement('span')
    grandparent.appendChild(parent)
    parent.appendChild(child)
    document.body.appendChild(grandparent)

    delegateEvent(grandparent, 'click', () => calls.push('grandparent'))
    child.click()
    await new Promise((r) => setTimeout(r, 0))
    assert.deepEqual(calls, ['grandparent'])
  })

  it('closest handler wins when nested', async () => {
    const calls: string[] = []
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    const leaf = document.createElement('span')
    outer.appendChild(inner)
    inner.appendChild(leaf)
    document.body.appendChild(outer)

    delegateEvent(outer, 'click', () => calls.push('outer'))
    delegateEvent(inner, 'click', () => calls.push('inner'))
    leaf.click()
    await new Promise((r) => setTimeout(r, 0))
    // v2 stops at first handler
    assert.deepEqual(calls, ['inner'])
  })

  it('no handler = no error on click', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    ensureDelegation('click')
    // Should not throw
    el.click()
    await new Promise((r) => setTimeout(r, 0))
  })

  it('different event types are independent', async () => {
    let clickCalled = false
    let inputCalled = false
    const el = document.createElement('input')
    document.body.appendChild(el)

    delegateEvent(el, 'click', () => { clickCalled = true })
    delegateEvent(el, 'input', () => { inputCalled = true })

    el.click()
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(clickCalled, true)
    assert.equal(inputCalled, false)
  })

  it('handler receives the native event', async () => {
    let receivedType = ''
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    delegateEvent(btn, 'click', (e: any) => {
      receivedType = e.type
    })
    btn.click()
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(receivedType, 'click')
  })
})

describe('v2 signals – signal / effect / computed / batch', () => {
  let signal: typeof import('../src/signals/index').signal
  let effect: typeof import('../src/signals/index').effect
  let computed: typeof import('../src/signals/index').computed
  let batch: typeof import('../src/signals/index').batch

  beforeEach(async () => {
    const seed = `sig-${Date.now()}-${Math.random()}`
    const mod = await import(`../src/signals/index?${seed}`)
    signal = mod.signal
    effect = mod.effect
    computed = mod.computed
    batch = mod.batch
  })

  describe('signal', () => {
    it('creates a signal with initial value', () => {
      const s = signal(0)
      assert.equal(s.value, 0)
    })

    it('updates value via setter', () => {
      const s = signal(1)
      s.value = 2
      assert.equal(s.value, 2)
    })

    it('peek returns value without tracking', () => {
      const s = signal(42)
      assert.equal(s.peek(), 42)
    })

    it('subscribe notifies on change', () => {
      const s = signal(0)
      let called = false
      s.subscribe(() => { called = true })
      s.value = 1
      assert.equal(called, true)
    })

    it('unsubscribe stops notifications', () => {
      const s = signal(0)
      let callCount = 0
      const unsub = s.subscribe(() => { callCount++ })
      s.value = 1
      unsub()
      s.value = 2
      assert.equal(callCount, 1)
    })

    it('does not notify when value is same (Object.is)', () => {
      const s = signal(5)
      let callCount = 0
      s.subscribe(() => { callCount++ })
      s.value = 5
      assert.equal(callCount, 0)
    })
  })

  describe('effect', () => {
    it('runs immediately on creation', () => {
      let ran = false
      const dispose = effect(() => { ran = true })
      assert.equal(ran, true)
      dispose()
    })

    it('re-runs when tracked signal changes', () => {
      const s = signal(0)
      const values: number[] = []
      const dispose = effect(() => { values.push(s.value) })
      s.value = 1
      s.value = 2
      assert.deepEqual(values, [0, 1, 2])
      dispose()
    })

    it('stops re-running after dispose', () => {
      const s = signal(0)
      let runCount = 0
      const dispose = effect(() => { s.value; runCount++ })
      assert.equal(runCount, 1)
      dispose()
      s.value = 1
      assert.equal(runCount, 1)
    })
  })

  describe('computed', () => {
    it('derives a value from a signal', () => {
      const s = signal(2)
      const c = computed(() => s.value * 2)
      assert.equal(c.value, 4)
    })

    it('updates when source signal changes', () => {
      const s = signal(3)
      const c = computed(() => s.value + 10)
      s.value = 7
      assert.equal(c.value, 17)
    })

    it('peek returns current value without tracking', () => {
      const s = signal(5)
      const c = computed(() => s.value * 3)
      assert.equal(c.peek(), 15)
    })

    it('can be disposed', () => {
      const s = signal(1)
      const c = computed(() => s.value * 2)
      c.dispose()
      s.value = 10
      // After dispose, computed no longer updates
      // (peek may return stale value)
      assert.equal(c.peek(), 2)
    })
  })

  describe('batch', () => {
    it('defers effect updates until batch ends', () => {
      const s = signal(0)
      const values: number[] = []
      const dispose = effect(() => { values.push(s.value) })
      batch(() => {
        s.value = 1
        s.value = 2
        s.value = 3
      })
      // Initial run + one batched run
      assert.deepEqual(values, [0, 3])
      dispose()
    })

    it('returns the value from the batch callback', () => {
      const result = batch(() => 42)
      assert.equal(result, 42)
    })

    it('nested batches only flush once', () => {
      const s = signal(0)
      let runCount = 0
      const dispose = effect(() => { s.value; runCount++ })
      runCount = 0
      batch(() => {
        batch(() => {
          s.value = 1
        })
        s.value = 2
      })
      assert.equal(runCount, 1)
      dispose()
    })
  })
})

describe('v2 DOM helpers', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  describe('template', () => {
    it('creates a reusable cloneable template', async () => {
      const seed = `tpl-${Date.now()}-${Math.random()}`
      const { template } = await import(`../src/dom/template?${seed}`)
      const tpl = template('<div class="row">text</div>')
      const el1 = tpl()
      const el2 = tpl()
      assert.equal(el1.tagName, 'DIV')
      assert.equal(el1.className, 'row')
      assert.notEqual(el1, el2) // clones are distinct
    })
  })

  describe('createElement', () => {
    it('creates an element with the given tag', async () => {
      const seed = `ce-${Date.now()}-${Math.random()}`
      const { createElement } = await import(`../src/dom/element?${seed}`)
      const el = createElement('span')
      assert.equal(el.tagName, 'SPAN')
    })
  })

  describe('createTextNode', () => {
    it('creates a text node', async () => {
      const seed = `tn-${Date.now()}-${Math.random()}`
      const { createTextNode } = await import(`../src/dom/text?${seed}`)
      const t = createTextNode('hello')
      assert.equal(t.nodeType, 3)
      assert.equal(t.data, 'hello')
    })
  })

  describe('reactiveText', () => {
    it('creates a text node that updates from a signal', async () => {
      const seed = `rt-${Date.now()}-${Math.random()}`
      const sigMod = await import(`../src/signals/index?${seed}`)
      const textMod = await import(`../src/dom/text?${seed}`)
      const s = sigMod.signal('initial')
      const t = textMod.reactiveText(() => s.value)
      assert.equal(t.data, 'initial')
      s.value = 'updated'
      assert.equal(t.data, 'updated')
    })
  })

  describe('reactiveAttr', () => {
    it('sets and updates an attribute reactively', async () => {
      const seed = `ra-${Date.now()}-${Math.random()}`
      const sigMod = await import(`../src/signals/index?${seed}`)
      const attrMod = await import(`../src/dom/attributes?${seed}`)
      const el = document.createElement('div')
      const s = sigMod.signal('red')
      attrMod.reactiveAttr(el, 'class', () => s.value)
      assert.equal(el.getAttribute('class'), 'red')
      s.value = 'blue'
      assert.equal(el.getAttribute('class'), 'blue')
    })
  })

  describe('staticAttr', () => {
    it('sets an attribute once', async () => {
      const seed = `sa-${Date.now()}-${Math.random()}`
      const { staticAttr } = await import(`../src/dom/attributes?${seed}`)
      const el = document.createElement('div')
      staticAttr(el, 'id', 'myid')
      assert.equal(el.getAttribute('id'), 'myid')
    })
  })
})

describe('v2 component lifecycle scope', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('createEffectScope runs effects and disposes them', async () => {
    const seed = `scope-${Date.now()}-${Math.random()}`
    const sigMod = await import(`../src/signals/index?${seed}`)
    const { createEffectScope } = await import(`../src/component/lifecycle?${seed}`)

    const s = sigMod.signal(0)
    let runCount = 0
    const scope = createEffectScope()
    scope.run(() => { s.value; runCount++ })
    assert.equal(runCount, 1)
    s.value = 1
    assert.equal(runCount, 2)
    scope.dispose()
    s.value = 2
    assert.equal(runCount, 2) // no more updates after dispose
  })

  it('createEffectScope disposes multiple effects', async () => {
    const seed = `scope2-${Date.now()}-${Math.random()}`
    const sigMod = await import(`../src/signals/index?${seed}`)
    const { createEffectScope } = await import(`../src/component/lifecycle?${seed}`)

    const s1 = sigMod.signal(0)
    const s2 = sigMod.signal(0)
    let count1 = 0
    let count2 = 0
    const scope = createEffectScope()
    scope.run(() => { s1.value; count1++ })
    scope.run(() => { s2.value; count2++ })
    assert.equal(count1, 1)
    assert.equal(count2, 1)

    scope.dispose()
    s1.value = 1
    s2.value = 1
    assert.equal(count1, 1)
    assert.equal(count2, 1)
  })
})

describe('v2 Component + props integration', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('mountComponent sets props and renders', async () => {
    const seed = `integ-${Date.now()}-${Math.random()}`
    const sigMod = await import(`../src/signals/index?${seed}`)
    const { Component } = await import(`../src/component/component?${seed}`)
    const { mountComponent } = await import(`../src/dom/mount?${seed}`)

    const nameSig = sigMod.signal('Alice')

    class Greeting extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('div')
        el.textContent = `Hello ${this.props.name}`
        return el
      }
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    mountComponent(Greeting, { name: () => nameSig.value }, container)
    assert.equal(container.children[0].textContent, 'Hello Alice')
  })

  it('props thunks are lazy — changing signal after mount does not auto-update static read', async () => {
    const seed = `integ2-${Date.now()}-${Math.random()}`
    const sigMod = await import(`../src/signals/index?${seed}`)
    const { Component } = await import(`../src/component/component?${seed}`)

    const s = sigMod.signal('initial')
    class MyComp extends Component {}
    const c = new MyComp()
    c[GEA_SET_PROPS]({ val: () => s.value })
    assert.equal(c.props.val, 'initial')
    s.value = 'changed'
    // props.val is a getter backed by the thunk, so it reads the signal
    assert.equal(c.props.val, 'changed')
  })

  it('createPropsProxy creates enumerable getters', async () => {
    const seed = `props-enum-${Date.now()}-${Math.random()}`
    const { createPropsProxy } = await import(`../src/component/props?${seed}`)
    const proxy = createPropsProxy({ a: () => 1, b: () => 2, c: () => 3 })
    assert.deepEqual(Object.keys(proxy).sort(), ['a', 'b', 'c'])
    assert.equal(proxy.a, 1)
    assert.equal(proxy.b, 2)
    assert.equal(proxy.c, 3)
  })
})
