/**
 * Two-way binding tests: verifies that object/array props passed from parent
 * to child retain the parent's proxy reference, enabling JS-native two-way
 * binding. Primitives remain one-way (pass-by-value).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'
import { GEA_DOM_COMPONENT } from '@geajs/core'

import { geaPlugin } from '../src/index'
import { buildEvalPrelude, mergeEvalBindings, compileStore, loadRuntimeModules as loadRuntime } from './helpers/compile'
import { resetDelegation } from '../../gea/src/dom/events'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0)
  const cancelAnimationFrame = (id: number) => clearTimeout(id)

  dom.window.requestAnimationFrame = requestAnimationFrame
  dom.window.cancelAnimationFrame = cancelAnimationFrame

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Element: (globalThis as any).Element,
    DocumentFragment: (globalThis as any).DocumentFragment,
    Text: (globalThis as any).Text,
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
    Element: dom.window.Element,
    DocumentFragment: dom.window.DocumentFragment,
    Text: dom.window.Text,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame,
    cancelAnimationFrame,
  })

  return () => {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Get child component instance from a DOM element via [GEA_DOM_COMPONENT] */
function getChild(root: Element, selector?: string): any {
  if (selector) {
    const el = root.querySelector(selector)
    return el && (el as any)[GEA_DOM_COMPONENT]
  }
  // Find first element with [GEA_DOM_COMPONENT]
  const all = root.querySelectorAll('*')
  for (const el of all) {
    if ((el as any)[GEA_DOM_COMPONENT]) return (el as any)[GEA_DOM_COMPONENT]
  }
  return undefined
}

async function compileJsxComponent(source: string, id: string, className: string, bindings: Record<string, unknown>) {
  const allBindings = mergeEvalBindings(bindings)
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  assert.ok(result)

  let code = typeof result === 'string' ? result : result.code
  // Convert @geajs/core/runtime imports to __geaRuntime destructuring
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']@geajs\/core\/runtime["']\s*;?/g,
    (_m: string, names: string) => `const { ${names} } = __geaRuntime;`,
  )
  const compiledSource = `${buildEvalPrelude()}${code
    .replace(/^import .*;$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export default class\s+/, 'class ')
    .replace(/export class\s+/, 'class ')}
return ${className};`

  return new Function(...Object.keys(allBindings), compiledSource)(...Object.values(allBindings))
}

/**
 * Create a compiled store from an initial state object.
 * Replaces v1's `new Store({ field: value })` pattern.
 */
async function createCompiledStore(initialState: Record<string, unknown>, Store: any): Promise<any> {
  const fields = Object.entries(initialState)
    .map(([k, v]) => `  ${k} = ${JSON.stringify(v)}`)
    .join('\n')
  const source = `import { Store } from '@geajs/core'\nexport class S extends Store {\n${fields}\n}`
  const S = await compileStore(source, '/virtual/store.ts', 'S', { Store })
  return new S()
}

async function loadRuntimeModules(seed: string) {
  const [compMod, storeMod] = await loadRuntime(seed)
  return [{ default: compMod.default }, { Store: storeMod.Store }] as const
}

// ---------------------------------------------------------------------------
// Primitive props: one-way (parent → child)
// ---------------------------------------------------------------------------

