import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from '../helpers/compile'

// Bug: store-backed component list inside a conditional (lazy) child renders
// items in the constructor but the DOM container doesn't exist until the
// conditional flips true. After mount, pre-created items must be synced into
// the container via Component's private list sync after mount.
test('store-backed component list inside lazy conditional renders items after mount', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-lazy-list-mount`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    // Compile the store through the plugin so fields become signals
    const AppStore = await compileStore(
      `
        import { Store } from '@geajs/core'

        export default class AppStore extends Store {
          showList = false
          items = [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 3, name: 'Charlie' },
          ]
        }
      `,
      '/virtual/AppStore.ts',
      'AppStore',
      { Store },
    )
    const store = new AppStore()

    const ItemRow = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ItemRow extends Component {
          template({ item }) {
            return <tr class="item-row"><td>{item.name}</td></tr>
          }
        }
      `,
      '/virtual/ItemRow.jsx',
      'ItemRow',
      { Component },
    )

    const ListView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'
        import ItemRow from './ItemRow.tsx'

        export default class ListView extends Component {
          template() {
            return (
              <div class="list-view">
                <table>
                  <tbody>
                    {store.items.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        }
      `,
      '/virtual/ListView.jsx',
      'ListView',
      { Component, store, ItemRow },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'
        import ListView from './ListView.tsx'

        export default class App extends Component {
          template() {
            return (
              <div>
                {store.showList && <ListView />}
              </div>
            )
          }
        }
      `,
      '/virtual/App.jsx',
      'App',
      { Component, store, ListView },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    // Initially: showList is false, no items
    assert.equal(root.querySelectorAll('.item-row').length, 0, 'no items before conditional flip')

    // Flip conditional
    store.showList = true
    await flushMicrotasks()

    // After flip: items must be rendered
    assert.equal(root.querySelectorAll('.item-row').length, 3, 'items must render after lazy component mounts')

    // Verify content
    const names = Array.from(root.querySelectorAll('.item-row td')).map((td) => td.textContent)
    assert.deepEqual(names, ['Alice', 'Bob', 'Charlie'])
  } finally {
    restoreDom()
  }
})
