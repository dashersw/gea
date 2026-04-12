/**
 * component-helpers.test.ts
 *
 * Tests for v2 component helper patterns: child components via mountComponent,
 * reactive text updates, store observation via effects, list reconciliation
 * via keyedList, and component disposal patterns.
 *
 * Replaces the v1 proxy-based helper tests (GEA_CHILD, GEA_EL, GEA_UPDATE_TEXT,
 * GEA_OBSERVE, GEA_OBSERVE_LIST, GEA_RECONCILE_LIST) with equivalent v2 patterns.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { Component } from '../src/component/component'
import { Store } from '../src/store/store'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_COMPILED } from '../src/symbols'
import { signal } from '../src/signals/signal'
import { effect, computation } from '../src/signals/effect'
import { batch } from '../src/signals/batch'
import { resetBatch } from '../src/signals/batch'
import { resetState } from '../src/signals/tracking'
import { wrapSignalValue } from '../src/reactive/wrap-signal-value'
import { mountComponent } from '../src/dom/mount'
import { keyedList } from '../src/dom/keyed-list'
import { reactiveText } from '../src/dom/text'
import { reactiveAttr } from '../src/dom/attributes'

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
// Child component mounting (replaces v1 GEA_CHILD)
// ---------------------------------------------------------------------------
describe('Child component mounting via mountComponent', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('mounts child into parent container', () => {
    class Child extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('span')
        el.textContent = 'child'
        return el
      }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    mountComponent(Child, {}, container)
    assert.equal(container.children.length, 1)
    assert.equal(container.children[0].textContent, 'child')
  })

  it('passes props correctly to child', () => {
    class Child extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('span')
        el.textContent = `${this.props.color}-${this.props.count}`
        return el
      }
    }
    const container = document.createElement('div')
    mountComponent(Child, { color: () => 'blue', count: () => 42 }, container)
    assert.equal(container.children[0].textContent, 'blue-42')
  })

  it('child receives reactive props from signals', () => {
    const color = signal('red')
    class Child extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('span')
        const text = reactiveText(() => this.props.color)
        el.appendChild(text)
        return el
      }
    }
    const container = document.createElement('div')
    mountComponent(Child, { color: () => color.value }, container)
    assert.equal(container.textContent, 'red')
    color.value = 'blue'
    assert.equal(container.textContent, 'blue')
  })

  it('mounts multiple children', () => {
    class Child extends Component {
      [GEA_CREATE_TEMPLATE]() {
        const el = document.createElement('li')
        el.textContent = String(this.props.text)
        return el
      }
    }
    const container = document.createElement('ul')
    mountComponent(Child, { text: () => 'first' }, container)
    mountComponent(Child, { text: () => 'second' }, container)
    mountComponent(Child, { text: () => 'third' }, container)
    assert.equal(container.children.length, 3)
    assert.equal(container.children[0].textContent, 'first')
    assert.equal(container.children[2].textContent, 'third')
  })
})

// ---------------------------------------------------------------------------
// Reactive text updates (replaces v1 GEA_UPDATE_TEXT)
// ---------------------------------------------------------------------------
describe('Reactive text updates via reactiveText', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('updates textContent of text node reactively', () => {
    const message = signal('old')
    const container = document.createElement('div')
    const text = reactiveText(() => message.value)
    container.appendChild(text)
    assert.equal(container.textContent, 'old')
    message.value = 'new'
    assert.equal(container.textContent, 'new')
  })

  it('handles empty string', () => {
    const s = signal('')
    const node = reactiveText(() => s.value)
    assert.equal(node.data, '')
  })

  it('converts numbers to string', () => {
    const s = signal<any>(42)
    const node = reactiveText(() => s.value)
    assert.equal(node.data, '42')
    s.value = 0
    assert.equal(node.data, '0')
  })
})

// ---------------------------------------------------------------------------
// Store observation via effects (replaces v1 GEA_OBSERVE)
// ---------------------------------------------------------------------------
describe('Store observation via effects', () => {
  beforeEach(() => {
    resetState()
    resetBatch()
  })

  it('effect tracks store field changes', () => {
    class TestStore extends Store {
      __count = signal(0)
      get count() {
        return this.__count.value
      }
      set count(v: number) {
        this.__count.value = v
      }
    }
    const store = new TestStore()
    const values: number[] = []
    effect(() => {
      values.push(store.count)
    })
    assert.deepEqual(values, [0])
    store.count = 5
    assert.deepEqual(values, [0, 5])
  })

  it('dispose stops tracking store changes', () => {
    class TestStore extends Store {
      __count = signal(0)
      get count() {
        return this.__count.value
      }
      set count(v: number) {
        this.__count.value = v
      }
    }
    const store = new TestStore()
    const values: number[] = []
    const dispose = effect(() => {
      values.push(store.count)
    })
    store.count = 5
    assert.deepEqual(values, [0, 5])
    dispose()
    store.count = 10
    assert.deepEqual(values, [0, 5]) // no new value after dispose
  })

  it('tracks multiple store fields', () => {
    class UserStore extends Store {
      __name = signal('Alice')
      get name() {
        return this.__name.value
      }
      set name(v: string) {
        this.__name.value = v
      }
      __age = signal(25)
      get age() {
        return this.__age.value
      }
      set age(v: number) {
        this.__age.value = v
      }
    }
    const store = new UserStore()
    let observed = ''
    effect(() => {
      observed = `${store.name}-${store.age}`
    })
    assert.equal(observed, 'Alice-25')
    store.name = 'Bob'
    assert.equal(observed, 'Bob-25')
    store.age = 30
    assert.equal(observed, 'Bob-30')
  })

  it('batched store mutations produce single effect run', () => {
    class TestStore extends Store {
      __x = signal(0)
      get x() {
        return this.__x.value
      }
      set x(v: number) {
        this.__x.value = v
      }
      __y = signal(0)
      get y() {
        return this.__y.value
      }
      set y(v: number) {
        this.__y.value = v
      }
    }
    const store = new TestStore()
    let runCount = 0
    effect(() => {
      store.x
      store.y
      runCount++
    })
    assert.equal(runCount, 1)
    batch(() => {
      store.x = 1
      store.y = 2
    })
    assert.equal(runCount, 2) // single flush
  })
})

// ---------------------------------------------------------------------------
// List rendering via keyedList (replaces v1 GEA_RECONCILE_LIST)
// ---------------------------------------------------------------------------
describe('List rendering via keyedList', () => {
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

  function setupList(initial: { id: number; text: string }[] = []) {
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    const items = signal(initial)
    keyedList(
      container,
      anchor,
      () => items.value,
      (item) => (item as any).id,
      (getter) => {
        const el = document.createElement('li')
        el.textContent = (getter() as any).text
        return el
      },
      true,
    )
    return { container, items }
  }

  it('removes disposed items and keeps survivors', () => {
    const { container, items } = setupList([
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
      { id: 3, text: 'c' },
    ])
    assert.deepEqual(getTexts(container), ['a', 'b', 'c'])
    items.value = [
      { id: 1, text: 'a' },
      { id: 3, text: 'c' },
    ]
    assert.deepEqual(getTexts(container), ['a', 'c'])
  })

  it('adds new items for new keys', () => {
    const { container, items } = setupList([{ id: 1, text: 'a' }])
    items.value = [
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
    ]
    assert.deepEqual(getTexts(container), ['a', 'b'])
  })

  it('reorders items to match new data order', () => {
    const { container, items } = setupList([
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
      { id: 3, text: 'c' },
    ])
    items.value = [
      { id: 3, text: 'c' },
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
    ]
    assert.deepEqual(getTexts(container), ['c', 'a', 'b'])
  })

  it('preserves static DOM siblings before list', () => {
    const container = document.createElement('div')
    const marker = document.createElement('span')
    marker.className = 'static-marker'
    marker.textContent = 'status'
    container.appendChild(marker)
    const anchor = document.createComment('')
    container.appendChild(anchor)
    const items = signal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ])
    keyedList(
      container,
      anchor,
      () => items.value,
      (item) => (item as any).id,
      (getter) => {
        const el = document.createElement('button')
        el.textContent = (getter() as any).label
        return el
      },
      true,
    )
    assert.equal(container.firstElementChild, marker)
    items.value = [
      { id: 3, label: 'c' },
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ]
    assert.equal(container.firstElementChild, marker, 'static sibling must stay first after reorder')
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent)
    assert.deepEqual(buttons, ['c', 'a', 'b'])
  })
})

// ---------------------------------------------------------------------------
// Store-driven list observation (replaces v1 GEA_OBSERVE_LIST)
// ---------------------------------------------------------------------------
describe('Store-driven list observation', () => {
  let restoreDom: () => void

  beforeEach(() => {
    resetState()
    resetBatch()
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('appends items on push', () => {
    class TodoStore extends Store {
      __todos = signal<{ id: number; text: string }[]>([])
      get todos() {
        return wrapSignalValue(this.__todos)
      }
      set todos(v: { id: number; text: string }[]) {
        this.__todos.value = v
      }
      add(text: string) {
        return batch(() => {
          this.todos = [...this.__todos.peek(), { id: this.__todos.peek().length + 1, text }]
        })
      }
    }
    const store = new TodoStore()
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    keyedList(
      container,
      anchor,
      () => store.todos,
      (item) => (item as any).id,
      (getter) => {
        const el = document.createElement('li')
        el.textContent = (getter() as any).text
        return el
      },
      true,
    )
    assert.equal(container.querySelectorAll('li').length, 0)
    store.add('first')
    assert.equal(container.querySelectorAll('li').length, 1)
    assert.equal(container.querySelector('li')!.textContent, 'first')
  })

  it('reconciles on filter (remove)', () => {
    class TodoStore extends Store {
      __todos = signal<{ id: number; text: string }[]>([])
      get todos() {
        return wrapSignalValue(this.__todos)
      }
      set todos(v: { id: number; text: string }[]) {
        this.__todos.value = v
      }
      add(text: string) {
        return batch(() => {
          this.todos = [...this.__todos.peek(), { id: this.__todos.peek().length + 1, text }]
        })
      }
      remove(id: number) {
        return batch(() => {
          this.todos = this.__todos.peek().filter((t) => t.id !== id)
        })
      }
    }
    const store = new TodoStore()
    const container = document.createElement('div')
    const anchor = document.createComment('')
    container.appendChild(anchor)
    keyedList(
      container,
      anchor,
      () => store.todos,
      (item) => (item as any).id,
      (getter) => {
        const el = document.createElement('li')
        el.textContent = (getter() as any).text
        return el
      },
      true,
    )
    store.add('first')
    store.add('second')
    assert.equal(container.querySelectorAll('li').length, 2)
    store.remove(1)
    assert.equal(container.querySelectorAll('li').length, 1)
    assert.equal(container.querySelector('li')!.textContent, 'second')
  })
})