test('primitive number prop: parent change updates child', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-num`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ count: 5 }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ count }) {
          return <div class="val">{count}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child count={store.count} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const valEl = root.querySelector('.val')
    assert.ok(valEl, '.val element must exist')
    assert.equal(valEl?.textContent?.trim(), '5')

    store.count = 10
    await flushMicrotasks()
    assert.equal(root.querySelector('.val')?.textContent?.trim(), '10')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('primitive string prop: parent change updates child', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-str`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ name: 'Alice' }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ name }) {
          return <div class="val">{name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child name={store.name} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.val')?.textContent?.trim(), 'Alice')

    store.name = 'Bob'
    await flushMicrotasks()
    assert.equal(root.querySelector('.val')?.textContent?.trim(), 'Bob')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('primitive boolean prop: parent change updates child', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-bool`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ active: true }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ active }) {
          return <div class="val">{active ? 'yes' : 'no'}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child active={store.active} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.val')?.textContent?.trim(), 'yes')

    store.active = false
    await flushMicrotasks()
    assert.equal(root.querySelector('.val')?.textContent?.trim(), 'no')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Object props: two-way binding
// ---------------------------------------------------------------------------

test('object prop: child mutation updates parent store', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-obj-up`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { name: 'Alice' } }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="child-name">{user.name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <div class="parent-name">{store.user.name}</div>
              <Child user={store.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Alice')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Alice')

    const child = getChild(root)
    child.props.user.name = 'Bob'
    await flushMicrotasks()

    assert.equal(store.user.name, 'Bob', 'store should reflect child mutation')
    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Bob')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Bob')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('object prop: parent mutation updates child', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-obj-down`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { name: 'Alice' } }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="child-name">{user.name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child user={store.user} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Alice')

    store.user.name = 'Charlie'
    await flushMicrotasks()
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Charlie')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('nested object prop: child deep mutation updates parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-nested`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { address: { city: 'London' } } }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="city">{user.address.city}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <div class="parent-city">{store.user.address.city}</div>
              <Child user={store.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-city')?.textContent?.trim(), 'London')
    assert.equal(root.querySelector('.city')?.textContent?.trim(), 'London')

    const child = getChild(root)
    child.props.user.address.city = 'NYC'
    await flushMicrotasks()

    assert.equal(store.user.address.city, 'NYC', 'store should reflect deep mutation')
    assert.equal(root.querySelector('.parent-city')?.textContent?.trim(), 'NYC')
    assert.equal(root.querySelector('.city')?.textContent?.trim(), 'NYC')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Array props: two-way binding
// ---------------------------------------------------------------------------

test('array prop: child push updates parent store', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-arr-push`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ items: [{ id: 1 }, { id: 2 }] }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ items }) {
          return <div class="count">{items.length}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <div class="parent-count">{store.items.length}</div>
              <Child items={store.items} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '2')
    assert.equal(root.querySelector('.count')?.textContent?.trim(), '2')

    const child = getChild(root)
    child.props.items.push({ id: 3 })
    await flushMicrotasks()

    assert.equal(store.items.length, 3, 'store array should grow')
    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '3')
    assert.equal(root.querySelector('.count')?.textContent?.trim(), '3')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('array prop: child splice updates parent store', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-arr-splice`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ items }) {
          return <div class="count">{items.length}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <div class="parent-count">{store.items.length}</div>
              <Child items={store.items} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '3')

    const child = getChild(root)
    child.props.items.splice(0, 1)
    await flushMicrotasks()

    assert.equal(store.items.length, 2, 'store array should shrink')
    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '2')
    assert.equal(root.querySelector('.count')?.textContent?.trim(), '2')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('array prop: parent push updates child', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-arr-down`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ items: [{ id: 1 }] }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ items }) {
          return <div class="count">{items.length}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child items={store.items} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.count')?.textContent?.trim(), '1')

    store.items.push({ id: 2 })
    await flushMicrotasks()
    assert.equal(root.querySelector('.count')?.textContent?.trim(), '2')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Mixed props: primitive + object in the same component
// ---------------------------------------------------------------------------

test('mixed props: primitive is one-way, object is two-way', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-mixed`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ count: 1, user: { name: 'Alice' } }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ count, user }) {
          return (
            <div class="child">
              <span class="c-count">{count}</span>
              <span class="c-name">{user.name}</span>
            </div>
          )
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <span class="p-name">{store.user.name}</span>
              <Child count={store.count} user={store.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.c-count')?.textContent?.trim(), '1')
    assert.equal(root.querySelector('.c-name')?.textContent?.trim(), 'Alice')

    const child = getChild(root)
    child.props.user.name = 'Bob'
    await flushMicrotasks()

    assert.equal(store.user.name, 'Bob', 'object prop mutation flows to parent')
    assert.equal(root.querySelector('.p-name')?.textContent?.trim(), 'Bob')
    assert.equal(root.querySelector('.c-name')?.textContent?.trim(), 'Bob')

    store.count = 99
    await flushMicrotasks()
    assert.equal(root.querySelector('.c-count')?.textContent?.trim(), '99', 'primitive prop flows parent → child')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Callback props
// ---------------------------------------------------------------------------

test('callback props are callable from child', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-cb`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ value: 0 }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ value, onValueChange }) {
          return <div class="val">{value}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <Child value={store.value} onValueChange={(v) => store.value = v} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.val')?.textContent?.trim(), '0')

    const child = getChild(root)
    child.props.onValueChange(42)
    await flushMicrotasks()

    assert.equal(store.value, 42, 'callback updated store')
    assert.equal(root.querySelector('.val')?.textContent?.trim(), '42')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Multiple children sharing the same object prop
// ---------------------------------------------------------------------------

test('two children sharing same object prop: one mutates, both update', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-multi`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { name: 'Alice' } }, Store)

    const ChildA = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class ChildA extends Component {
        template({ user }) {
          return <div class="a-name">{user.name}</div>
        }
      }
    `,
      '/virtual/ChildA.jsx',
      'ChildA',
      { Component },
    )

    const ChildB = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class ChildB extends Component {
        template({ user }) {
          return <div class="b-name">{user.name}</div>
        }
      }
    `,
      '/virtual/ChildB.jsx',
      'ChildB',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import ChildA from './ChildA'
      import ChildB from './ChildB'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <ChildA user={store.user} />
              <ChildB user={store.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, ChildA, ChildB },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.a-name')?.textContent?.trim(), 'Alice')
    assert.equal(root.querySelector('.b-name')?.textContent?.trim(), 'Alice')

    const childA = getChild(root, '.a-name')
    childA.props.user.name = 'Eve'
    await flushMicrotasks()

    assert.equal(store.user.name, 'Eve')
    assert.equal(root.querySelector('.a-name')?.textContent?.trim(), 'Eve')
    assert.equal(root.querySelector('.b-name')?.textContent?.trim(), 'Eve')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Null / undefined edge cases
// ---------------------------------------------------------------------------

test('object prop starts null, parent sets it later', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-null`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ config: null as null | { theme: string } }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ config }) {
          return <div class="theme">{config ? config.theme : 'none'}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child config={store.config} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.theme')?.textContent?.trim(), 'none')

    store.config = { theme: 'dark' }
    await flushMicrotasks()
    assert.equal(root.querySelector('.theme')?.textContent?.trim(), 'dark')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('object prop replaced with null', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-to-null`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ config: { theme: 'light' } as null | { theme: string } }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ config }) {
          return <div class="theme">{config ? config.theme : 'none'}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child config={store.config} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.theme')?.textContent?.trim(), 'light')

    store.config = null
    await flushMicrotasks()
    assert.equal(root.querySelector('.theme')?.textContent?.trim(), 'none')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Child-side reassignment: real JS value semantics
// ---------------------------------------------------------------------------

test('child reassigns primitive prop: parent store is unaffected, child DOM updates', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-prim-reassign`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ count: 5 }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ count }) {
          return <div class="val">{count}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child count={store.count} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.val')?.textContent?.trim(), '5')

    const child = getChild(root)
    child.props.count = 99
    await flushMicrotasks()

    assert.equal(child.props.count, 99, 'child sees its own local change')
    assert.equal(store.count, 5, 'parent store is unaffected by child reassignment')
    assert.equal(root.querySelector('.val')?.textContent?.trim(), '99', 'child DOM reflects the reassignment')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('child reassigns string prop: parent store is unaffected', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-str-reassign`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ name: 'Alice' }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ name }) {
          return <div class="val">{name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child name={store.name} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)
    child.props.name = 'Zed'
    await flushMicrotasks()

    assert.equal(child.props.name, 'Zed', 'child sees its own reassignment')
    assert.equal(store.name, 'Alice', 'parent store string is unaffected')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('child reassigns boolean prop: parent store is unaffected', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-bool-reassign`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ active: true }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ active }) {
          return <div class="val">{active ? 'yes' : 'no'}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child active={store.active} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)
    child.props.active = false
    await flushMicrotasks()

    assert.equal(child.props.active, false, 'child sees its own reassignment')
    assert.equal(store.active, true, 'parent store boolean is unaffected')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('child reassigns object prop: parent store keeps original reference', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-obj-reassign`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { name: 'Alice' } }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="child-name">{user.name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <div class="parent-name">{store.user.name}</div>
              <Child user={store.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Alice')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Alice')

    const child = getChild(root)
    child.props.user = { name: 'Imposter' }
    await flushMicrotasks()

    assert.equal(child.props.user.name, 'Imposter', 'child sees its own replacement object')
    assert.equal(store.user.name, 'Alice', 'parent store still has original object')
    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Alice', 'parent DOM unchanged')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('child reassigns array prop: parent store keeps original array', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-arr-reassign`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ items: [{ id: 1 }, { id: 2 }] }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ items }) {
          return <div class="count">{items.length}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child items={store.items} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)
    assert.equal(store.items.length, 2)

    child.props.items = [{ id: 99 }]
    await flushMicrotasks()

    assert.equal(child.props.items.length, 1, 'child sees its own replacement array')
    assert.equal(child.props.items[0].id, 99)
    assert.equal(store.items.length, 2, 'parent store array is unaffected')
    assert.equal(store.items[0].id, 1, 'parent store items unchanged')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('child reassigns object prop then parent pushes update: parent wins', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-reassign-then-update`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { name: 'Alice' } }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="child-name">{user.name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child user={store.user} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)
    child.props.user = { name: 'Imposter' }
    await flushMicrotasks()

    assert.equal(child.props.user.name, 'Imposter', 'child has its local replacement')
    assert.equal(store.user.name, 'Alice', 'parent store unaffected')

    store.user.name = 'Bob'
    await flushMicrotasks()

    assert.equal(child.props.user.name, 'Bob', 'parent update overwrites child local replacement')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Bob', 'child DOM shows parent value')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Deep nesting: 3-level and 4-level chains
// ---------------------------------------------------------------------------

test('3-level deep: grandchild mutation updates grandparent store and DOM', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-3lvl`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { name: 'Alice' } }, Store)

    const GrandChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class GrandChild extends Component {
        template({ user }) {
          return <div class="gc-name">{user.name}</div>
        }
      }
    `,
      '/virtual/GrandChild.jsx',
      'GrandChild',
      { Component },
    )

    const Middle = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import GrandChild from './GrandChild'
      export default class Middle extends Component {
        template({ user }) {
          return (
            <div class="middle">
              <div class="m-name">{user.name}</div>
              <GrandChild user={user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Middle.jsx',
      'Middle',
      { Component, GrandChild },
    )

    const Root = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Middle from './Middle'
      export default class Root extends Component {
        template() {
          return (
            <div class="root">
              <div class="r-name">{store.user.name}</div>
              <Middle user={store.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Root.jsx',
      'Root',
      { Component, store, Middle },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Root()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.r-name')?.textContent?.trim(), 'Alice')
    assert.equal(root.querySelector('.m-name')?.textContent?.trim(), 'Alice')
    assert.equal(root.querySelector('.gc-name')?.textContent?.trim(), 'Alice')

    const middle = view._middle
    const grandchild = getChild(root)
    grandchild.props.user.name = 'Zara'
    await flushMicrotasks()

    assert.equal(store.user.name, 'Zara', 'grandparent store updated')
    assert.equal(root.querySelector('.r-name')?.textContent?.trim(), 'Zara')
    assert.equal(root.querySelector('.m-name')?.textContent?.trim(), 'Zara')
    assert.equal(root.querySelector('.gc-name')?.textContent?.trim(), 'Zara')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('3-level deep: grandparent mutation cascades to grandchild DOM', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-3lvl-down`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { name: 'Alice' } }, Store)

    const GrandChild = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class GrandChild extends Component {
        template({ user }) {
          return <div class="gc-name">{user.name}</div>
        }
      }
    `,
      '/virtual/GrandChild.jsx',
      'GrandChild',
      { Component },
    )

    const Middle = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import GrandChild from './GrandChild'
      export default class Middle extends Component {
        template({ user }) {
          return <div class="middle"><GrandChild user={user} /></div>
        }
      }
    `,
      '/virtual/Middle.jsx',
      'Middle',
      { Component, GrandChild },
    )

    const Root = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Middle from './Middle'
      export default class Root extends Component {
        template() {
          return <div class="root"><Middle user={store.user} /></div>
        }
      }
    `,
      '/virtual/Root.jsx',
      'Root',
      { Component, store, Middle },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Root()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.gc-name')?.textContent?.trim(), 'Alice')

    store.user.name = 'Maya'
    await flushMicrotasks()
    assert.equal(root.querySelector('.gc-name')?.textContent?.trim(), 'Maya')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('4-level deep: great-grandchild array push updates top-level store', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-4lvl`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ items: [{ id: 1 }] }, Store)

    const Level3 = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Level3 extends Component {
        template({ items }) {
          return <div class="l3-count">{items.length}</div>
        }
      }
    `,
      '/virtual/Level3.jsx',
      'Level3',
      { Component },
    )

    const Level2 = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Level3 from './Level3'
      export default class Level2 extends Component {
        template({ items }) {
          return <div class="l2"><Level3 items={items} /></div>
        }
      }
    `,
      '/virtual/Level2.jsx',
      'Level2',
      { Component, Level3 },
    )

    const Level1 = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Level2 from './Level2'
      export default class Level1 extends Component {
        template({ items }) {
          return <div class="l1"><Level2 items={items} /></div>
        }
      }
    `,
      '/virtual/Level1.jsx',
      'Level1',
      { Component, Level2 },
    )

    const Root = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Level1 from './Level1'
      export default class Root extends Component {
        template() {
          return (
            <div class="root">
              <div class="r-count">{store.items.length}</div>
              <Level1 items={store.items} />
            </div>
          )
        }
      }
    `,
      '/virtual/Root.jsx',
      'Root',
      { Component, store, Level1 },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Root()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.r-count')?.textContent?.trim(), '1')
    assert.equal(root.querySelector('.l3-count')?.textContent?.trim(), '1')

    const level3 = getChild(root, '.l3-count')
    assert.ok(level3, 'level3 instance found via GEA_DOM_COMPONENT')
    level3.props.items.push({ id: 2 })
    await flushMicrotasks()

    assert.equal(store.items.length, 2, 'top-level store array grew')
    assert.equal(root.querySelector('.r-count')?.textContent?.trim(), '2')
    assert.equal(root.querySelector('.l3-count')?.textContent?.trim(), '2')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Component local state (not external stores)
