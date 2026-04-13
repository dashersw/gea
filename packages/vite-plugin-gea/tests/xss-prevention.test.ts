import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileJsxModule, loadRuntimeModules } from './helpers/compile'

describe('XSS prevention with closure runtime DOM writes', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('dynamic text expressions are written as text nodes, not parsed as HTML', async () => {
    const seed = `xss-text-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ value: '<img src=x onerror=alert(1)>' }) as { value: string }

    const TextProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class TextProbe extends Component {
          template() {
            return <div class="target">{store.value}</div>
          }
        }
      `,
      '/virtual/TextProbe.tsx',
      'TextProbe',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new TextProbe()
    view.render(root)
    await flushMicrotasks()

    const target = root.querySelector('.target') as HTMLElement
    assert.equal(target.textContent, '<img src=x onerror=alert(1)>')
    assert.equal(target.querySelector('img'), null)

    store.value = '<script>alert(2)</script>'
    await flushMicrotasks()
    assert.equal(target.textContent, '<script>alert(2)</script>')
    assert.equal(target.querySelector('script'), null)

    view.dispose()
    await flushMicrotasks()
  })

  it('primitive children props stay text-safe, while component children render as DOM', async () => {
    const seed = `xss-children-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ label: '<b>bold</b>' }) as { label: string }

    const mod = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        class Slot extends Component {
          template({ children }) {
            return <main class="slot">{children}</main>
          }
        }

        class Badge extends Component {
          template() {
            return <strong class="badge">DOM child</strong>
          }
        }

        export default class App extends Component {
          template() {
            return (
              <section>
                <Slot>{store.label}</Slot>
                <Slot><Badge /></Slot>
              </section>
            )
          }
        }
      `,
      '/virtual/ChildrenXss.tsx',
      ['Slot', 'Badge', 'App'],
      { Component, store },
    )

    const App = mod.App as { new (): { render: (n: Node) => void; dispose: () => void } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const slots = root.querySelectorAll('.slot')
    assert.equal(slots[0].textContent, '<b>bold</b>')
    assert.equal(slots[0].querySelector('b'), null)
    assert.equal(slots[1].querySelector('.badge')?.textContent, 'DOM child')

    store.label = '<i>italic</i>'
    await flushMicrotasks()
    assert.equal(slots[0].textContent, '<i>italic</i>')
    assert.equal(slots[0].querySelector('i'), null)

    app.dispose()
    await flushMicrotasks()
  })

  it('dangerouslySetInnerHTML remains an explicit raw HTML escape hatch', async () => {
    const seed = `xss-html-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ html: '<strong>trusted</strong>' }) as { html: string }

    const HtmlProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class HtmlProbe extends Component {
          template() {
            return <div class="rich" dangerouslySetInnerHTML={store.html} />
          }
        }
      `,
      '/virtual/HtmlProbe.tsx',
      'HtmlProbe',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new HtmlProbe()
    view.render(root)
    await flushMicrotasks()

    const rich = root.querySelector('.rich') as HTMLElement
    assert.equal(rich.querySelector('strong')?.textContent, 'trusted')
    assert.equal(rich.hasAttribute('dangerouslySetInnerHTML'), false)

    store.html = '<em>updated</em>'
    await flushMicrotasks()
    assert.equal(rich.querySelector('em')?.textContent, 'updated')

    view.dispose()
    await flushMicrotasks()
  })
})
