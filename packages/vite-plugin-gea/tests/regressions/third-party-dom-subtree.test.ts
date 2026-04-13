/**
 * Port of quill-editor spirit: foreign DOM under a Gea-owned element must survive
 * unrelated reactive updates (framework does not wipe unknown children).
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

describe('third-party DOM under a template root', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => {
    restoreDom()
  })

  it('preserves manually inserted descendants when a sibling binding changes', async () => {
    const seed = `tp-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const App = (await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        export default class App extends Component {
          side = 'x'
          template() {
            return (
              <div class="wrap">
                <div class="editor-host" />
                <span class="label">{this.side}</span>
              </div>
            )
          }
        }
      `,
      '/virtual/TpApp.tsx',
      'App',
      { Component },
    )) as { new (): { side: string; render: (n: Node) => void; dispose: () => void; el: Element } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()
    const host = app.el.querySelector('.editor-host') as HTMLDivElement
    const foreign = document.createElement('div')
    foreign.className = 'fake-quill'
    foreign.textContent = 'LIB'
    host.appendChild(foreign)
    app.side = 'y'
    await flushMicrotasks()
    assert.equal(foreign.textContent, 'LIB', 'foreign subtree should remain after sibling patch')
    assert.ok(host.contains(foreign))
    app.dispose()
  })
})
