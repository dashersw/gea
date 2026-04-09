import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  GEA_APPLY_LIST_CHANGES,
  GEA_CHILD_COMPONENTS,
  GEA_CLONE_ITEM,
  GEA_COMPILED_CHILD,
  GEA_COMPONENT_CLASSES,
  GEA_DOM_COMPILED_CHILD_ROOT,
  GEA_DOM_ITEM,
  GEA_DOM_KEY,
  GEA_ELEMENT,
  GEA_EXTRACT_COMPONENT_PROPS,
  GEA_ID,
  GEA_INSTANTIATE_CHILD_COMPONENTS,
  GEA_MAP_CONFIG_COUNT,
  GEA_MAP_CONFIG_PREV,
  GEA_MOUNT_COMPILED_CHILD_COMPONENTS,
  GEA_OBSERVER_REMOVERS,
  GEA_ON_PROP_CHANGE,
  GEA_PARENT_COMPONENT,
  GEA_PATCH_COND,
  GEA_PROXY_GET_RAW_TARGET,
  GEA_PROXY_IS_PROXY,
  GEA_PROP_BINDING_ATTR_PREFIX,
  GEA_PROP_BINDINGS,
  GEA_REGISTER_COND,
  GEA_REGISTER_MAP,
  GEA_RENDERED,
  GEA_REQUEST_RENDER,
  GEA_REACTIVE_PROPS,
  GEA_SELF_LISTENERS,
  GEA_SETUP_LOCAL_STATE_OBSERVERS,
  GEA_SETUP_REFS,
  GEA_STORE_ROOT,
  GEA_SWAP_CHILD,
  GEA_SYNC_ITEMS,
  GEA_SYNC_MAP,
  GEA_TEARDOWN_SELF_LISTENERS,
  GEA_UPDATE_PROPS,
  geaCondValueSymbol,
} from '../src/lib/symbols'

function engineThis(c: object): any {
  return (c as any)[GEA_PROXY_GET_RAW_TARGET] ?? c
}

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
    HTMLUnknownElement: globalThis.HTMLUnknownElement,
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
    HTMLUnknownElement: dom.window.HTMLUnknownElement,
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
  const seed = `cc-${Date.now()}-${Math.random()}`
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

describe('Component – props constructor', () => {
  let restoreDom: () => void
  let Component: any
  let Store: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
    Store = mods.Store
  })

  afterEach(() => {
    restoreDom()
  })

  it('accepts plain object props', () => {
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A({ color: 'red' })
    assert.equal(a.props.color, 'red')
  })

  it('accepts proxy props and preserves proxy reference', () => {
    const store = new Store({ color: 'red' })
    class B extends Component {
      template() {
        return '<div></div>'
      }
    }
    const b = new B(store)
    assert.equal(b.props.color, 'red')
  })

  it('preserves object proxy references inside props', () => {
    const store = new Store({ user: { name: 'Alice' } })
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C({ user: store.user })
    assert.equal(c.props.user.name, 'Alice')
    assert.ok(c.props.user[GEA_PROXY_IS_PROXY], 'object prop should retain parent proxy')
  })

  it('[GEA_ON_PROP_CHANGE] is called via [GEA_UPDATE_PROPS]', () => {
    const calls: [string, any][] = []
    class D extends Component {
      [GEA_ON_PROP_CHANGE](prop: string, val: any) {
        calls.push([prop, val])
      }
      template() {
        return '<div></div>'
      }
    }
    const d = new D({ x: 1 })
    d[GEA_UPDATE_PROPS]({ x: 99 })
    assert.ok(calls.some(([p, v]) => p === 'x' && v === 99))
  })
})

