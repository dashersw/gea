import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { GEA_DOM_COMPONENT } from '../../../gea/src/runtime/symbols'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

describe('ported gea-ui binding patterns', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('callback props remain callable after parent refreshes child props', async () => {
    const seed = `ui-callback-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ value: 'one', calls: 0 }) as { value: string; calls: number }

    const mod = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        class SelectLike extends Component {
          created(props) {
            this.fire = () => props.onValueChange({ value: this.props.value + '!' })
          }

          template(props) {
            return (
              <button class="select-like" click={() => this.fire()}>
                {props.value}
              </button>
            )
          }
        }

        export default class App extends Component {
          template() {
            return (
              <section>
                <span class="parent-value">{store.value}</span>
                <span class="calls">{store.calls}</span>
                <SelectLike value={store.value} onValueChange={(details) => { store.calls++; store.value = details.value }} />
              </section>
            )
          }
        }
      `,
      '/virtual/UiCallback.tsx',
      ['SelectLike', 'App'],
      { Component, store },
    )

    const App = mod.App as { new (): { render: (n: Node) => void; dispose: () => void } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const button = root.querySelector('.select-like') as HTMLButtonElement
    button.click()
    await flushMicrotasks()
    assert.equal(root.querySelector('.parent-value')?.textContent, 'one!')
    assert.equal(root.querySelector('.calls')?.textContent, '1')
    assert.equal(root.querySelector('.select-like'), button, 'prop refresh should patch child, not replace it')

    button.click()
    await flushMicrotasks()
    assert.equal(root.querySelector('.parent-value')?.textContent, 'one!!')
    assert.equal(root.querySelector('.calls')?.textContent, '2')
    assert.equal(root.querySelector('.select-like'), button)

    app.dispose()
    await flushMicrotasks()
  })

  it('prop refresh patches child class while preserving child-managed DOM', async () => {
    const seed = `ui-child-dom-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ selected: false }) as { selected: boolean }

    const mod = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        class ButtonLike extends Component {
          template({ class: klass }) {
            return <button class={klass}><span class="label">Pick</span></button>
          }
        }

        export default class App extends Component {
          template() {
            return <ButtonLike class={store.selected ? 'btn selected' : 'btn'} />
          }
        }
      `,
      '/virtual/UiClassPatch.tsx',
      ['ButtonLike', 'App'],
      { Component, store },
    )

    const App = mod.App as { new (): { render: (n: Node) => void; dispose: () => void } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const button = root.querySelector('button') as HTMLButtonElement
    const label = root.querySelector('.label') as HTMLElement
    const child = (button as HTMLElement & { [GEA_DOM_COMPONENT]?: any })[GEA_DOM_COMPONENT]
    assert.ok(child, 'child instance should remain associated with its DOM root')

    store.selected = true
    await flushMicrotasks()
    assert.equal(root.querySelector('button'), button)
    assert.equal(root.querySelector('.label'), label)
    assert.equal(button.className, 'btn selected')

    store.selected = false
    await flushMicrotasks()
    assert.equal(root.querySelector('button'), button)
    assert.equal(button.className, 'btn')

    app.dispose()
    await flushMicrotasks()
  })
})
