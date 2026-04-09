import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { GEA_DOM_KEY } from '../../../gea/src/lib/symbols'
import { compileJsxComponent, loadComponentUnseeded } from '../helpers/compile'

async function mountCompiledComponent(source: string, bindings: Record<string, unknown>, id: string) {
  const restoreDom = installDom()
  const Component = await loadComponentUnseeded()
  const App = await compileJsxComponent(source, id, 'App', { Component, ...bindings })
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  await flushMicrotasks()
  return {
    root,
    app,
    dispose: async () => {
      app.dispose()
      await flushMicrotasks()
      root.remove()
      restoreDom()
    },
  }
}

test('unrelated conditional slots do not erase sibling initial HTML lists', async () => {
  const { Store } = await import('../../../gea/src/lib/store.ts')

  class TestStore extends Store {
    users = [
      { id: 'u1', name: 'PR' },
      { id: 'u2', name: 'LG' },
    ]
    areFiltersCleared = false
  }

  const store = new TestStore()
  const source = `
    import { Component } from '@geajs/core'
    import store from './store'

    export default class App extends Component {
      template() {
        return (
          <div>
            <div class="avatars">
              {store.users.map((user) => (
                <div key={user.id} class="avatar">
                  {user.name}
                </div>
              ))}
            </div>
            {!store.areFiltersCleared && <div class="clear">Clear all</div>}
          </div>
        )
      }
    }
  `

  const mounted = await mountCompiledComponent(source, { store }, '/virtual/unrelated-conditional-list.tsx')
  try {
    assert.equal(mounted.root.querySelectorAll('.avatar').length, 2)
    assert.equal(mounted.root.querySelector('.clear')?.textContent?.trim(), 'Clear all')
  } finally {
    await mounted.dispose()
  }
})

test('conditional slot HTML lists render pre-existing items on initial mount', async () => {
  const { Store } = await import('../../../gea/src/lib/store.ts')

  class TestStore extends Store {
    items = [
      { id: 'i1', label: 'First' },
      { id: 'i2', label: 'Second' },
    ]
  }

  const store = new TestStore()
  const source = `
    import { Component } from '@geajs/core'
    import store from './store'

    export default class App extends Component {
      template() {
        return (
          <div>
            {store.items.length === 0 ? (
              <div class="empty">Empty</div>
            ) : (
              <div class="rows">
                {store.items.map((item) => (
                  <div key={item.id} class="row">
                    {item.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    }
  `

  const mounted = await mountCompiledComponent(source, { store }, '/virtual/conditional-initial-list.tsx')
  try {
    assert.equal(mounted.root.querySelectorAll('.row').length, 2)
    assert.equal(mounted.root.querySelector('.empty'), null)
  } finally {
    await mounted.dispose()
  }
})

test('conditional slot empty branch remains visible when initial list is empty', async () => {
  const { Store } = await import('../../../gea/src/lib/store.ts')

  class TestStore extends Store {
    items: Array<{ id: string; label: string }> = []
  }

  const store = new TestStore()
  const source = `
    import { Component } from '@geajs/core'
    import store from './store'

    export default class App extends Component {
      template() {
        return (
          <div class="rows">
            {store.items.length === 0 ? (
              <div class="empty">Empty</div>
            ) : (
              store.items.map((item) => (
                <div key={item.id} class="row">
                  {item.label}
                </div>
              ))
            )}
          </div>
        )
      }
    }
  `

  const mounted = await mountCompiledComponent(source, { store }, '/virtual/conditional-empty-list.tsx')
  try {
    assert.equal(mounted.root.querySelector('.empty')?.textContent?.trim(), 'Empty')
    assert.equal(mounted.root.querySelectorAll('.row').length, 0)
  } finally {
    await mounted.dispose()
  }
})

test('gesture-log pattern: empty branch to keyed list with unshift keeps unique data-gid', async () => {
  const { Store } = await import('../../../gea/src/lib/store.ts')

  let counter = 0
  class LogStore extends Store {
    entries: Array<{ id: string; label: string }> = []

    addEntry() {
      this.entries.unshift({ id: String(++counter), label: 'tap' })
      if (this.entries.length > 20) this.entries.pop()
    }
  }

  const store = new LogStore()
  const source = `
    import { Component } from '@geajs/core'
    import store from './store'

    export default class App extends Component {
      template() {
        return (
          <div class="gesture-log">
            {store.entries.length === 0 ? (
              <div class="gesture-log-empty">No gestures detected yet</div>
            ) : (
              store.entries.map((entry) => (
                <div key={entry.id} class="gesture-log-entry">
                  <span>{entry.label}</span>
                </div>
              ))
            )}
          </div>
        )
      }
    }
  `

  const mounted = await mountCompiledComponent(source, { store }, '/virtual/gesture-log-unique-ids.tsx')
  try {
    for (let i = 0; i < 4; i++) {
      store.addEntry()
      await flushMicrotasks()
    }

    const rows = mounted.root.querySelectorAll('.gesture-log-entry')
    const ids = [...rows].map((el) => (el as any)[GEA_DOM_KEY] ?? el.getAttribute('data-gid'))
    const unique = new Set(ids)
    assert.equal(unique.size, ids.length, `duplicate keys: ${JSON.stringify(ids)}`)
  } finally {
    await mounted.dispose()
  }
})