describe('Component – render positioning', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('inserts at specific index when not already parented', () => {
    class A extends Component {
      template() {
        return '<div class="a">A</div>'
      }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.appendChild(document.createElement('span'))
    container.appendChild(document.createElement('span'))
    const a = new A()
    a.render(container, 1)
    assert.equal(container.children[1].className, 'a')
  })

  it('handles negative opt_index by treating as Infinity', () => {
    class B extends Component {
      template() {
        return '<div class="b">B</div>'
      }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.appendChild(document.createElement('span'))
    const b = new B()
    b.render(container, -1)
    assert.equal(container.lastElementChild!.className, 'b')
  })

  it('repositions element when already parented at wrong index', () => {
    class C extends Component {
      template() {
        return '<div class="c">C</div>'
      }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const c = new C()
    container.appendChild(c.el)
    container.appendChild(document.createElement('span'))
    container.appendChild(document.createElement('span'))
    c.render(container, 0)
    assert.equal(c.rendered, true)
  })
})

describe('Component – __geaRequestRender', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('re-renders the component in place', () => {
    let renderCount = 0
    class R extends Component {
      template() {
        renderCount++
        return `<div class="r">render-${renderCount}</div>`
      }
    }
    const r = new R()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const beforeRender = renderCount
    r.render(container)
    assert.ok(renderCount > beforeRender)
    const beforeRerender = renderCount
    r[GEA_REQUEST_RENDER]()
    assert.ok(renderCount > beforeRerender)
    assert.ok(r[GEA_ELEMENT])
    assert.equal(r[GEA_ELEMENT].parentNode, container)
  })

  it('does nothing when element has no parent', () => {
    class S extends Component {
      template() {
        return '<div>S</div>'
      }
    }
    const s = new S()
    s[GEA_REQUEST_RENDER]() // should not throw
  })

  it('preserves focus on re-render', () => {
    class T extends Component {
      template() {
        return '<div><input id="inp" type="text" /></div>'
      }
    }
    const t = new T()
    const container = document.createElement('div')
    document.body.appendChild(container)
    t.render(container)
    const input = document.getElementById('inp') as HTMLInputElement
    if (input) {
      input.focus()
      input.value = 'hello'
      if (input.setSelectionRange) input.setSelectionRange(2, 2)
    }
    t[GEA_REQUEST_RENDER]()
    assert.ok(t[GEA_ELEMENT])
  })

  it('disposes non-compiled child components on re-render', () => {
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
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    const child = new Child()
    parent[GEA_CHILD_COMPONENTS].push(child)
    parent[GEA_REQUEST_RENDER]()
    assert.equal(childDisposed, true)
  })

  it('skips dispose for compiled child components', () => {
    class CompiledChild extends Component {
      [GEA_COMPILED_CHILD] = true
      template() {
        return '<div>compiled</div>'
      }
    }
    class Parent extends Component {
      template() {
        return '<div>parent</div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    const cc = new CompiledChild()
    cc[GEA_RENDERED] = true
    cc[GEA_ELEMENT] = document.createElement('div')
    parent[GEA_CHILD_COMPONENTS].push(cc)
    parent[GEA_REQUEST_RENDER]()
    assert.equal(cc[GEA_RENDERED], false)
    assert.equal(cc[GEA_ELEMENT], null)
  })

  it('calls onAfterRender and onAfterRenderHooks on re-render', () => {
    let afterRenderCalled = false
    let hooksCalled = false
    class U extends Component {
      template() {
        return '<div>U</div>'
      }
      onAfterRender() {
        afterRenderCalled = true
      }
      onAfterRenderHooks() {
        hooksCalled = true
      }
    }
    const u = new U()
    const container = document.createElement('div')
    document.body.appendChild(container)
    u.render(container)
    assert.equal(afterRenderCalled, true)
    assert.equal(hooksCalled, true)
    afterRenderCalled = false
    hooksCalled = false
    u[GEA_REQUEST_RENDER]()
    assert.equal(afterRenderCalled, true)
    assert.equal(hooksCalled, true)
  })
})

describe('Component – __geaUpdateProps', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('calls [GEA_ON_PROP_CHANGE] when defined', () => {
    const calls: [string, any][] = []
    class A extends Component {
      [GEA_ON_PROP_CHANGE](p: string, v: any) {
        calls.push([p, v])
      }
      template() {
        return '<div></div>'
      }
    }
    const a = new A({ x: 1 })
    a[GEA_UPDATE_PROPS]({ x: 2 })
    assert.ok(calls.some(([p, v]) => p === 'x' && v === 2))
  })

  it('calls [GEA_ON_PROP_CHANGE] for object props even when reference is same', () => {
    const calls: [string, any][] = []
    const obj = { a: 1 }
    class B extends Component {
      [GEA_ON_PROP_CHANGE](p: string, v: any) {
        calls.push([p, v])
      }
      template() {
        return '<div></div>'
      }
    }
    const b = new B({ data: obj })
    b[GEA_UPDATE_PROPS]({ data: obj })
    assert.ok(calls.length > 0)
  })

  it('calls [GEA_REQUEST_RENDER] when no [GEA_ON_PROP_CHANGE]', () => {
    let renderRequested = false
    class C extends Component {
      template() {
        return '<div></div>'
      }
      [GEA_REQUEST_RENDER]() {
        renderRequested = true
      }
    }
    const c = new C({ x: 1 })
    c[GEA_UPDATE_PROPS]({ x: 2 })
    assert.equal(renderRequested, true)
  })

  it('auto-discovers element by id when not yet rendered', () => {
    class D extends Component {
      template() {
        return '<div></div>'
      }
      [GEA_ON_PROP_CHANGE]() {}
    }
    const d = new D({ x: 1 })
    const el = document.createElement('div')
    el.id = d[GEA_ID]
    document.body.appendChild(el)
    d[GEA_UPDATE_PROPS]({ x: 2 })
    assert.equal(d[GEA_RENDERED], true)
    assert.equal(d[GEA_ELEMENT], el)
  })
})

describe('Component – __geaSwapChild', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('swaps child component at marker position', () => {
    class Parent extends Component {
      template() {
        return '<div><template id="' + this[GEA_ID] + '-slot1"></template></div>'
      }
    }
    class ChildA extends Component {
      template() {
        return '<span class="child-a">A</span>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    const childA = new ChildA()
    engineThis(childA)[GEA_PARENT_COMPONENT] = parent
    parent[GEA_SWAP_CHILD]('slot1', childA)
    assert.ok(parent[GEA_CHILD_COMPONENTS].includes(childA))
  })

  it('removes old child before inserting new', () => {
    class Parent extends Component {
      template() {
        return '<div><template id="' + this[GEA_ID] + '-slot1"></template></div>'
      }
    }
    class Child extends Component {
      template() {
        return '<span class="child">C</span>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    const first = new Child()
    engineThis(first)[GEA_PARENT_COMPONENT] = parent
    parent[GEA_SWAP_CHILD]('slot1', first)
    const second = new Child()
    engineThis(second)[GEA_PARENT_COMPONENT] = parent
    parent[GEA_SWAP_CHILD]('slot1', second)
    assert.ok(second[GEA_ELEMENT])
  })

  it('removes old child when new is falsy', () => {
    class Parent extends Component {
      template() {
        return '<div><template id="' + this[GEA_ID] + '-slot1"></template></div>'
      }
    }
    class Child extends Component {
      template() {
        return '<span>C</span>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    const child = new Child()
    engineThis(child)[GEA_PARENT_COMPONENT] = parent
    parent[GEA_SWAP_CHILD]('slot1', child)
    parent[GEA_SWAP_CHILD]('slot1', null)
  })

  it('does nothing when marker not found', () => {
    class Parent extends Component {
      template() {
        return '<div>no marker</div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    parent[GEA_SWAP_CHILD]('nonexistent', null) // should not throw
  })
})

describe('Component – __geaRegisterMap and __geaSyncMap', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('registers and syncs a map', () => {
    class M extends Component {
      template() {
        return '<div><ul id="list-' + this[GEA_ID] + '"></ul></div>'
      }
    }
    const m = new M()
    const container = document.createElement('div')
    document.body.appendChild(container)
    m.render(container)
    const list = document.getElementById('list-' + m[GEA_ID])!
    m[GEA_REGISTER_MAP](
      0,
      'listContainer',
      () => list,
      () => ['a', 'b'],
      (item: any) => {
        const li = document.createElement('li')
        li.textContent = item
        li.setAttribute('data-gid', item)
        return li
      },
    )
    m[GEA_SYNC_MAP](0)
    assert.equal(list.children.length, 2)
  })

  it('does nothing when not rendered', () => {
    class N extends Component {
      template() {
        return '<div></div>'
      }
    }
    const n = new N()
    n[GEA_REGISTER_MAP](
      0,
      'c',
      () => null,
      () => [],
      () => document.createElement('div'),
    )
    n[GEA_SYNC_MAP](0) // should not throw
  })

  it('does nothing for unknown map index', () => {
    class O extends Component {
      template() {
        return '<div></div>'
      }
    }
    const o = new O()
    const container = document.createElement('div')
    document.body.appendChild(container)
    o.render(container)
    o[GEA_SYNC_MAP](99) // should not throw
  })

  it('re-resolves map container after DOM replacement so sync targets the live tree', () => {
    const data = ['a', 'b']
    class M extends Component {
      template() {
        return '<div><ul id="map-' + this[GEA_ID] + '"></ul></div>'
      }
    }
    const m = new M()
    const wrap = document.createElement('div')
    document.body.appendChild(wrap)
    m.render(wrap)
    const createFn = (item: any) => {
      const li = document.createElement('li')
      li.textContent = item
      li.setAttribute('data-gid', item)
      return li
    }
    m[GEA_REGISTER_MAP](
      0,
      'liveMapContainer',
      () => document.getElementById('map-' + m[GEA_ID])!,
      () => data,
      createFn,
    )
    m[GEA_SYNC_MAP](0)
    const firstList = document.getElementById('map-' + m[GEA_ID])!
    assert.equal(firstList.children.length, 2)
    m[GEA_ELEMENT].innerHTML = '<ul id="map-' + m[GEA_ID] + '"></ul>'
    const secondList = document.getElementById('map-' + m[GEA_ID])!
    assert.notEqual(firstList, secondList)
    assert.equal(secondList.children.length, 0, 'fresh ul is empty before resync')
    m[GEA_SYNC_MAP](0)
    assert.equal(secondList.children.length, 2, 'live list must repopulate after root HTML swap')
    assert.equal(firstList.isConnected, false)
  })
})

describe('Component – __geaSyncItems', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  function mkItem(id: string) {
    const el = document.createElement('div')
    el.setAttribute('data-gid', id)
    el.textContent = id
    ;(el as any)[GEA_DOM_ITEM] = id
    return el
  }

  it('appends items when prev is prefix of new list', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('1'))
    list.appendChild(mkItem('2'))
    ;(list as any)[GEA_MAP_CONFIG_PREV] = ['1', '2']
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 2
    s[GEA_SYNC_ITEMS](list, ['1', '2', '3'], mkItem)
    assert.equal(list.children.length, 3)
  })

  it('removes items when new list is subset', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('1'))
    list.appendChild(mkItem('2'))
    list.appendChild(mkItem('3'))
    ;(list as any)[GEA_MAP_CONFIG_PREV] = ['1', '2', '3']
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 3
    s[GEA_SYNC_ITEMS](list, ['1', '3'], mkItem)
    assert.equal(list.children.length, 2)
  })

  it('does nothing when lists are identical', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('a'))
    ;(list as any)[GEA_MAP_CONFIG_PREV] = ['a']
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 1
    s[GEA_SYNC_ITEMS](list, ['a'], mkItem)
    assert.equal(list.children.length, 1)
  })

  it('full rebuild when lists differ completely', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('a'))
    list.appendChild(mkItem('b'))
    ;(list as any)[GEA_MAP_CONFIG_PREV] = ['a', 'b']
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 2
    s[GEA_SYNC_ITEMS](list, ['x', 'y', 'z'], mkItem)
    assert.equal(list.children.length, 3)
  })

  it('initializes __geaPrev from existing DOM children', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('x'))
    list.appendChild(mkItem('y'))
    s[GEA_SYNC_ITEMS](list, ['x', 'y'], mkItem)
    assert.equal((list as any)[GEA_MAP_CONFIG_PREV].length, 2)
  })

  it('after empty-list placeholder, growing from zero removes placeholder and does not leave extra siblings', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    const empty = document.createElement('div')
    empty.className = 'list-empty'
    empty.textContent = 'No items'
    list.appendChild(empty)
    ;(list as any)[GEA_MAP_CONFIG_PREV] = []
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 0
    s[GEA_SYNC_ITEMS](list, ['a', 'b', 'c'], mkItem)
    assert.equal(list.querySelectorAll('[data-gid]').length, 3)
    assert.equal(
      list.querySelectorAll('.list-empty').length,
      0,
      'ternary empty branch must not remain when items appear',
    )
    assert.equal(list.children.length, 3)
  })
})