// ---------------------------------------------------------------------------

test('local state: parent passes own primitive to child, parent update flows down', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-local-prim`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ count }) {
          return <div class="child-count">{count}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        count = 0
        template() {
          return (
            <div class="parent">
              <div class="parent-count">{this.count}</div>
              <Child count={this.count} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '0')
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '0')

    view.count = 7
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '7')
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '7')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('local state: parent passes own object to child, child mutation updates parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-local-obj`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="child-name">{user.name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        user = { name: 'Alice' }
        template() {
          return (
            <div class="parent">
              <div class="parent-name">{this.user.name}</div>
              <Child user={this.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Alice')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Alice')

    const child = getChild(root)
    child.props.user.name = 'Bob'
    await flushMicrotasks()

    assert.equal(view.user.name, 'Bob', 'parent state reflects child mutation')
    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Bob')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Bob')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('local state: parent passes own array to child, child push updates parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-local-arr`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ items }) {
          return <div class="child-count">{items.length}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        items = [{ id: 1 }]
        template() {
          return (
            <div class="parent">
              <div class="parent-count">{this.items.length}</div>
              <Child items={this.items} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '1')
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '1')

    const child = getChild(root)
    child.props.items.push({ id: 2 })
    await flushMicrotasks()

    assert.equal(view.items.length, 2, 'parent array grew via child push')
    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '2')
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '2')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('local state: child reassigns primitive, child DOM updates, parent unaffected', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-local-reassign`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ count }) {
          return <div class="child-count">{count}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        count = 5
        template() {
          return (
            <div class="parent">
              <div class="parent-count">{this.count}</div>
              <Child count={this.count} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '5')
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '5')

    const child = getChild(root)
    child.props.count = 42
    await flushMicrotasks()

    assert.equal(child.props.count, 42, 'child sees its reassigned value')
    assert.equal(view.count, 5, 'parent state unaffected')
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '42', 'child DOM updates')
    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '5', 'parent DOM unchanged')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('local state: child reassigns object, parent unaffected, parent update overwrites', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-local-obj-reassign`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="child-name">{user.name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        user = { name: 'Alice' }
        template() {
          return (
            <div class="parent">
              <div class="parent-name">{this.user.name}</div>
              <Child user={this.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)
    child.props.user = { name: 'Imposter' }
    await flushMicrotasks()

    assert.equal(child.props.user.name, 'Imposter', 'child sees replacement')
    assert.equal(view.user.name, 'Alice', 'parent state unaffected')

    view.user.name = 'Charlie'
    await flushMicrotasks()

    assert.equal(child.props.user.name, 'Charlie', 'parent update overwrites child local reassignment')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Charlie')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Continued reactivity after reassignment
// ---------------------------------------------------------------------------

test('child reassigns primitive multiple times: DOM updates each time', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-multi-reassign`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ count: 1 }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ count }) {
          return <div class="val">{count}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return <div class="parent"><Child count={store.count} /></div>
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)
    assert.equal(root.querySelector('.val')?.textContent?.trim(), '1')

    child.props.count = 10
    await flushMicrotasks()
    assert.equal(root.querySelector('.val')?.textContent?.trim(), '10')

    child.props.count = 20
    await flushMicrotasks()
    assert.equal(root.querySelector('.val')?.textContent?.trim(), '20')

    child.props.count = 30
    await flushMicrotasks()
    assert.equal(root.querySelector('.val')?.textContent?.trim(), '30')

    assert.equal(store.count, 1, 'parent store never changed')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('child reassigns primitive, parent updates later: both DOMs correct', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-reassign-then-parent`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ count: 1 }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ count }) {
          return <div class="child-val">{count}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <div class="parent-val">{store.count}</div>
              <Child count={store.count} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-val')?.textContent?.trim(), '1')
    assert.equal(root.querySelector('.child-val')?.textContent?.trim(), '1')

    const child = getChild(root)
    child.props.count = 99
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-val')?.textContent?.trim(), '1', 'parent DOM unchanged')
    assert.equal(root.querySelector('.child-val')?.textContent?.trim(), '99', 'child DOM shows local value')

    store.count = 50
    await flushMicrotasks()

    assert.equal(root.querySelector('.parent-val')?.textContent?.trim(), '50', 'parent DOM updates')
    assert.equal(root.querySelector('.child-val')?.textContent?.trim(), '50', 'child DOM overwritten by parent update')

    child.props.count = 77
    await flushMicrotasks()
    assert.equal(
      root.querySelector('.child-val')?.textContent?.trim(),
      '77',
      'child can still reassign after parent update',
    )
    assert.equal(root.querySelector('.parent-val')?.textContent?.trim(), '50', 'parent DOM still at 50')

    store.count = 100
    await flushMicrotasks()
    assert.equal(root.querySelector('.parent-val')?.textContent?.trim(), '100', 'parent keeps updating')
    assert.equal(root.querySelector('.child-val')?.textContent?.trim(), '100', 'child overwritten again')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('parent DOM keeps updating independently after child reassigns', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-parent-independent`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = await createCompiledStore({ user: { name: 'Alice' }, count: 0 }, Store)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="child-name">{user.name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import store from './store'
      import Child from './Child'
      export default class Parent extends Component {
        template() {
          return (
            <div class="parent">
              <div class="parent-name">{store.user.name}</div>
              <div class="parent-count">{store.count}</div>
              <Child user={store.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, store, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)
    child.props.user = { name: 'Detached' }
    await flushMicrotasks()

    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Detached')

    store.count = 5
    await flushMicrotasks()
    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '5', 'parent count updates normally')

    store.user.name = 'Bob'
    await flushMicrotasks()
    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Bob', 'parent name updates normally')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Bob', 'child reconnects via parent prop refresh')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('local state: child reassigns primitive, continues to get updates from parent', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-local-continued`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ count }) {
          return <div class="child-count">{count}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        count = 0
        template() {
          return (
            <div class="parent">
              <div class="parent-count">{this.count}</div>
              <Child count={this.count} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)

    child.props.count = 42
    await flushMicrotasks()
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '42', 'child DOM updates on reassign')
    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '0', 'parent DOM unchanged')

    view.count = 10
    await flushMicrotasks()
    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '10', 'parent DOM updates')
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '10', 'child overwritten by parent')

    child.props.count = 88
    await flushMicrotasks()
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '88', 'child reassigns again after parent update')

    view.count = 20
    await flushMicrotasks()
    assert.equal(root.querySelector('.parent-count')?.textContent?.trim(), '20')
    assert.equal(root.querySelector('.child-count')?.textContent?.trim(), '20', 'parent overwrites again')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('local state: parent object mutations update both DOMs after child reassigns and parent reclaims', async () => {
  const restoreDom = installDom()
  try {
    const seed = `twoway-${Date.now()}-local-obj-reclaim`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Child = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Child extends Component {
        template({ user }) {
          return <div class="child-name">{user.name}</div>
        }
      }
    `,
      '/virtual/Child.jsx',
      'Child',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Child from './Child'
      export default class Parent extends Component {
        user = { name: 'Alice' }
        template() {
          return (
            <div class="parent">
              <div class="parent-name">{this.user.name}</div>
              <Child user={this.user} />
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Child },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const child = getChild(root)

    child.props.user = { name: 'Detached' }
    await flushMicrotasks()
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Detached')
    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Alice', 'parent DOM unchanged')

    view.user.name = 'Bob'
    await flushMicrotasks()
    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Bob', 'parent DOM updates')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Bob', 'child reconnects via prop refresh')

    child.props.user.name = 'Eve'
    await flushMicrotasks()
    assert.equal(view.user.name, 'Eve', 'child mutation flows back to parent after reconnect')
    assert.equal(root.querySelector('.parent-name')?.textContent?.trim(), 'Eve')
    assert.equal(root.querySelector('.child-name')?.textContent?.trim(), 'Eve')

    view.dispose()
  } finally {
    restoreDom()
  }
})
