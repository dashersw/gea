/**
 * Tests for reactive props: parent passes props to child components and
 * the child updates when the parent changes the value.
 *
 * v2: Store fields must be compiled via compileStore (base Store is empty).
 * Props are passed as thunks via __setProps.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { installDom, flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from './helpers/compile'
import { resetDelegation } from '../../gea/src/dom/events'

test('compiled child: parent passes props and child updates when parent state changes', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `reactive-${Date.now()}-compiled`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const MessageStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class MessageStore extends Store {
          message = 'hello'
        }
      `,
      '/virtual/message-store.ts',
      'MessageStore',
      { Store },
    )
    const store = new MessageStore()

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
    assert.equal(view.el?.querySelector('.message')?.textContent?.trim(), 'hello')

    store.message = 'world'
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.message')?.textContent?.trim(), 'world')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('compiled child: multiple reactive props from parent state', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `reactive-${Date.now()}-multi`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const NumberStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class NumberStore extends Store {
          a = 1
          b = 2
        }
      `,
      '/virtual/number-store.ts',
      'NumberStore',
      { Store },
    )
    const store = new NumberStore()

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
  resetDelegation()

  try {
    const seed = `reactive-${Date.now()}-lazy-child`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const LazyStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class LazyStore extends Store {
          step = 1
          payload = null as null | { label: string }
        }
      `,
      '/virtual/lazy-store.ts',
      'LazyStore',
      { Store },
    )
    const store = new LazyStore()

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

    assert.equal(view.el?.querySelector('.lazy-child'), null)

    store.step = 2
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.lazy-child'), null)

    store.payload = { label: 'ready' }
    await flushMicrotasks()
    assert.equal(view.el?.querySelector('.lazy-child')?.textContent, 'ready')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