describe('Component – __geaCloneItem', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('clones an item with template caching', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    const renderFn = (item: any) => `<li>${item.label}</li>`
    const el1 = c[GEA_CLONE_ITEM](list, { id: 1, label: 'a' }, renderFn, 'list1')
    assert.ok(el1)
    assert.equal((el1 as any)[GEA_DOM_KEY], '1')
    const el2 = c[GEA_CLONE_ITEM](list, { id: 2, label: 'b' }, renderFn, 'list1')
    assert.equal((el2 as any)[GEA_DOM_KEY], '2')
  })

  it('applies patches to cloned items', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    const renderFn = (_item: any) => `<li><span>text</span></li>`
    const patches = [
      [[0], 'c', 'highlight'],
      [[0], 't', 'new text'],
    ]
    const el = c[GEA_CLONE_ITEM](list, { id: 1, label: 'x' }, renderFn, undefined, undefined, patches)
    const span = el.children[0]
    assert.equal(span.className, 'highlight')
    assert.equal(span.textContent, 'new text')
  })

  it('applies attribute patches including removal', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    const renderFn = () => `<li><span data-x="old">text</span></li>`
    const patches = [[[0], 'data-x', null]]
    const el = c[GEA_CLONE_ITEM](list, { id: 1, label: '' }, renderFn, undefined, undefined, patches)
    assert.equal(el.children[0].hasAttribute('data-x'), false)
  })

  it('uses custom itemIdProp', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    const renderFn = () => `<li>item</li>`
    const el = c[GEA_CLONE_ITEM](list, { key: 'abc', label: '' }, renderFn, undefined, 'key')
    assert.equal((el as any)[GEA_DOM_KEY], 'abc')
  })
})

