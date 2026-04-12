import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_COMPILED } from '../src/symbols'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  GEA_CHILD_COMPONENTS,
  GEA_ELEMENT,
  GEA_UPDATE_PROPS,
} from '../src/symbols'

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

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

async function loadModules() {
  const seed = `comp-${Date.now()}-${Math.random()}`
  const [compMod, storeMod, uidMod] = await Promise.all([
    import(`../src/component/component?${seed}`),
    import(`../src/store/store?${seed}`),
    import(`../src/component/uid?${seed}`),
  ])
  return {
    Component: compMod.Component as typeof import('../src/component/component').Component,
    Store: storeMod.Store as typeof import('../src/store/store').Store,
    getUid: uidMod.default as () => string,
  }
}

describe('Component', () => {
  let restoreDom: () => void
  let Component: Awaited<ReturnType<typeof loadModules>>['Component']
  let getUid: Awaited<ReturnType<typeof loadModules>>['getUid']

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
    getUid = mods.getUid
  })

  afterEach(() => {
    restoreDom()
  })

  describe('construction', () => {
    it('can be instantiated', () => {
      class A extends Component {
        template() {
          return '<div></div>'
        }
      }
      const a = new A()
      assert.ok(a instanceof Component)
    })

    it('two instances are distinct objects', () => {
      class B extends Component {
        template() {
          return '<div></div>'
        }
      }
      const b1 = new B()
      const b2 = new B()
      assert.notEqual(b1, b2)
    })

    it('getUid generates unique ids', () => {
      const id1 = getUid()
      const id2 = getUid()
      assert.notEqual(id1, id2)
      assert.equal(typeof id1, 'string')
    })
  })

  describe('template', () => {
    it('has a default template that returns undefined', () => {
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

  describe('__createTemplate', () => {
    it('returns a DocumentFragment by default', () => {
      const c = new Component()
      const node = c[GEA_CREATE_TEMPLATE]()
      assert.equal(node.nodeType, 11) // DOCUMENT_FRAGMENT_NODE
    })
  })

  describe('render', () => {
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
      // v2 render does not guard against double-render
      // calling render again appends another child
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
  })

  describe('props via __setProps', () => {
    it('sets __propThunks and __props', () => {
      class P extends Component {
        template() {
          return '<div></div>'
        }
      }
      const p = new P()
      const thunks = { color: () => 'red' }
      p[GEA_SET_PROPS](thunks)
      assert.equal(p[GEA_PROP_THUNKS], thunks)
      assert.equal(p[GEA_PROPS].color, 'red')
    })

    it('props getter returns __props', () => {
      class Q extends Component {
        template() {
          return '<div></div>'
        }
      }
      const q = new Q()
      q[GEA_SET_PROPS]({ x: () => 42 })
      assert.equal(q.props.x, 42)
    })

    it('props are lazily evaluated from thunks', () => {
      let callCount = 0
      class R extends Component {}
      const r = new R()
      r[GEA_SET_PROPS]({
        value: () => {
          callCount++
          return 'hello'
        },
      })
      assert.equal(callCount, 0)
      assert.equal(r.props.value, 'hello')
      assert.equal(callCount, 1)
      // Access again - thunk called each time (getter)
      assert.equal(r.props.value, 'hello')
      assert.equal(callCount, 2)
    })

    it('props reflect updated thunk values', () => {
      let val = 1
      class S extends Component {}
      const s = new S()
      s[GEA_SET_PROPS]({ x: () => val })
      assert.equal(s.props.x, 1)
      val = 2
      assert.equal(s.props.x, 2)
    })

    it('props are enumerable', () => {
      class T extends Component {}
      const t = new T()
      t[GEA_SET_PROPS]({ a: () => 1, b: () => 2 })
      const keys = Object.keys(t.props)
      assert.deepEqual(keys.sort(), ['a', 'b'])
    })
  })

  describe('__props and __propThunks initial state', () => {
    it('__props is null before __setProps', () => {
      const c = new Component()
      assert.equal(c[GEA_PROPS], null)
    })

    it('__propThunks is null before __setProps', () => {
      const c = new Component()
      assert.equal(c[GEA_PROP_THUNKS], null)
    })
  })

  describe('inheritance', () => {
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
  })
})
