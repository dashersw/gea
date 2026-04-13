import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

const LIST_A = `
import { Component } from '@geajs/core'

export default class ListA extends Component {
  template({ items }) {
    return (
      <div class="left-list">
        {items.map((item) => (
          <button key={item.id} class="left-item">{item.label}</button>
        ))}
      </div>
    )
  }
}
`

const LIST_B = `
import { Component } from '@geajs/core'

export default class ListB extends Component {
  template({ items }) {
    return (
      <div class="right-list">
        {items.map((item) => (
          <span key={item.id} class={item.ok ? 'right-item ready' : 'right-item pending'}>
            {item.label}
          </span>
        ))}
      </div>
    )
  }
}
`

const APP = `
import { Component } from '@geajs/core'
import store from './store'

export default class App extends Component {
  template() {
    return (
      <section class="app">
        <ListA items={store.left} />
        <ListB items={store.right} />
      </section>
    )
  }
}
`

test('cross-module keyed-list rescue is scoped by list family, not just raw key', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cross-module-rescue-scope`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      left: [{ id: 'u1', label: 'left row' }],
      right: [],
    })

    const ListA = await compileJsxComponent(LIST_A, '/virtual/ListA.tsx', 'ListA', { Component })
    const ListB = await compileJsxComponent(LIST_B, '/virtual/ListB.tsx', 'ListB', { Component })
    const App = await compileJsxComponent(APP, '/virtual/App.tsx', 'App', { Component, store, ListA, ListB })

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.left-item').length, 1)
    assert.equal(root.querySelectorAll('.right-item').length, 0)

    store.left = []
    store.right = [{ id: 'u1', label: 'right row', ok: true }]
    await flushMicrotasks()
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.left-item').length, 0, 'left list entry should be removed')
    const right = root.querySelector('.right-item') as HTMLElement | null
    assert.ok(right, 'right list entry should render without rescuing the left row')
    assert.equal(right?.textContent?.trim(), 'right row')
    assert.ok(right?.classList.contains('ready'), 'right row should keep its own dynamic class state')

    app.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