describe('Component – __geaRegisterCond and __geaPatchCond', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('patches conditional slot: truthy branch', () => {
    class C extends Component {
      template() {
        return '<div><!--' + this[GEA_ID] + '-cond0--><!--' + this[GEA_ID] + '-cond0-end--></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    c[GEA_REGISTER_COND](
      0,
      'cond0',
      () => true,
      () => '<span>yes</span>',
      () => '<span>no</span>',
    )
    const changed = c[GEA_PATCH_COND](0)
    assert.equal(changed, true)
    const root = c[GEA_ELEMENT]
    assert.ok(root!.innerHTML.includes('yes'))
  })

  it('patches conditional slot: falsy branch', () => {
    class C extends Component {
      template() {
        return '<div><!--' + this[GEA_ID] + '-cond1--><!--' + this[GEA_ID] + '-cond1-end--></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    c[GEA_REGISTER_COND](
      1,
      'cond1',
      () => false,
      () => '<span>yes</span>',
      () => '<span>no</span>',
    )
    const changed = c[GEA_PATCH_COND](1)
    assert.equal(changed, true)
    assert.ok(c[GEA_ELEMENT]!.innerHTML.includes('no'))
  })

  it('does not patch when condition unchanged', () => {
    class C extends Component {
      template() {
        return '<div><!--' + this[GEA_ID] + '-cond2--><!--' + this[GEA_ID] + '-cond2-end--></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    c[GEA_REGISTER_COND](
      2,
      'cond2',
      () => true,
      () => '<span>yes</span>',
      null,
    )
    c[GEA_PATCH_COND](2) // first call records cond state
    const changed = c[GEA_PATCH_COND](2) // second call, same condition
    assert.equal(changed, false)
  })

  it('[GEA_PATCH_COND] invokes [GEA_SETUP_REFS] after patching (ref targets stay in sync)', () => {
    let setupCalls = 0
    class C extends Component {
      template() {
        return '<div><!--' + this[GEA_ID] + '-condRef--><!--' + this[GEA_ID] + '-condRef-end--></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    ;(c as any)[GEA_SETUP_REFS] = () => {
      setupCalls++
    }
    c[GEA_REGISTER_COND](
      6,
      'condRef',
      () => true,
      () => '<span data-gea-ref="x">yes</span>',
      () => '<span>no</span>',
    )
    c[GEA_PATCH_COND](6)
    assert.equal(setupCalls, 1)
    c[GEA_PATCH_COND](6)
    assert.equal(setupCalls, 2)
  })

  it('removes old content and inserts new on condition flip', () => {
    let condition = true
    class C extends Component {
      template() {
        return '<div><!--' + this[GEA_ID] + '-cond3--><!--' + this[GEA_ID] + '-cond3-end--></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    c[GEA_REGISTER_COND](
      3,
      'cond3',
      () => condition,
      () => '<span>T</span>',
      () => '<span>F</span>',
    )
    c[GEA_PATCH_COND](3)
    assert.ok(c[GEA_ELEMENT]!.innerHTML.includes('T'))
    condition = false
    c[GEA_PATCH_COND](3)
    assert.ok(c[GEA_ELEMENT]!.innerHTML.includes('F'))
    assert.ok(!c[GEA_ELEMENT]!.innerHTML.includes('T'))
  })

  it('returns false for unregistered cond index', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    assert.equal(c[GEA_PATCH_COND](99), false)
  })

  it('handles null htmlFn (no content for branch)', () => {
    class C extends Component {
      template() {
        return '<div><!--' + this[GEA_ID] + '-cond4--><!--' + this[GEA_ID] + '-cond4-end--></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    c[GEA_REGISTER_COND](4, 'cond4', () => true, null, null)
    const changed = c[GEA_PATCH_COND](4)
    assert.equal(changed, true)
  })

  it('empty falsy reinjection removes placeholder but keeps keyed list rows between markers', () => {
    class C extends Component {
      template() {
        return (
          '<div><!--' + this[GEA_ID] + '-cond5--><p class="ph">empty</p><!--' + this[GEA_ID] + '-cond5-end--></div>'
        )
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const root = c[GEA_ELEMENT] as HTMLElement
    const endWalker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
    let endMarker: Comment | null = null
    let n: Comment | null = endWalker.nextNode() as Comment | null
    while (n) {
      if (n.nodeValue === c[GEA_ID] + '-cond5-end') {
        endMarker = n
        break
      }
      n = endWalker.nextNode() as Comment | null
    }
    assert.ok(endMarker)
    const row = document.createElement('div')
    row.setAttribute('data-gid', '1')
    row.textContent = 'row'
    root.insertBefore(row, endMarker)
    c[GEA_REGISTER_COND](
      5,
      'cond5',
      () => false,
      () => '<span>t</span>',
      () => '',
    )
    ;(c as any)[geaCondValueSymbol(5)] = true
    c[GEA_PATCH_COND](5)
    assert.ok(root.querySelector('[data-gid="1"]'))
    assert.equal(root.querySelector('.ph'), null)
  })
})

describe('Component – GEA_EXTRACT_COMPONENT_PROPS', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('extracts data-prop-* attributes from element', () => {
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    const el = document.createElement('div')
    el.setAttribute('data-prop-my-value', '42')
    el.setAttribute('data-prop-label', 'hello')
    const props = a[GEA_EXTRACT_COMPONENT_PROPS](el)
    assert.equal(props.myValue, 42)
    assert.equal(props.label, 'hello')
  })

  it('resolves GEA_PROP_BINDING_ATTR_PREFIX map tokens', () => {
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    const token = `${GEA_PROP_BINDING_ATTR_PREFIX}0`
    a[GEA_PROP_BINDINGS].set(token, { x: 1 })
    const el = document.createElement('div')
    el.setAttribute('data-prop-data', token)
    const props = a[GEA_EXTRACT_COMPONENT_PROPS](el)
    assert.deepEqual(props.data, { x: 1 })
  })

  it('handles element without getAttributeNames', () => {
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    const props = a[GEA_EXTRACT_COMPONENT_PROPS]({} as any)
    assert.deepEqual(props, {})
  })
})

describe('Component – GEA_INSTANTIATE_CHILD_COMPONENTS', () => {
  let restoreDom: () => void
  let Component: any
  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('skips elements already mounted', () => {
    class Parent extends Component {
      template() {
        return '<div><child-w data-gcm="true"></child-w></div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    assert.equal(parent[GEA_CHILD_COMPONENTS].length, 0)
  })

  it('skips elements with __geaCompiledChildRoot property', () => {
    class Parent extends Component {
      template() {
        return '<div><child-x></child-x></div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    // Mark the child element before render to simulate compiled child
    const el = parent.el
    const childEl = el?.querySelector('child-x')
    if (childEl) (childEl as any)[GEA_DOM_COMPILED_CHILD_ROOT] = true
    parent.render(container)
    assert.equal(parent[GEA_CHILD_COMPONENTS].length, 0)
  })

  it('does nothing when GEA_ELEMENT is null', () => {
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    a[GEA_ELEMENT] = null
    a[GEA_INSTANTIATE_CHILD_COMPONENTS]() // should not throw
  })

  it('instantiates registered child by tag name', () => {
    class ChildWidget extends Component {
      template() {
        return '<span class="widget">widget</span>'
      }
    }
    ChildWidget.register('child-widget')

    class Parent extends Component {
      template() {
        return '<div><child-widget></child-widget></div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    assert.ok(parent[GEA_CHILD_COMPONENTS].length > 0)
  })

  it('manually exercises instantiation for element in DOM', () => {
    class ChildComp extends Component {
      template() {
        return '<span>child-comp</span>'
      }
    }
    ChildComp.register('child-comp')

    class Parent extends Component {
      template() {
        return '<div><child-comp data-prop-item-id="42" data-prop-label="hello"></child-comp></div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    assert.ok(parent[GEA_CHILD_COMPONENTS].length > 0)
    const child = parent[GEA_CHILD_COMPONENTS][0]
    assert.ok(child.rendered)
  })

  it('skips unregistered tags', () => {
    class Parent extends Component {
      template() {
        return '<div><unknown-tag></unknown-tag></div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    assert.equal(parent[GEA_CHILD_COMPONENTS].length, 0)
  })
})

describe('Component – GEA_MOUNT_COMPILED_CHILD_COMPONENTS', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('mounts compiled child when its id exists in DOM', () => {
    class Child extends Component {
      [GEA_COMPILED_CHILD] = true
      template() {
        return '<div>compiled</div>'
      }
    }
    class Parent extends Component {
      myChild: any
      template() {
        return '<div></div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    const child = new Child()
    engineThis(child)[GEA_PARENT_COMPONENT] = parent
    parent.myChild = child
    const childEl = document.createElement('div')
    childEl.id = child.id
    parent[GEA_ELEMENT].appendChild(childEl)
    parent[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
    assert.equal(child[GEA_RENDERED], true)
    assert.equal(child[GEA_ELEMENT], childEl)
    assert.ok(parent[GEA_CHILD_COMPONENTS].includes(child))
  })

  it('skips child when no matching DOM element exists', () => {
    class Child extends Component {
      [GEA_COMPILED_CHILD] = true
      template() {
        return '<div>compiled</div>'
      }
    }
    class Parent extends Component {
      myChild: any
      template() {
        return '<div></div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    const child = new Child()
    engineThis(child)[GEA_PARENT_COMPONENT] = parent
    parent.myChild = child
    parent[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
    assert.equal(child[GEA_RENDERED], false)
  })

  it('collects from arrays of children', () => {
    class Child extends Component {
      [GEA_COMPILED_CHILD] = true
      template() {
        return '<div>cc</div>'
      }
    }
    class Parent extends Component {
      myChildren: any
      template() {
        return '<div></div>'
      }
    }
    const parent = new Parent()
    const container = document.createElement('div')
    document.body.appendChild(container)
    parent.render(container)
    const c1 = new Child()
    engineThis(c1)[GEA_PARENT_COMPONENT] = parent
    const c2 = new Child()
    engineThis(c2)[GEA_PARENT_COMPONENT] = parent
    parent.myChildren = [c1, c2]
    const el1 = document.createElement('div')
    el1.id = c1.id
    parent[GEA_ELEMENT].appendChild(el1)
    const el2 = document.createElement('div')
    el2.id = c2.id
    parent[GEA_ELEMENT].appendChild(el2)
    parent[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
    assert.equal(c1[GEA_RENDERED], true)
    assert.equal(c2[GEA_RENDERED], true)
  })
})

describe('Component – GEA_SETUP_LOCAL_STATE_OBSERVERS', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('calls [GEA_SETUP_LOCAL_STATE_OBSERVERS] from constructor when defined', () => {
    let called = false
    class A extends Component {
      [GEA_SETUP_LOCAL_STATE_OBSERVERS]() {
        called = true
      }
      template() {
        return '<div></div>'
      }
    }
    new A()
    assert.equal(called, true)
  })
})

describe('Component – __reactiveProps', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('returns the same object (passthrough)', () => {
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    const obj = { x: 1, y: 2 }
    const result = a[GEA_REACTIVE_PROPS](obj)
    assert.equal(result, obj)
    assert.equal(result.x, 1)
  })
})

describe('Component – static register', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('registers with custom tag name', () => {
    class MyWidget extends Component {
      template() {
        return '<div></div>'
      }
    }
    MyWidget.register('custom-widget')
    assert.ok(Component[GEA_COMPONENT_CLASSES].has('MyWidget'))
  })
})

describe('Component – __applyListChanges', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('delegates to applyListChanges', () => {
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    const container = document.createElement('div')
    a[GEA_APPLY_LIST_CHANGES](container, ['a', 'b'], null, {
      arrayPathParts: ['items'],
      create: (item: any) => {
        const el = document.createElement('div')
        el.textContent = item
        return el
      },
    })
    assert.equal(container.children.length, 2)
  })
})

describe('Component – el getter with existing DOM element', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('finds existing element by id', () => {
    class A extends Component {
      template() {
        return '<div>fallback</div>'
      }
    }
    const a = new A()
    const existing = document.createElement('div')
    existing.id = a[GEA_ID]
    existing.textContent = 'found'
    document.body.appendChild(existing)
    assert.equal(a.el, existing)
    assert.equal(a.el.textContent, 'found')
  })
})

describe('Component – __geaPatchCond SVG namespace', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('inserts content into SVG parent using createElementNS', () => {
    class C extends Component {
      template() {
        return `<svg xmlns="http://www.w3.org/2000/svg"><!--${this[GEA_ID]}-cond5--><!--${this[GEA_ID]}-cond5-end--></svg>`
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    c[GEA_REGISTER_COND](
      5,
      'cond5',
      () => true,
      () => '<circle r="5"/>',
      null,
    )
    c[GEA_PATCH_COND](5)
    assert.ok(c[GEA_ELEMENT]!.innerHTML.includes('circle'))
  })
})

describe('Component – __geaCloneItem fallback branch', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('falls back to full render when template fails', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    let firstCall = true
    const renderFn = (item: any) => {
      if (firstCall) {
        firstCall = false
        throw new Error('template fail')
      }
      return `<li>${item.label}</li>`
    }
    const el = c[GEA_CLONE_ITEM](list, { id: 1, label: 'a' }, renderFn)
    assert.ok(el)
    assert.equal((el as any)[GEA_DOM_KEY], '1')
  })
})

describe('Component – __geaSyncItems same-length diff content', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  function mkItem(id: string) {
    const el = document.createElement('div')
    el.setAttribute('data-gid', id)
    el.textContent = id
    ;(el as any)[GEA_DOM_ITEM] = id
    return el
  }

  it('does full rebuild when same length but different items', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('a'))
    list.appendChild(mkItem('b'))
    ;(list as any)[GEA_MAP_CONFIG_PREV] = ['a', 'b']
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 2
    s[GEA_SYNC_ITEMS](list, ['x', 'y'], mkItem)
    const ids = Array.from(list.querySelectorAll('[data-gid]')).map((el) => el.getAttribute('data-gid'))
    assert.deepEqual(ids, ['x', 'y'])
  })

  it('handles append with comment marker', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('a'))
    const comment = document.createComment('end-marker')
    list.appendChild(comment)
    ;(list as any)[GEA_MAP_CONFIG_PREV] = ['a']
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 1
    s[GEA_SYNC_ITEMS](list, ['a', 'b'], mkItem)
    assert.equal((list as any)[GEA_MAP_CONFIG_COUNT], 2)
  })
})

describe('Component – GEA_TEARDOWN_SELF_LISTENERS', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('calls and clears all self listeners', () => {
    let called = 0
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    a[GEA_SELF_LISTENERS].push(() => {
      called++
    })
    a[GEA_SELF_LISTENERS].push(() => {
      called++
    })
    a[GEA_TEARDOWN_SELF_LISTENERS]()
    assert.equal(called, 2)
    assert.equal(a[GEA_SELF_LISTENERS].length, 0)
  })
})

describe('Component – GEA_EXTRACT_COMPONENT_PROPS with missing binding', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('returns undefined for missing binding', () => {
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    a[GEA_PROP_BINDINGS] = new Map()
    const el = document.createElement('div')
    el.setAttribute('data-prop-data', `${GEA_PROP_BINDING_ATTR_PREFIX}missing`)
    const props = a[GEA_EXTRACT_COMPONENT_PROPS](el)
    assert.equal(props.data, undefined)
  })
})

describe('Component – render reposition when already parented', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('skips reposition when element is already at correct index', () => {
    class A extends Component {
      template() {
        return '<div class="a">A</div>'
      }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const a = new A()
    container.appendChild(a.el)
    a.render(container, 0)
    assert.equal(container.children[0].className, 'a')
    assert.equal(a.rendered, true)
  })

  it('repositions to last when index exceeds children count', () => {
    class B extends Component {
      template() {
        return '<div class="b">B</div>'
      }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.appendChild(document.createElement('span'))
    const b = new B()
    container.appendChild(b.el)
    b.render(container, 999)
    assert.equal(b.rendered, true)
  })
})

describe('Component – dispose cleans up observer removers', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('calls all observer removers on dispose', () => {
    let removed = false
    class A extends Component {
      template() {
        return '<div></div>'
      }
    }
    const a = new A()
    a[GEA_OBSERVER_REMOVERS].push(() => {
      removed = true
    })
    a.dispose()
    assert.equal(removed, true)
    assert.equal(a[GEA_OBSERVER_REMOVERS].length, 0)
  })
})

describe('Component – __geaRegisterMap and __geaSyncMap with changes', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('syncs map updates when items change', () => {
    let data = ['a', 'b', 'c']
    class M extends Component {
      template() {
        return '<div><ul id="map-' + this[GEA_ID] + '"></ul></div>'
      }
    }
    const m = new M()
    const container = document.createElement('div')
    document.body.appendChild(container)
    m.render(container)
    const list = document.getElementById('map-' + m[GEA_ID])!
    const createFn = (item: any) => {
      const li = document.createElement('li')
      li.textContent = item
      li.setAttribute('data-gid', item)
      return li
    }
    m[GEA_REGISTER_MAP](
      0,
      'mapC',
      () => list,
      () => data,
      createFn,
    )
    m[GEA_SYNC_MAP](0)
    assert.equal(list.children.length, 3)
    data = ['a', 'b', 'c', 'd']
    m[GEA_SYNC_MAP](0)
    assert.equal(list.children.length, 4)
  })
})

describe('Component – __geaCloneItem with setAttribute patch type', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('sets attribute when val is truthy string', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    const renderFn = () => `<li><span>text</span></li>`
    const patches = [[[0], 'data-custom', 'active']]
    const el = c[GEA_CLONE_ITEM](list, { id: 1 }, renderFn, undefined, undefined, patches)
    assert.equal(el.children[0].getAttribute('data-custom'), 'active')
  })

  it('handles false val by removing attribute', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    const renderFn = () => `<li><span data-x="old">text</span></li>`
    const patches = [[[0], 'data-x', false]]
    const el = c[GEA_CLONE_ITEM](list, { id: 1 }, renderFn, undefined, undefined, patches)
    assert.equal(el.children[0].hasAttribute('data-x'), false)
  })
})

describe('Component – __geaPatchCond with no root element', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('returns false when element is not found', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    c[GEA_REGISTER_COND](
      10,
      'cond10',
      () => true,
      () => '<span>x</span>',
      null,
    )
    const result = c[GEA_PATCH_COND](10)
    assert.equal(result, false)
  })
})

describe('Component – __geaCloneItem with non-object item', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('uses string value as item id for primitives', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    const renderFn = (item: any) => `<li>${item}</li>`
    const el = c[GEA_CLONE_ITEM](list, 'hello', renderFn)
    assert.equal((el as any)[GEA_DOM_KEY], 'hello')
  })

  it('handles null item id gracefully', () => {
    class C extends Component {
      template() {
        return '<div></div>'
      }
    }
    const c = new C()
    const container = document.createElement('div')
    document.body.appendChild(container)
    c.render(container)
    const list = document.createElement('ul')
    const renderFn = (item: any) => `<li>${item?.label}</li>`
    const el = c[GEA_CLONE_ITEM](list, { id: null, label: 'test' }, renderFn)
    assert.ok((el as any)[GEA_DOM_KEY] != null)
  })
})

describe('Component – __geaSyncItems with removal partial match', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  function mkItem(id: string) {
    const el = document.createElement('div')
    el.setAttribute('data-gid', id)
    el.textContent = id
    ;(el as any)[GEA_DOM_ITEM] = id
    return el
  }

  it('rebuilds on reorder (not pure append or remove)', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('a'))
    list.appendChild(mkItem('b'))
    list.appendChild(mkItem('c'))
    ;(list as any)[GEA_MAP_CONFIG_PREV] = ['a', 'b', 'c']
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 3
    s[GEA_SYNC_ITEMS](list, ['c', 'a', 'b'], mkItem)
    assert.equal((list as any)[GEA_MAP_CONFIG_COUNT], 3)
  })

  it('handles complete element removal', () => {
    class S extends Component {
      template() {
        return '<div></div>'
      }
    }
    const s = new S()
    const container = document.createElement('div')
    document.body.appendChild(container)
    s.render(container)
    const list = document.createElement('div')
    s[GEA_ELEMENT]!.appendChild(list)
    list.appendChild(mkItem('a'))
    list.appendChild(mkItem('b'))
    ;(list as any)[GEA_MAP_CONFIG_PREV] = ['a', 'b']
    ;(list as any)[GEA_MAP_CONFIG_COUNT] = 2
    s[GEA_SYNC_ITEMS](list, [], mkItem)
    assert.equal((list as any)[GEA_MAP_CONFIG_COUNT], 0)
  })
})

