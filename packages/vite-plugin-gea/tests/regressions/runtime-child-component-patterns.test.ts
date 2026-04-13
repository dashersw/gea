import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

describe('nested component mount patterns', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => {
    restoreDom()
  })

  it('nested custom components (H inside Box) render their own template', async () => {
    const seed = `nest-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const m = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        export class H extends Component { template() { return <b class="hh">T</b> } }
        export class Box extends Component {
          template() {
            return (
              <div class="box">
                <div class="mount-h"><H /></div>
                <div class="rest">R</div>
              </div>
            )
          }
        }
        export class App extends Component {
          template() { return <Box /> }
        }
      `,
      '/virtual/BoxH.tsx',
      ['H', 'Box', 'App'],
      { Component },
    )
    const App = m.App as { new (): { render: (n: Node) => void; dispose: () => void; el: Element } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()
    assert.equal(root.querySelector('b.hh')?.textContent, 'T')
    app.dispose()
  })
})
