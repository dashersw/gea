import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { GEA_DOM_COMPONENT } from '../../../gea/src/runtime/symbols'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

describe('ported child prop binding regressions', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('object and array props retain live parent proxies for child-side mutation', async () => {
    const seed = `child-props-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      user: { name: 'Alice', address: { city: 'Paris' } },
      items: [{ id: 1 }],
    }) as {
      user: { name: string; address: { city: string } }
      items: Array<{ id: number }>
    }

    const mod = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        class Child extends Component {
          template({ user, items }) {
            return (
              <article class="child">
                <span class="child-name">{user.name}</span>
                <span class="child-city">{user.address.city}</span>
                <span class="child-count">{items.length}</span>
              </article>
            )
          }
        }

        export default class App extends Component {
          template() {
            return (
              <section>
                <span class="parent-name">{store.user.name}</span>
                <span class="parent-city">{store.user.address.city}</span>
                <span class="parent-count">{store.items.length}</span>
                <Child user={store.user} items={store.items} />
              </section>
            )
          }
        }
      `,
      '/virtual/ChildProps.tsx',
      ['Child', 'App'],
      { Component, store },
    )

    const App = mod.App as { new (): { render: (n: Node) => void; dispose: () => void } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const childEl = root.querySelector('.child') as HTMLElement & { [GEA_DOM_COMPONENT]?: any }
    const child = childEl[GEA_DOM_COMPONENT]
    assert.ok(child, 'child component instance is reachable from its root element')

    child.props.user.name = 'Bob'
    child.props.user.address.city = 'Berlin'
    child.props.items.push({ id: 2 })
    await flushMicrotasks()

    assert.equal(store.user.name, 'Bob')
    assert.equal(store.user.address.city, 'Berlin')
    assert.equal(store.items.length, 2)
    assert.equal(root.querySelector('.parent-name')?.textContent, 'Bob')
    assert.equal(root.querySelector('.parent-city')?.textContent, 'Berlin')
    assert.equal(root.querySelector('.parent-count')?.textContent, '2')
    assert.equal(root.querySelector('.child-name')?.textContent, 'Bob')
    assert.equal(root.querySelector('.child-city')?.textContent, 'Berlin')
    assert.equal(root.querySelector('.child-count')?.textContent, '2')

    app.dispose()
    await flushMicrotasks()
  })

  it('primitive props refresh from the parent and clear child text when they become null', async () => {
    const seed = `child-props-null-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ label: 'Ready' }) as { label: string | null }

    const mod = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        class LabelView extends Component {
          template({ label }) {
            return <strong class="label">{label}</strong>
          }
        }

        export default class App extends Component {
          template() {
            return <div><LabelView label={store.label} /></div>
          }
        }
      `,
      '/virtual/ChildPropNull.tsx',
      ['LabelView', 'App'],
      { Component, store },
    )

    const App = mod.App as { new (): { render: (n: Node) => void; dispose: () => void } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const label = root.querySelector('.label') as HTMLElement
    assert.equal(label.textContent, 'Ready')

    store.label = null
    await flushMicrotasks()
    assert.equal(root.querySelector('.label'), label, 'child root is preserved')
    assert.equal(label.textContent, '')

    store.label = 'Done'
    await flushMicrotasks()
    assert.equal(label.textContent, 'Done')

    app.dispose()
    await flushMicrotasks()
  })
})