describe('Component – local state observer survives createdHooks clear', () => {
  let restoreDom: () => void
  let Component: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
  })

  afterEach(() => {
    restoreDom()
  })

  it('GEA_SETUP_LOCAL_STATE_OBSERVERS runs after createdHooks so observers are not cleared', async () => {
    let observerFired = false
    let syncMapCalled = false

    class TagLike extends Component {
      declare value: string[]

      created() {
        this.value = ['a', 'b']
      }

      createdHooks() {
        if (!this[GEA_OBSERVER_REMOVERS]) this[GEA_OBSERVER_REMOVERS] = []
        this[GEA_OBSERVER_REMOVERS].forEach((fn: any) => fn())
        this[GEA_OBSERVER_REMOVERS] = []
        this[GEA_REGISTER_MAP](
          0,
          '____unresolved_0_container',
          () => document.getElementById(this.id + '-list'),
          () => this.value || [],
          (item: any) => {
            const el = document.createElement('span')
            el.setAttribute('data-gid', String(item))
            el.textContent = item
            return el
          },
        )
      }

      __observe_local_value() {
        observerFired = true
        syncMapCalled = true
        this[GEA_SYNC_MAP](0)
      }

      [GEA_SETUP_LOCAL_STATE_OBSERVERS]() {
        if (!this[GEA_STORE_ROOT]) return
        this[GEA_OBSERVER_REMOVERS].push(
          this[GEA_STORE_ROOT].observe(['value'], (__v: any, __c: any) => this.__observe_local_value()),
        )
      }

      template() {
        return `<div id="${this.id}"><div id="${this.id}-list">${(this.value || []).map((v: string) => `<span data-gid="${v}">${v}</span>`).join('')}<!----></div></div>`
      }
    }

    const comp = new TagLike()
    const container = document.createElement('div')
    document.body.appendChild(container)
    comp.render(container)

    const list = document.getElementById(comp.id + '-list')!
    assert.equal(list.querySelectorAll('span').length, 2, 'initial render has 2 items')

    comp.value = ['a', 'b', 'c']
    await flush()
    assert.equal(observerFired, true, 'local state observer should fire')
    assert.equal(syncMapCalled, true, '__geaSyncMap should be called')
    assert.equal(list.querySelectorAll('span').length, 3, 'DOM should have 3 items after append')

    comp.value = ['b', 'c']
    await flush()
    assert.equal(list.querySelectorAll('span').length, 2, 'DOM should have 2 items after removal')
  })
})
