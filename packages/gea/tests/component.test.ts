import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  GEA_CHILD_COMPONENTS,
  GEA_COMPONENT_CLASSES,
  GEA_COERCE_STATIC_PROP_VALUE,
  GEA_ELEMENT,
  GEA_NORMALIZE_PROP_NAME,
  GEA_UPDATE_PROPS,
} from '../src/lib/symbols'

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
  const mgr = await import(`../src/lib/base/component-manager?${seed}`)
  mgr.default.instance = undefined
  const [compMod, storeMod] = await Promise.all([
    import(`../src/lib/base/component.tsx?${seed}`),
    import(`../src/lib/store?${seed}`),
  ])
  return {
    Component: compMod.default as typeof import('../src/lib/base/component').default,
    Store: storeMod.Store as typeof import('../src/lib/store').Store,
    ComponentManager: mgr.default,
  }
}

describe('Component', () => {
  let restoreDom: () => void
  let Component: Awaited<ReturnType<typeof loadModules>>['Component']
  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  describe('construction', () => {
    it('has a unique id', () => {
      class A extends Component {
        template() {
          return '<div></div>'
        }
      }
      class B extends Component {
        template() {
          return '<div></div>'
        }
      }
      const a = new A()
      const b = new B()
      assert.notEqual(a.id, b.id)
    })

    it('starts unrendered', () => {
      class C extends Component {
        template() {
          return '<div></div>'
        }
      }
      const c = new C()
      assert.equal(c.rendered, false)
    })

    it('registers in ComponentManager', () => {
      class D extends Component {
        template() {
          return '<div></div>'
        }
      }
      const d = new D()
      assert.ok(d.id)
      assert.equal(typeof d.id, 'string')
    })
  })

  describe('created lifecycle', () => {
    it('calls created with props', () => {
      let receivedProps: any
      class E extends Component {
        created(props: any) {
          receivedProps = props
        }
        template() {
          return '<div></div>'
        }
      }
      new E({ hello: 'world' })
      assert.equal(receivedProps.hello, 'world')
    })
  })

  describe('render', () => {
    it('renders into container', () => {
      class F extends Component {
        template() {
          return '<div class="test-f">Hello</div>'
        }
      }
      const f = new F()
      const container = document.createElement('div')
      document.body.appendChild(container)
      f.render(container)
      assert.equal(f.rendered, true)
      assert.equal(container.children.length, 1)
      assert.equal(container.children[0].className, 'test-f')
    })

    it('does not render twice', () => {
      class G extends Component {
        template() {
          return '<div>G</div>'
        }
      }
      const g = new G()
      const container = document.createElement('div')
      document.body.appendChild(container)
      g.render(container)
      g.render(container)
      assert.equal(container.children.length, 1)
    })

    it('calls onAfterRender', () => {
      let called = false
      class H extends Component {
        template() {
          return '<div>H</div>'
        }
        onAfterRender() {
          called = true
        }
      }
      const h = new H()
      const container = document.createElement('div')
      document.body.appendChild(container)
      h.render(container)
      assert.equal(called, true)
    })
  })

  describe('el', () => {
    it('creates element from template', () => {
      class I extends Component {
        template() {
          return '<span class="i-comp">text</span>'
        }
      }
      const i = new I()
      assert.equal(i.el.tagName, 'SPAN')
      assert.equal(i.el.className, 'i-comp')
    })
  })

  describe('toString', () => {
    it('returns template HTML string', () => {
      class J extends Component {
        template() {
          return '<div>j-content</div>'
        }
      }
      const j = new J()
      assert.ok(String(j).includes('j-content'))
    })
  })

  describe('$$ and $', () => {
    it('$$ returns matching elements', () => {
      class K extends Component {
        template() {
          return '<div><span class="a">1</span><span class="a">2</span></div>'
        }
      }
      const k = new K()
      const container = document.createElement('div')
      document.body.appendChild(container)
      k.render(container)
      const results = k.$$('.a')
      assert.equal(results.length, 2)
    })

    it('$ returns first matching element', () => {
      class L extends Component {
        template() {
          return '<div><span class="b">1</span><span class="b">2</span></div>'
        }
      }
      const l = new L()
      const container = document.createElement('div')
      document.body.appendChild(container)
      l.render(container)
      const result = l.$('.b')
      assert.ok(result)
      assert.equal(result.textContent, '1')
    })

    it('$$ with :scope returns root element', () => {
      class M extends Component {
        template() {
          return '<div class="root-m">content</div>'
        }
      }
      const m = new M()
      const container = document.createElement('div')
      document.body.appendChild(container)
      m.render(container)
      const results = m.$$(':scope')
      assert.equal(results.length, 1)
      assert.equal(results[0].className, 'root-m')
    })
  })

  describe('dispose', () => {
    it('removes element from DOM', () => {
      class N extends Component {
        template() {
          return '<div>N</div>'
        }
      }
      const n = new N()
      const container = document.createElement('div')
      document.body.appendChild(container)
      n.render(container)
      assert.equal(container.children.length, 1)
      n.dispose()
      assert.equal(container.children.length, 0)
    })

    it('removes from ComponentManager and clears element', () => {
      class O extends Component {
        template() {
          return '<div>O</div>'
        }
      }
      const o = new O()
      const container = document.createElement('div')
      document.body.appendChild(container)
      o.render(container)
      assert.ok(o[GEA_ELEMENT])
      o.dispose()
      assert.equal(o[GEA_ELEMENT], null)
    })

    it('disposes child components', () => {
      let childDisposed = false
      class Child extends Component {
        template() {
          return '<div>child</div>'
        }
        dispose() {
          childDisposed = true
          super.dispose()
        }
      }
      class Parent extends Component {
        template() {
          return '<div>parent</div>'
        }
      }
      const parent = new Parent()
      const child = new Child()
      parent[GEA_CHILD_COMPONENTS].push(child)
      parent.dispose()
      assert.equal(childDisposed, true)
    })
  })

  describe('props', () => {
    it('stores props', () => {
      class P extends Component {
        template() {
          return '<div></div>'
        }
      }
      const p = new P({ color: 'red' })
      assert.equal(p.props.color, 'red')
    })

    it('coerces static prop values', () => {
      class Q extends Component {
        template() {
          return '<div></div>'
        }
      }
      const q = new Q()
      assert.equal(q[GEA_COERCE_STATIC_PROP_VALUE]('true'), true)
      assert.equal(q[GEA_COERCE_STATIC_PROP_VALUE]('false'), false)
      assert.equal(q[GEA_COERCE_STATIC_PROP_VALUE]('42'), 42)
      assert.equal(q[GEA_COERCE_STATIC_PROP_VALUE]('3.14'), 3.14)
      assert.equal(q[GEA_COERCE_STATIC_PROP_VALUE]('hello'), 'hello')
      assert.equal(q[GEA_COERCE_STATIC_PROP_VALUE](null), undefined)
    })

    it('normalizes prop names from kebab to camel', () => {
      class R extends Component {
        template() {
          return '<div></div>'
        }
      }
      const r = new R()
      assert.equal(r[GEA_NORMALIZE_PROP_NAME]('my-prop-name'), 'myPropName')
    })
  })

  describe('__geaUpdateProps', () => {
    it('updates prop values', () => {
      class S extends Component {
        template() {
          return '<div></div>'
        }
      }
      const s = new S({ x: 1 })
      s[GEA_UPDATE_PROPS]({ x: 2 })
      assert.equal(s.props.x, 2)
    })
  })

  describe('Component._register (static)', () => {
    it('registers subclass in class registry', () => {
      class TestComp extends Component {
        template() {
          return '<div></div>'
        }
      }
      Component._register(TestComp)
      assert.ok(Component[GEA_COMPONENT_CLASSES].has('TestComp'))
    })
  })

  describe('local state with store', () => {
    it('component inherits Store reactivity', async () => {
      class Stateful extends Component {
        count = 0
        template() {
          return `<div>${this.count}</div>`
        }
      }
      const s = new Stateful()
      const values: any[] = []
      s.observe('count', (v) => values.push(v))
      ;(s as any).count = 5
      await flush()
      assert.deepEqual(values, [5])
    })
  })

  describe('Map and Set reactivity in components', () => {
    it('component with Map property fires observer on Map.set()', async () => {
      class MapComp extends Component {
        data = new Map<string, number>()
        template() {
          return '<div></div>'
        }
      }
      const comp = new MapComp()
      const changes: any[][] = []
      comp.observe('data', (_v: any, c: any) => changes.push(c))
      ;(comp.data as Map<string, number>).set('count', 42)
      await flush()
      assert.equal(changes.length, 1)
      assert.equal(changes[0][0].type, 'set')
      assert.equal(changes[0][0].property, 'count')
      assert.equal(changes[0][0].newValue, 42)
    })

    it('component with Map property fires observer on Map.delete()', async () => {
      class MapComp extends Component {
        data = new Map<string, number>([['x', 1]])
        template() {
          return '<div></div>'
        }
      }
      const comp = new MapComp()
      const changes: any[][] = []
      comp.observe('data', (_v: any, c: any) => changes.push(c))
      ;(comp.data as Map<string, number>).delete('x')
      await flush()
      assert.equal(changes.length, 1)
      assert.equal(changes[0][0].type, 'delete')
      assert.equal(changes[0][0].property, 'x')
    })

    it('component with Map property does not fire observer when setting same value', async () => {
      class MapComp extends Component {
        data = new Map<string, number>([['a', 1]])
        template() {
          return '<div></div>'
        }
      }
      const comp = new MapComp()
      const changes: any[][] = []
      comp.observe('data', (_v: any, c: any) => changes.push(c))
      ;(comp.data as Map<string, number>).set('a', 1)
      await flush()
      assert.equal(changes.length, 0)
    })

    it('component Map proxy returns stable reference', () => {
      class MapComp extends Component {
        counters = new Map<string, number>()
        template() {
          return '<div></div>'
        }
      }
      const comp = new MapComp()
      assert.equal(comp.counters, comp.counters)
    })

    it('component with Set property fires observer on Set.add()', async () => {
      class TagComp extends Component {
        tags = new Set<string>()
        template() {
          return '<div></div>'
        }
      }
      const comp = new TagComp()
      const changes: any[][] = []
      comp.observe('tags', (_v: any, c: any) => changes.push(c))
      ;(comp.tags as Set<string>).add('react')
      await flush()
      assert.equal(changes.length, 1)
      assert.equal(changes[0][0].type, 'set')
      assert.equal(changes[0][0].property, 'react')
      assert.equal(changes[0][0].newValue, 'react')
    })

    it('component with Set property fires observer on Set.delete()', async () => {
      class TagComp extends Component {
        tags = new Set<string>(['foo', 'bar'])
        template() {
          return '<div></div>'
        }
      }
      const comp = new TagComp()
      const changes: any[][] = []
      comp.observe('tags', (_v: any, c: any) => changes.push(c))
      ;(comp.tags as Set<string>).delete('foo')
      await flush()
      assert.equal(changes.length, 1)
      assert.equal(changes[0][0].type, 'delete')
      assert.equal(changes[0][0].property, 'foo')
    })

    it('component Set proxy returns stable reference', () => {
      class SetComp extends Component {
        ids = new Set<number>()
        template() {
          return '<div></div>'
        }
      }
      const comp = new SetComp()
      assert.equal(comp.ids, comp.ids)
    })

    it('component renders Map-based content and observer tracks key change', async () => {
      class DictComp extends Component {
        dict = new Map<string, string>([['greeting', 'Hello']])
        getGreeting() {
          return (this.dict as Map<string, string>).get('greeting') ?? ''
        }
        template() {
          return `<div>${this.getGreeting()}</div>`
        }
      }
      const comp = new DictComp()
      const container = document.createElement('div')
      document.body.appendChild(container)
      comp.render(container)
      assert.ok(container.textContent?.includes('Hello'))
      const changes: any[][] = []
      comp.observe('dict', (_v: any, c: any) => changes.push(c))
      ;(comp.dict as Map<string, string>).set('greeting', 'Hi')
      await flush()
      assert.equal(changes.length, 1)
      assert.equal(changes[0][0].newValue, 'Hi')
    })

    it('component with Set fires observer on Set.clear() only when non-empty', async () => {
      class FlagComp extends Component {
        flags = new Set<string>(['active', 'visible'])
        template() {
          return '<div></div>'
        }
      }
      const comp = new FlagComp()
      const changes: any[][] = []
      comp.observe('flags', (_v: any, c: any) => changes.push(c))
      ;(comp.flags as Set<string>).clear()
      await flush()
      assert.equal(changes.length, 1)
      ;(comp.flags as Set<string>).clear()
      await flush()
      assert.equal(changes.length, 1, 'clear on empty set must not fire again')
    })
  })
})
