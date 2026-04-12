import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_COMPILED } from '../src/symbols'
/**
 * component-coverage.test.ts
 *
 * Comprehensive coverage of v2 Component, signal-based reactivity, DOM helpers,
 * keyed lists, conditionals, reactive text/attrs, Store patterns, and mount helpers.
 *
 * Replaces the v1 proxy-based test suite with equivalent v2 signal-based tests.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { Component } from '../src/component/component'
import { createPropsProxy, type PropThunks } from '../src/component/props'
import { Store } from '../src/store/store'
import { signal } from '../src/signals/signal'
import { effect, computation, mergedComputation } from '../src/signals/effect'
import { computed } from '../src/signals/computed'
import { batch } from '../src/signals/batch'
import { resetBatch } from '../src/signals/batch'
import { resetState } from '../src/signals/tracking'
import { wrapSignalValue } from '../src/reactive/wrap-signal-value'
import { template as domTemplate } from '../src/dom/template'
import { reactiveAttr, staticAttr } from '../src/dom/attributes'
import { reactiveText, createTextNode } from '../src/dom/text'
import { delegateEvent, resetDelegation } from '../src/dom/events'
import { keyedList } from '../src/dom/keyed-list'
import { conditional } from '../src/dom/conditional'
import { reactiveContent } from '../src/dom/content'
import { mountComponent, mountFunctionComponent, mount } from '../src/dom/mount'

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

// ---------------------------------------------------------------------------
// Component – props via __setProps (thunks pattern)
// ---------------------------------------------------------------------------
describe('Component – props via __setProps', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('accepts thunk-based props', () => {
    class A extends Component {}
    const a = new A()
    a[GEA_SET_PROPS]({ color: () => 'red' })
    assert.equal(a.props.color, 'red')
  })

  it('props reflect updated thunk values', () => {
    let val = 1
    class B extends Component {}
    const b = new B()
    b[GEA_SET_PROPS]({ x: () => val })
    assert.equal(b.props.x, 1)
    val = 2
    assert.equal(b.props.x, 2)
  })

  it('props are lazily evaluated from thunks', () => {
    let callCount = 0
    class C extends Component {}
    const c = new C()
    c[GEA_SET_PROPS]({
      value: () => {
        callCount++
        return 'hello'
      },
    })
    assert.equal(callCount, 0)
    assert.equal(c.props.value, 'hello')
    assert.equal(callCount, 1)
  })

  it('props are enumerable', () => {
    class D extends Component {}
    const d = new D()
    d[GEA_SET_PROPS]({ a: () => 1, b: () => 2 })
    const keys = Object.keys(d.props)
    assert.deepEqual(keys.sort(), ['a', 'b'])
  })

  it('props with signal-based thunks track reactively', () => {
    const s = signal('initial')
    class E extends Component {}
    const e = new E()
    e[GEA_SET_PROPS]({ value: () => s.value })
    assert.equal(e.props.value, 'initial')
    s.value = 'updated'
    assert.equal(e.props.value, 'updated')
  })

  it('__props is null before __setProps', () => {
    const c = new Component()
    assert.equal(c[GEA_PROPS], null)
  })

  it('__propThunks is null before __setProps', () => {
    const c = new Component()
    assert.equal(c[GEA_PROP_THUNKS], null)
  })

  it('stores thunks reference in __propThunks', () => {
    class F extends Component {}
    const f = new F()
    const thunks = { x: () => 42 }
    f[GEA_SET_PROPS](thunks)
    assert.equal(f[GEA_PROP_THUNKS], thunks)
  })
})

// ---------------------------------------------------------------------------
// createPropsProxy
// ---------------------------------------------------------------------------
describe('createPropsProxy', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('creates proxy object with getter-based props', () => {
    const proxy = createPropsProxy({ name: () => 'Alice', age: () => 30 })
    assert.equal(proxy.name, 'Alice')
    assert.equal(proxy.age, 30)
  })

  it('getters re-evaluate on each access', () => {
    let count = 0
    const proxy = createPropsProxy({
      val: () => {
        count++
        return count
      },
    })
    assert.equal(proxy.val, 1)
    assert.equal(proxy.val, 2)
  })

  it('props keys are enumerable', () => {
    const proxy = createPropsProxy({ a: () => 1, b: () => 2, c: () => 3 })
    assert.deepEqual(Object.keys(proxy).sort(), ['a', 'b', 'c'])
  })
})

// ---------------------------------------------------------------------------
// Component – render
// ---------------------------------------------------------------------------
describe('Component – render', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('appends __createTemplate result into container', () => {
    class F extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('div')
        el.className = 'test-f'
        el.textContent = 'Hello'
        return el
      }
    }
    const f = new F()
    const container = document.createElement('div')
    document.body.appendChild(container)
    f.render(container)
    assert.equal(container.children.length, 1)
    assert.equal(container.children[0].className, 'test-f')
  })

  it('appends multiple times if render called multiple times', () => {
    class G extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('div')
        el.textContent = 'G'
        return el
      }
    }
    const g = new G()
    const container = document.createElement('div')
    document.body.appendChild(container)
    g.render(container)
    g.render(container)
    assert.equal(container.children.length, 2)
  })

  it('accepts any Element as parent', () => {
    class H extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('span')
        el.textContent = 'H'
        return el
      }
    }
    const h = new H()
    const container = document.createElement('section')
    document.body.appendChild(container)
    h.render(container)
    assert.equal(container.children.length, 1)
    assert.equal(container.children[0].tagName, 'SPAN')
  })

  it('default __createTemplate returns a DocumentFragment', () => {
    const c = new Component()
    const node = c[GEA_CREATE_TEMPLATE]()
    assert.equal(node.nodeType, 11) // DOCUMENT_FRAGMENT_NODE
  })

  it('default template() returns undefined', () => {
    const c = new Component()
    assert.equal(c.template(), undefined)
  })

  it('subclass can override template', () => {
    class D extends Component {
      template() {
        return '<div>hello</div>'
      }
    }
    const d = new D()
    assert.equal(d.template(), '<div>hello</div>')
  })
})

// ---------------------------------------------------------------------------
// Component – inheritance
// ---------------------------------------------------------------------------
describe('Component – inheritance', () => {
  it('subclass inherits Component methods', () => {
    class Sub extends Component {
      template() {
        return '<div>sub</div>'
      }
    }
    const s = new Sub()
    assert.ok(s instanceof Component)
    assert.equal(typeof s.render, 'function')
    assert.equal(typeof s[GEA_SET_PROPS], 'function')
    assert.equal(typeof s[GEA_CREATE_TEMPLATE], 'function')
  })

  it('multi-level inheritance works', () => {
    class Base extends Component {
      template() {
        return '<div>base</div>'
      }
    }
    class Child extends Base {
      template() {
        return '<div>child</div>'
      }
    }
    const c = new Child()
    assert.ok(c instanceof Component)
    assert.ok(c instanceof Base)
    assert.equal(c.template(), '<div>child</div>')
  })

  it('two instances are distinct objects', () => {
    class B extends Component {}
    const b1 = new B()
    const b2 = new B()
    assert.notEqual(b1, b2)
  })
})

// ---------------------------------------------------------------------------
// Signal – basic tracking
// ---------------------------------------------------------------------------
describe('Signal – basic tracking', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('holds and returns a value', () => {
    const s = signal(42)
    assert.equal(s.value, 42)
  })

  it('updates value', () => {
    const s = signal(0)
    s.value = 10
    assert.equal(s.value, 10)
  })

  it('peek returns value without tracking', () => {
    const s = signal('hello')
    assert.equal(s.peek(), 'hello')
  })

  it('does not notify when same value is set (Object.is)', () => {
    const s = signal(5)
    let count = 0
    effect(() => {
      s.value
      count++
    })
    assert.equal(count, 1) // initial run
    s.value = 5 // same value
    assert.equal(count, 1) // no re-run
  })

  it('subscribe returns an unsubscribe function', () => {
    const s = signal(0)
    let count = 0
    const unsub = s.subscribe(() => count++)
    s.value = 1
    assert.equal(count, 1)
    unsub()
    s.value = 2
    assert.equal(count, 1)
  })
})

// ---------------------------------------------------------------------------
// Effect – subscription and cleanup
// ---------------------------------------------------------------------------
describe('Effect – subscription and cleanup', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('runs immediately on creation', () => {
    let ran = false
    effect(() => {
      ran = true
    })
    assert.equal(ran, true)
  })

  it('re-runs when signal dependency changes', () => {
    const s = signal(0)
    let value = -1
    effect(() => {
      value = s.value
    })
    assert.equal(value, 0)
    s.value = 42
    assert.equal(value, 42)
  })

  it('dispose stops re-running', () => {
    const s = signal(0)
    let count = 0
    const dispose = effect(() => {
      s.value
      count++
    })
    assert.equal(count, 1)
    dispose()
    s.value = 1
    assert.equal(count, 1)
  })

  it('nested effects are disposed when parent re-runs', () => {
    const outer = signal(0)
    const inner = signal(0)
    let innerCount = 0
    effect(() => {
      outer.value // track outer
      effect(() => {
        inner.value
        innerCount++
      })
    })
    assert.equal(innerCount, 1) // initial inner run
    inner.value = 1
    assert.equal(innerCount, 2) // inner re-run
    outer.value = 1 // parent re-runs => inner re-created
    // After parent re-run, inner effect is fresh (count 3 from new inner)
    assert.equal(innerCount, 3)
    inner.value = 2 // only new inner should fire
    assert.equal(innerCount, 4)
  })
})

// ---------------------------------------------------------------------------
// Computed – derived values
// ---------------------------------------------------------------------------
describe('Computed – derived values', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('derives from signal', () => {
    const count = signal(3)
    const doubled = computed(() => count.value * 2)
    assert.equal(doubled.value, 6)
  })

  it('updates when dependency changes', () => {
    const count = signal(1)
    const doubled = computed(() => count.value * 2)
    count.value = 5
    assert.equal(doubled.value, 10)
  })

  it('peek returns value without tracking', () => {
    const count = signal(3)
    const doubled = computed(() => count.value * 2)
    assert.equal(doubled.peek(), 6)
  })

  it('dispose stops updating', () => {
    const count = signal(1)
    const doubled = computed(() => count.value * 2)
    assert.equal(doubled.value, 2)
    doubled.dispose()
    count.value = 10
    // After dispose, the computed no longer updates
    assert.equal(doubled.peek(), 2)
  })
})

// ---------------------------------------------------------------------------
// Batch – deferred flush
// ---------------------------------------------------------------------------
describe('Batch – deferred flush', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('defers effect execution until batch ends', () => {
    const a = signal(0)
    const b = signal(0)
    let runCount = 0
    effect(() => {
      a.value
      b.value
      runCount++
    })
    assert.equal(runCount, 1)
    batch(() => {
      a.value = 1
      b.value = 2
    })
    assert.equal(runCount, 2) // single re-run, not two
  })

  it('batch returns the value of the callback', () => {
    const result = batch(() => 42)
    assert.equal(result, 42)
  })

  it('nested batches only flush at outermost', () => {
    const s = signal(0)
    let count = 0
    effect(() => {
      s.value
      count++
    })
    assert.equal(count, 1)
    batch(() => {
      s.value = 1
      batch(() => {
        s.value = 2
      })
      // inner batch end should not flush
      assert.equal(count, 1)
    })
    assert.equal(count, 2)
    assert.equal(s.value, 2)
  })
})

// ---------------------------------------------------------------------------
// Computation – getter/apply pattern
// ---------------------------------------------------------------------------
describe('Computation – getter/apply pattern', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('runs apply immediately with initial value', () => {
    const s = signal(10)
    let applied = -1
    computation(
      () => s.value * 2,
      (v) => {
        applied = v
      },
    )
    assert.equal(applied, 20)
  })

  it('re-runs apply when dependency changes', () => {
    const s = signal(1)
    const values: number[] = []
    computation(
      () => s.value + 1,
      (v) => values.push(v),
    )
    s.value = 5
    assert.deepEqual(values, [2, 6])
  })

  it('dispose stops re-running', () => {
    const s = signal(0)
    let count = 0
    const dispose = computation(
      () => s.value,
      () => count++,
    )
    assert.equal(count, 1)
    dispose()
    s.value = 1
    assert.equal(count, 1)
  })

  it('self-disposes when no reactive deps', () => {
    let count = 0
    const dispose = computation(
      () => 42,
      () => count++,
    )
    assert.equal(count, 1)
    // dispose is a no-op since already self-disposed
    dispose()
  })

  it('does not re-apply when value is same (Object.is)', () => {
    const s = signal(5)
    let count = 0
    computation(
      () => s.value,
      () => count++,
    )
    assert.equal(count, 1)
    s.value = 5 // same
    assert.equal(count, 1)
  })
})

// ---------------------------------------------------------------------------
// MergedComputation
// ---------------------------------------------------------------------------
describe('MergedComputation', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('applies all pairs on first run', () => {
    const a = signal(1)
    const b = signal(2)
    let va = -1,
      vb = -1
    mergedComputation([
      [() => a.value, (v) => (va = v)],
      [() => b.value, (v) => (vb = v)],
    ])
    assert.equal(va, 1)
    assert.equal(vb, 2)
  })

  it('only re-applies pairs whose values changed', () => {
    const a = signal(1)
    const b = signal(2)
    let aCount = 0,
      bCount = 0
    mergedComputation([
      [() => a.value, () => aCount++],
      [() => b.value, () => bCount++],
    ])
    assert.equal(aCount, 1)
    assert.equal(bCount, 1)
    a.value = 10
    assert.equal(aCount, 2)
    assert.equal(bCount, 1) // b did not change
  })

  it('self-disposes when all getters have 0 deps', () => {
    let count = 0
    mergedComputation([
      [() => 'static', () => count++],
    ])
    assert.equal(count, 1)
  })

  it('dispose stops re-running', () => {
    const s = signal(0)
    let count = 0
    const dispose = mergedComputation([
      [() => s.value, () => count++],
    ])
    assert.equal(count, 1)
    dispose()
    s.value = 1
    assert.equal(count, 1)
  })
})

// ---------------------------------------------------------------------------
// Store – signal-based fields (compiler pattern)
// ---------------------------------------------------------------------------
describe('Store – signal-based fields', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('creates with signal-backed fields', () => {
    class CountStore extends Store {
      __count = signal(0)
      get count() {
        return this.__count.value
      }
      set count(v: number) {
        this.__count.value = v
      }
    }
    const store = new CountStore()
    assert.equal(store.count, 0)
  })

  it('signal-backed field updates trigger effects', () => {
    class CountStore extends Store {
      __count = signal(0)
      get count() {
        return this.__count.value
      }
      set count(v: number) {
        this.__count.value = v
      }
    }
    const store = new CountStore()
    let observed = -1
    effect(() => {
      observed = store.count
    })
    assert.equal(observed, 0)
    store.count = 5
    assert.equal(observed, 5)
  })

  it('batch-wrapped methods produce single flush', () => {
    class TodoStore extends Store {
      __items = signal<string[]>([])
      get items() {
        return wrapSignalValue(this.__items)
      }
      set items(v: string[]) {
        this.__items.value = v
      }
      __count = signal(0)
      get count() {
        return this.__count.value
      }
      set count(v: number) {
        this.__count.value = v
      }
      add(text: string) {
        return batch(() => {
          this.items = [...this.__items.peek(), text]
          this.count = this.__count.peek() + 1
        })
      }
    }
    const store = new TodoStore()
    let runCount = 0
    effect(() => {
      store.items
      store.count
      runCount++
    })
    assert.equal(runCount, 1)
    store.add('hello')
    assert.equal(runCount, 2) // single flush
    assert.equal(store.count, 1)
  })

  it('nested object fields accessible through wrapSignalValue', () => {
    class NestedStore extends Store {
      __data = signal({ x: 1 })
      get data() {
        return wrapSignalValue(this.__data)
      }
      set data(v: any) {
        this.__data.value = v
      }
    }
    const store = new NestedStore()
    assert.equal(store.data.x, 1)
  })

  it('preserves class references in signal fields', () => {
    class HomePage {}
    class RouterStore extends Store {
      __component = signal<any>(HomePage)
      get component() {
        return this.__component.value
      }
      set component(v: any) {
        this.__component.value = v
      }
    }
    const router = new RouterStore()
    assert.strictEqual(router.component, HomePage)
  })
})

// ---------------------------------------------------------------------------
// DOM template – cloning factory
// ---------------------------------------------------------------------------
describe('DOM template – cloning factory', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('creates a clone factory from HTML string', () => {
    const factory = domTemplate('<div class="item">hello</div>')
    const el = factory()
    assert.equal(el.tagName, 'DIV')
    assert.equal(el.className, 'item')
    assert.equal(el.textContent, 'hello')
  })

  it('clones produce independent elements', () => {
    const factory = domTemplate('<span>text</span>')
    const a = factory()
    const b = factory()
    assert.notEqual(a, b)
    a.textContent = 'changed'
    assert.equal(b.textContent, 'text')
  })

  it('handles nested HTML', () => {
    const factory = domTemplate('<div><span class="inner">nested</span></div>')
    const el = factory()
    assert.equal(el.children.length, 1)
    assert.equal(el.children[0].className, 'inner')
  })
})

// ---------------------------------------------------------------------------
// reactiveText
// ---------------------------------------------------------------------------
describe('reactiveText', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('creates a text node with initial value', () => {
    const s = signal('hello')
    const node = reactiveText(() => s.value)
    assert.equal(node.data, 'hello')
  })

  it('updates text when signal changes', () => {
    const s = signal('a')
    const node = reactiveText(() => s.value)
    assert.equal(node.data, 'a')
    s.value = 'b'
    assert.equal(node.data, 'b')
  })

  it('converts non-string values to string', () => {
    const s = signal<any>(42)
    const node = reactiveText(() => s.value)
    assert.equal(node.data, '42')
  })
})

// ---------------------------------------------------------------------------
// createTextNode
// ---------------------------------------------------------------------------
describe('createTextNode', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('creates a static text node', () => {
    const node = createTextNode('static')
    assert.equal(node.data, 'static')
    assert.equal(node.nodeType, 3) // TEXT_NODE
  })
})

// ---------------------------------------------------------------------------
// reactiveAttr
// ---------------------------------------------------------------------------
describe('reactiveAttr', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('sets attribute from signal value', () => {
    const s = signal('highlight')
    const el = document.createElement('div')
    reactiveAttr(el, 'data-state', () => s.value)
    assert.equal(el.getAttribute('data-state'), 'highlight')
  })

  it('updates attribute when signal changes', () => {
    const s = signal('a')
    const el = document.createElement('div')
    reactiveAttr(el, 'data-x', () => s.value)
    assert.equal(el.getAttribute('data-x'), 'a')
    s.value = 'b'
    assert.equal(el.getAttribute('data-x'), 'b')
  })

  it('removes attribute when value is false', () => {
    const s = signal<any>('visible')
    const el = document.createElement('div')
    reactiveAttr(el, 'hidden', () => s.value)
    assert.equal(el.getAttribute('hidden'), 'visible')
    s.value = false
    assert.equal(el.hasAttribute('hidden'), false)
  })

  it('removes attribute when value is null', () => {
    const s = signal<any>('val')
    const el = document.createElement('div')
    reactiveAttr(el, 'data-x', () => s.value)
    s.value = null
    assert.equal(el.hasAttribute('data-x'), false)
  })

  it('sets empty string attribute for true (non-DOM-property attr)', () => {
    const s = signal<any>(true)
    const el = document.createElement('div')
    reactiveAttr(el, 'data-active', () => s.value)
    assert.equal(el.getAttribute('data-active'), '')
  })

  it('handles className as DOM property', () => {
    const s = signal('active')
    const el = document.createElement('div')
    reactiveAttr(el, 'className', () => s.value)
    assert.equal(el.className, 'active')
    s.value = 'inactive'
    assert.equal(el.className, 'inactive')
  })

  it('handles style as object', () => {
    const s = signal<any>({ color: 'red', fontSize: 16 })
    const el = document.createElement('div')
    reactiveAttr(el, 'style', () => s.value)
    assert.equal(el.style.color, 'red')
  })

  it('handles style as string', () => {
    const s = signal('color: blue')
    const el = document.createElement('div')
    reactiveAttr(el, 'style', () => s.value)
    assert.ok(el.style.cssText.includes('color'))
  })
})

// ---------------------------------------------------------------------------
// staticAttr
// ---------------------------------------------------------------------------
describe('staticAttr', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('sets attribute statically', () => {
    const el = document.createElement('div')
    staticAttr(el, 'data-id', '42')
    assert.equal(el.getAttribute('data-id'), '42')
  })

  it('removes attribute for false', () => {
    const el = document.createElement('div')
    el.setAttribute('data-x', 'old')
    staticAttr(el, 'data-x', false)
    assert.equal(el.hasAttribute('data-x'), false)
  })
})

// ---------------------------------------------------------------------------
// delegateEvent
// ---------------------------------------------------------------------------
describe('delegateEvent', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetDelegation()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('attaches handler that fires on event', () => {
    let clicked = false
    const el = document.createElement('button')
    document.body.appendChild(el)
    delegateEvent(el, 'click', () => {
      clicked = true
    })
    el.click()
    assert.equal(clicked, true)
  })
})

// ---------------------------------------------------------------------------
// conditional – reactive branching
// ---------------------------------------------------------------------------
describe('conditional – reactive branching', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('renders truthy branch', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    const show = signal(true)
    conditional(
      container,
      anchor,
      () => show.value,
      () => {
        const el = document.createElement('span')
        el.textContent = 'yes'
        return el
      },
      () => {
        const el = document.createElement('span')
        el.textContent = 'no'
        return el
      },
    )
    assert.equal(container.querySelector('span')!.textContent, 'yes')
  })

  it('renders falsy branch', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    const show = signal(false)
    conditional(
      container,
      anchor,
      () => show.value,
      () => {
        const el = document.createElement('span')
        el.textContent = 'yes'
        return el
      },
      () => {
        const el = document.createElement('span')
        el.textContent = 'no'
        return el
      },
    )
    assert.equal(container.querySelector('span')!.textContent, 'no')
  })

  it('flips from truthy to falsy', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    const show = signal(true)
    conditional(
      container,
      anchor,
      () => show.value,
      () => {
        const el = document.createElement('span')
        el.className = 'truthy'
        el.textContent = 'T'
        return el
      },
      () => {
        const el = document.createElement('span')
        el.className = 'falsy'
        el.textContent = 'F'
        return el
      },
    )
    assert.ok(container.querySelector('.truthy'))
    assert.equal(container.querySelector('.falsy'), null)
    show.value = false
    assert.equal(container.querySelector('.truthy'), null)
    assert.ok(container.querySelector('.falsy'))
  })

  it('works without else branch', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    const show = signal(true)
    conditional(
      container,
      anchor,
      () => show.value,
      () => {
        const el = document.createElement('span')
        el.textContent = 'shown'
        return el
      },
    )
    assert.ok(container.querySelector('span'))
    show.value = false
    assert.equal(container.querySelector('span'), null)
  })

  it('re-shows branch when condition flips back', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    const show = signal(true)
    conditional(
      container,
      anchor,
      () => show.value,
      () => {
        const el = document.createElement('span')
        el.textContent = 'visible'
        return el
      },
    )
    assert.ok(container.querySelector('span'))
    show.value = false
    assert.equal(container.querySelector('span'), null)
    show.value = true
    assert.ok(container.querySelector('span'))
  })
})

// ---------------------------------------------------------------------------
// keyedList – list reconciliation
// ---------------------------------------------------------------------------
describe('keyedList – list reconciliation', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  function getTexts(container: HTMLElement): string[] {
    return Array.from(container.childNodes)
      .filter((n) => n.nodeType === 1)
      .map((el) => el.textContent || '')
  }

  function setup(initialItems: string[] = []) {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    const items = signal<string[]>(initialItems)
    keyedList(
      container,
      anchor,
      () => items.value,
      (item) => item as string,
      (getter) => {
        const el = document.createElement('div')
        el.textContent = getter() as string
        return el
      },
      true,
    )
    return { container, items }
  }

  it('renders items on first run', () => {
    const { container } = setup(['a', 'b', 'c'])
    assert.deepEqual(getTexts(container), ['a', 'b', 'c'])
  })

  it('renders empty array as no children', () => {
    const { container } = setup([])
    assert.deepEqual(getTexts(container), [])
  })

  it('appends new items', () => {
    const { container, items } = setup(['a', 'b'])
    items.value = ['a', 'b', 'c']
    assert.deepEqual(getTexts(container), ['a', 'b', 'c'])
  })

  it('removes items', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    items.value = ['a', 'c']
    assert.deepEqual(getTexts(container), ['a', 'c'])
  })

  it('reorders items', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    items.value = ['c', 'a', 'b']
    assert.deepEqual(getTexts(container), ['c', 'a', 'b'])
  })

  it('handles full replacement', () => {
    const { container, items } = setup(['a', 'b'])
    items.value = ['x', 'y', 'z']
    assert.deepEqual(getTexts(container), ['x', 'y', 'z'])
  })

  it('clears all items', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    items.value = []
    assert.deepEqual(getTexts(container), [])
  })

  it('swaps two items', () => {
    const { container, items } = setup(['a', 'b', 'c'])
    items.value = ['c', 'b', 'a']
    assert.deepEqual(getTexts(container), ['c', 'b', 'a'])
  })

  it('handles same-length diff content', () => {
    const { container, items } = setup(['a', 'b'])
    items.value = ['x', 'y']
    assert.deepEqual(getTexts(container), ['x', 'y'])
  })
})

// ---------------------------------------------------------------------------
// reactiveContent
// ---------------------------------------------------------------------------
describe('reactiveContent', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('renders a DOM node', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    reactiveContent(container, anchor, () => {
      const el = document.createElement('span')
      el.textContent = 'hello'
      return el
    })
    assert.equal(container.querySelector('span')!.textContent, 'hello')
  })

  it('renders a primitive as text node', () => {
    const s = signal('text value')
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    reactiveContent(container, anchor, () => s.value)
    // container should have: text node + comment (anchor)
    const textNode = container.childNodes[0]
    assert.equal(textNode.nodeType, 3) // TEXT_NODE
    assert.equal(textNode.textContent, 'text value')
  })

  it('updates when signal changes', () => {
    const s = signal('initial')
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    reactiveContent(container, anchor, () => {
      const el = document.createElement('span')
      el.textContent = s.value
      return el
    })
    assert.equal(container.querySelector('span')!.textContent, 'initial')
    s.value = 'updated'
    assert.equal(container.querySelector('span')!.textContent, 'updated')
  })

  it('renders array of DOM nodes', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    reactiveContent(container, anchor, () => {
      return ['a', 'b', 'c'].map((t) => {
        const el = document.createElement('span')
        el.textContent = t
        return el
      })
    })
    const spans = container.querySelectorAll('span')
    assert.equal(spans.length, 3)
    assert.equal(spans[0].textContent, 'a')
    assert.equal(spans[2].textContent, 'c')
  })

  it('skips null and false values', () => {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    reactiveContent(container, anchor, () => {
      return [null, false, undefined]
    })
    // Only the anchor comment should remain
    assert.equal(container.childNodes.length, 1)
  })
})

// ---------------------------------------------------------------------------
// mountComponent / mountFunctionComponent / mount
// ---------------------------------------------------------------------------
describe('mountComponent', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('mounts a class component with props', () => {
    class MyComp extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('div')
        el.textContent = this.props?.label ?? 'no label'
        return el
      }
    }
    const container = document.createElement('div')
    const node = mountComponent(MyComp, { label: () => 'Hello' }, container)
    assert.ok(node)
    assert.equal(container.children.length, 1)
    assert.equal(container.children[0].textContent, 'Hello')
  })

  it('mounts with anchor (insertBefore)', () => {
    class MyComp extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('div')
        el.className = 'mounted'
        return el
      }
    }
    const container = document.createElement('div')
    const existing = document.createElement('span')
    container.appendChild(existing)
    const anchor = document.createComment('')
    container.appendChild(anchor)
    mountComponent(MyComp, {}, container, anchor)
    // mounted div should be before the anchor
    assert.equal(container.children[0].tagName, 'SPAN')
    assert.equal(container.children[1].className, 'mounted')
  })
})

describe('mountFunctionComponent', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('mounts a function component', () => {
    function MyFn(props: Record<string, unknown>) {
      const el = document.createElement('div')
      el.textContent = String(props.name)
      return el
    }
    const container = document.createElement('div')
    mountFunctionComponent(MyFn, { name: () => 'World' }, container)
    assert.equal(container.children[0].textContent, 'World')
  })
})

describe('mount – auto-detect class vs function', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('detects class component', () => {
    class Cls extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('div')
        el.className = 'class-comp'
        return el
      }
    }
    const container = document.createElement('div')
    mount(Cls, {}, container)
    assert.equal(container.children[0].className, 'class-comp')
  })

  it('detects function component', () => {
    function Fn() {
      const el = document.createElement('div')
      el.className = 'fn-comp'
      return el
    }
    const container = document.createElement('div')
    mount(Fn, {}, container)
    assert.equal(container.children[0].className, 'fn-comp')
  })
})

// ---------------------------------------------------------------------------
// wrapSignalValue – runtime wrapper
// ---------------------------------------------------------------------------
describe('wrapSignalValue', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('returns primitives directly', () => {
    const s = signal(42)
    assert.equal(wrapSignalValue(s), 42)
  })

  it('returns null directly', () => {
    const s = signal(null)
    assert.equal(wrapSignalValue(s), null)
  })

  it('wraps arrays', () => {
    const s = signal([1, 2, 3])
    const wrapped = wrapSignalValue(s)
    assert.ok(Array.isArray(wrapped))
    assert.equal(wrapped.length, 3)
  })

  it('wraps objects', () => {
    const s = signal({ x: 1 })
    const wrapped = wrapSignalValue(s)
    assert.equal(wrapped.x, 1)
  })
})

// ---------------------------------------------------------------------------
// Integration: Component + signals + DOM
// ---------------------------------------------------------------------------
describe('Integration: Component + signals + DOM', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('signal changes update reactive text in DOM', () => {
    const name = signal('Alice')
    const container = document.createElement('div')
    const textNode = reactiveText(() => `Hello ${name.value}`)
    container.appendChild(textNode)
    assert.equal(container.textContent, 'Hello Alice')
    name.value = 'Bob'
    assert.equal(container.textContent, 'Hello Bob')
  })

  it('component with reactive __createTemplate', () => {
    const count = signal(0)
    class Counter extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('div')
        el.appendChild(reactiveText(() => `Count: ${count.value}`))
        return el
      }
    }
    const c = new Counter()
    const container = document.createElement('div')
    c.render(container)
    assert.equal(container.textContent, 'Count: 0')
    count.value = 5
    assert.equal(container.textContent, 'Count: 5')
  })

  it('store-driven component updates', () => {
    class AppStore extends Store {
      __message = signal('hello')
      get message() {
        return this.__message.value
      }
      set message(v: string) {
        this.__message.value = v
      }
    }
    const store = new AppStore()
    const container = document.createElement('div')
    const textNode = reactiveText(() => store.message)
    container.appendChild(textNode)
    assert.equal(container.textContent, 'hello')
    store.message = 'world'
    assert.equal(container.textContent, 'world')
  })

  it('conditional rendering driven by store', () => {
    class UIStore extends Store {
      __isOpen = signal(false)
      get isOpen() {
        return this.__isOpen.value
      }
      set isOpen(v: boolean) {
        this.__isOpen.value = v
      }
    }
    const store = new UIStore()
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    conditional(
      container,
      anchor,
      () => store.isOpen,
      () => {
        const el = document.createElement('div')
        el.className = 'modal'
        el.textContent = 'Modal content'
        return el
      },
    )
    assert.equal(container.querySelector('.modal'), null)
    store.isOpen = true
    assert.ok(container.querySelector('.modal'))
    store.isOpen = false
    assert.equal(container.querySelector('.modal'), null)
  })

  it('keyed list driven by store', () => {
    class ListStore extends Store {
      __items = signal<{ id: number; text: string }[]>([])
      get items() {
        return wrapSignalValue(this.__items)
      }
      set items(v: { id: number; text: string }[]) {
        this.__items.value = v
      }
    }
    const store = new ListStore()
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    keyedList(
      container,
      anchor,
      () => store.items,
      (item) => (item as any).id,
      (getter) => {
        const el = document.createElement('div')
        el.textContent = (getter() as any).text
        return el
      },
      true,
    )
    assert.equal(container.querySelectorAll('div').length, 0)
    store.items = [
      { id: 1, text: 'first' },
      { id: 2, text: 'second' },
    ]
    const divs = container.querySelectorAll('div')
    assert.equal(divs.length, 2)
    assert.equal(divs[0].textContent, 'first')
    assert.equal(divs[1].textContent, 'second')
  })
})
