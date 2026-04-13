import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { flushMicrotasks, installDom } from '../../../../tests/helpers/jsdom-setup'
import { Component } from '../../src/runtime/component'
import { createDisposer } from '../../src/runtime/disposer'
import { GEA_CREATED_CALLED, GEA_DISPOSER, GEA_SET_PROPS } from '../../src/runtime/internal-symbols'
import { GEA_CREATE_TEMPLATE, GEA_DOM_COMPONENT, GEA_ELEMENT } from '../../src/runtime/symbols'
import { GEA_ON_PROP_CHANGE } from '../../src/symbols'

let teardown: () => void

describe('Component runtime shell', () => {
  beforeEach(() => {
    teardown = installDom()
  })

  afterEach(() => {
    teardown()
  })

  it('calls created once before first render when no compiler props were installed', () => {
    const calls: unknown[] = []
    class Plain extends Component {
      created(props?: Record<string, unknown>) {
        calls.push(props)
      }

      [GEA_CREATE_TEMPLATE](): Node {
        return document.createElement('div')
      }
    }

    const app = new Plain()
    assert.equal((app as any)[GEA_CREATED_CALLED], false)

    app.render(document.body)

    assert.equal((app as any)[GEA_CREATED_CALLED], true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0], app.props)
  })

  it('installs live prop thunks and calls created during GEA_SET_PROPS', () => {
    let source = 'first'
    let received: any
    class WithProps extends Component {
      created(props?: Record<string, unknown>) {
        received = props
      }
    }

    const app = new WithProps()
    app[GEA_SET_PROPS]({ label: () => source })

    assert.equal(received, app.props)
    assert.equal(app.props.label, 'first')
    source = 'second'
    assert.equal(app.props.label, 'second')
  })

  it('notifies GEA_ON_PROP_CHANGE for changed primitive props', () => {
    const calls: Array<[string, unknown]> = []
    let value = 1
    class WatchProps extends Component {
      [GEA_ON_PROP_CHANGE](key: string, next: unknown) {
        calls.push([key, next])
      }
    }

    const app = new WatchProps()
    app[GEA_SET_PROPS]({ value: () => value })
    value = 2
    app[GEA_SET_PROPS]({ value: () => value })

    assert.deepEqual(calls, [['value', 2]])
  })

  it('notifies GEA_ON_PROP_CHANGE for object props even when reference is stable', () => {
    const shared = { count: 1 }
    const calls: Array<[string, unknown]> = []
    class WatchObjectProps extends Component {
      [GEA_ON_PROP_CHANGE](key: string, next: unknown) {
        calls.push([key, next])
      }
    }

    const app = new WatchObjectProps()
    app[GEA_SET_PROPS]({ value: () => shared })
    shared.count = 2
    app[GEA_SET_PROPS]({ value: () => shared })

    assert.deepEqual(calls, [['value', shared]])
  })

  it('memoizes children only when the thunk returns a DOM node', () => {
    let text = 'A'
    const child = document.createElement('span')
    child.textContent = 'node'
    let useNode = false
    class ChildProps extends Component {}

    const app = new ChildProps()
    app[GEA_SET_PROPS]({
      children: () => (useNode ? child : text),
    })

    assert.equal(app.props.children, 'A')
    text = 'B'
    assert.equal(app.props.children, 'B')

    useNode = true
    assert.equal(app.props.children, child)
    text = 'C'
    assert.equal(app.props.children, child, 'node children keep identity after first node read')
  })

  it('renders element, fragment, string, null, and array template returns', () => {
    class ManyReturns extends Component {
      [GEA_CREATE_TEMPLATE](): any {
        if ((this as any).mode === 'element') {
          const el = document.createElement('strong')
          el.textContent = 'el'
          return el
        }
        if ((this as any).mode === 'fragment') {
          const frag = document.createDocumentFragment()
          frag.append('A', 'B')
          return frag
        }
        if ((this as any).mode === 'array') return ['x', document.createElement('em'), null, 3]
        if ((this as any).mode === 'null') return null
        return 'text'
      }
    }

    for (const [mode, expected] of [
      ['element', 'el'],
      ['fragment', 'AB'],
      ['array', 'x3'],
      ['null', ''],
      ['string', 'text'],
    ] as const) {
      const host = document.createElement('div')
      const app = new ManyReturns()
      ;(app as any).mode = mode
      app.render(host)
      assert.equal(host.textContent, expected, mode)
    }
  })

  it('sets el, rendered, DOM back-reference, and runs onAfterRender after insertion', () => {
    const calls: string[] = []
    class Rendered extends Component {
      [GEA_CREATE_TEMPLATE](): Node {
        const el = document.createElement('section')
        el.innerHTML = '<span class="hit">ok</span>'
        return el
      }

      onAfterRender() {
        calls.push(this.el?.querySelector('.hit')?.textContent ?? '')
      }
    }

    const host = document.createElement('div')
    const app = new Rendered()
    app.render(host)

    assert.equal(app.rendered, true)
    assert.equal(app.el, host.firstElementChild)
    assert.equal((app.el as any)[GEA_DOM_COMPONENT], app)
    assert.deepEqual(calls, ['ok'])
  })

  it('keeps onAfterRenderAsync as a public hook without base render scheduling', async () => {
    const calls: string[] = []
    class RenderedAsync extends Component {
      [GEA_CREATE_TEMPLATE](): Node {
        const el = document.createElement('section')
        el.textContent = 'ready'
        return el
      }

      onAfterRender() {
        calls.push('sync')
      }

      onAfterRenderAsync() {
        calls.push(this.el?.textContent ?? '')
      }
    }

    const host = document.createElement('div')
    const app = new RenderedAsync()
    app.render(host)

    assert.deepEqual(calls, ['sync'])
    await flushMicrotasks()
    assert.deepEqual(calls, ['sync'])
  })

  it('$ and $$ query inside the component root', () => {
    class Queryable extends Component {
      [GEA_CREATE_TEMPLATE](): Node {
        const el = document.createElement('div')
        el.innerHTML = '<span class="item">1</span><span class="item">2</span>'
        return el
      }
    }

    const app = new Queryable()
    app.render(document.body)

    assert.equal(app.$('.item')?.textContent, '1')
    assert.deepEqual(
      app.$$('.item').map((el) => el.textContent),
      ['1', '2'],
    )
  })

  it('dispose runs reactive cleanup, removes root element, and clears el', () => {
    let cleanup = 0
    class Disposable extends Component {
      [GEA_CREATE_TEMPLATE](): Node {
        this[GEA_DISPOSER].add(() => {
          cleanup++
        })
        return document.createElement('div')
      }
    }

    const host = document.createElement('div')
    const app = new Disposable()
    app.render(host)
    assert.equal(host.children.length, 1)

    app.dispose()

    assert.equal(cleanup, 1)
    assert.equal(host.children.length, 0)
    assert.equal((app as any)[GEA_ELEMENT], null)
  })

  it('inherits Store reactivity for local component fields', async () => {
    class Stateful extends Component {
      count = 0
    }

    const app = new Stateful()
    const seen: number[] = []
    app.observe('count', (value) => seen.push(value))

    app.count = 3
    await flushMicrotasks()

    assert.deepEqual(seen, [3])
  })

  it('can share a child disposer with mounted runtime work', () => {
    let disposed = 0
    const parent = createDisposer()
    const child = parent.child()
    child.add(() => {
      disposed++
    })

    parent.dispose()

    assert.equal(disposed, 1)
  })
})
