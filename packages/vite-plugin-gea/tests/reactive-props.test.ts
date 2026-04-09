/**
 * Tests for reactive props: parent passes props to child components and
 * the child updates when the parent changes the value.
 */

import assert from 'node:assert/strict'
import { GEA_REQUEST_RENDER } from '@geajs/core'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import { geaPlugin } from '../src/index'
import { buildEvalPrelude, mergeEvalBindings } from './helpers/compile'

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

async function compileJsxComponent(source: string, id: string, className: string, bindings: Record<string, unknown>) {
  const allBindings = mergeEvalBindings(bindings)
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  assert.ok(result)

  const code = typeof result === 'string' ? result : result.code
  const compiledSource = `${buildEvalPrelude()}${code
    .replace(/^import .*;$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export default class\s+/, 'class ')}
return ${className};`

  return new Function(...Object.keys(allBindings), compiledSource)(...Object.values(allBindings))
}

async function loadRuntimeModules(seed: string) {
  const { default: ComponentManager } = await import('../../gea/src/lib/base/component-manager')
  ComponentManager.instance = undefined
  const [compMod, storeMod] = await Promise.all([
    import(`../../gea/src/lib/base/component.tsx?${seed}`),
    import(`../../gea/src/lib/store.ts?${seed}`),
  ])
  return [compMod, storeMod] as const
}

test('compiled child: parent passes props and child updates when parent state changes', async () => {
  const restoreDom = installDom()

  try {
    const seed = `reactive-${Date.now()}-compiled`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ message: 'hello' })

    const MessageChild = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class MessageChild extends Component {
          template({ message }) {
            return <div class="message">{message}</div>
          }
        }
      `,
      '/virtual/MessageChild.jsx',
      'MessageChild',
      { Component },
    )

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'
        import MessageChild from './MessageChild.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent">
                <MessageChild message={store.message} />
              </div>
            )
          }
        }
      `,
      '/virtual/ParentView.jsx',
      'ParentView',
      { Component, store, MessageChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)

    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.message')?.textContent, 'hello')

    store.message = 'world'
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.message')?.textContent, 'world')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('compiled child: multiple reactive props from parent state', async () => {
  const restoreDom = installDom()

  try {
    const seed = `reactive-${Date.now()}-multi`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ a: 1, b: 2 })

    const MultiChild = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class MultiChild extends Component {
          template(props) {
            return <div class="sum">{props.a + props.b}</div>
          }
        }
      `,
      '/virtual/MultiChild.jsx',
      'MultiChild',
      { Component },
    )

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'
        import MultiChild from './MultiChild.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent">
                <MultiChild a={store.a} b={store.b} />
              </div>
            )
          }
        }
      `,
      '/virtual/ParentView.jsx',
      'ParentView',
      { Component, store, MultiChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)

    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.sum')?.textContent, '3')

    store.a = 10
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.sum')?.textContent, '12')

    store.b = 5
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.sum')?.textContent, '15')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional compiled child is not instantiated until branch becomes truthy', async () => {
  const restoreDom = installDom()

  try {
    const seed = `reactive-${Date.now()}-lazy-child`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ step: 1, payload: null as null | { label: string } })

    const LazyChild = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class LazyChild extends Component {
          template({ payload }) {
            return <div class="lazy-child">{payload.label}</div>
          }
        }
      `,
      '/virtual/LazyChild.jsx',
      'LazyChild',
      { Component },
    )

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'
        import LazyChild from './LazyChild.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent">
                {store.step === 2 && store.payload && <LazyChild payload={store.payload} />}
              </div>
            )
          }
        }
      `,
      '/virtual/ParentLazyView.jsx',
      'ParentView',
      { Component, store, LazyChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    let parentRerenders = 0
    const originalRerender = view[GEA_REQUEST_RENDER].bind(view)
    view[GEA_REQUEST_RENDER] = () => {
      parentRerenders++
      return originalRerender()
    }

    assert.equal(view.el?.querySelector('.lazy-child'), null)

    store.step = 2
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.lazy-child'), null)

    store.payload = { label: 'ready' }
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.lazy-child')?.textContent, 'ready')
    assert.equal(parentRerenders, 0, 'lazy child mount should not force parent [GEA_REQUEST_RENDER]')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
