import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

describe('focus preservation on reactive patch', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => {
    restoreDom()
  })

  it('keeps the input focused when an unrelated text binding updates', async () => {
    const seed = `focus-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const App = (await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        export default class App extends Component {
          label = 'one'
          template() {
            return (
              <div>
                <input class="field" type="text" />
                <span class="side">{this.label}</span>
              </div>
            )
          }
        }
      `,
      '/virtual/FocusApp.tsx',
      'App',
      { Component },
    )) as { new (): { label: string; render: (n: Node) => void; dispose: () => void; el: Element } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()
    const input = root.querySelector('input.field') as HTMLInputElement
    input.focus()
    assert.equal(document.activeElement, input)
    app.label = 'two'
    await flushMicrotasks()
    assert.equal(document.activeElement, input, 'typing focus should survive an unrelated sibling text update')
    app.dispose()
  })
})
