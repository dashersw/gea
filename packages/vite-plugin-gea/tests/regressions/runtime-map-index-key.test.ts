import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

describe('map() explicit index key in specialized keyed lists', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('rewrites key={i} to the specialized createEntry idx param', async () => {
    const seed = `map-index-key-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const App = (await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class App extends Component {
          items = ['a', 'b', 'c']

          template() {
            return (
              <div class="root">
                {this.items.map((item, i) => (
                  <span key={i} class="crumb">
                    {i > 0 && <span class="sep">/</span>}
                    <span class="label">{item}</span>
                  </span>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/MapIndexKey.jsx',
      'App',
      { Component },
    )) as {
      new (): { items: string[]; render: (n: Node) => void; dispose: () => void }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.crumb').length, 3)
    assert.equal(root.querySelectorAll('.sep').length, 2)
    assert.deepEqual(
      [...root.querySelectorAll('.label')].map((n) => n.textContent),
      ['a', 'b', 'c'],
    )

    app.dispose()
  })
})
