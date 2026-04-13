/**
 * HMR: after swapping a class’s prototype, every mounted instance of that class
 * (e.g. one per “tab” panel) must pick up the new template when re-rendered.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'
import { rebindClassInstancesToNewPrototype, registerComponentInstance } from '../helpers/gea-hmr-runtime'
import { GEA_DOM_COMPONENT } from '../../../gea/src/runtime/symbols'

function panelText(host: Element | null) {
  return host?.querySelector('.t')?.textContent
}

describe('HMR: duplicate panel class in two tab slots', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => {
    restoreDom()
  })

  it('an updated Panel class re-renders in both tab roots after a synthetic hot swap', async () => {
    const seed = `hmr-tab-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const srcV1 = `
        import { Component } from '@geajs/core'
        export class Panel extends Component {
          template() { return <div class="t">v1</div> }
        }
        export class Tabs extends Component {
          active = 0
          template() {
            return (
              <div class="tabs">
                <div
                  class="tab0"
                  style={{ display: this.active === 0 ? 'block' : 'none' }}
                >
                  <Panel />
                </div>
                <div
                  class="tab1"
                  style={{ display: this.active === 1 ? 'block' : 'none' }}
                >
                  <Panel />
                </div>
              </div>
            )
          }
        }
    `
    const m1 = await compileJsxModule(srcV1, '/virtual/TabsPanels.tsx', ['Panel', 'Tabs'], { Component })
    const Tabs = m1.Tabs as { new (): { active: number; render: (n: Node) => void; dispose: () => void; el: Element } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new Tabs()
    app.render(root)
    await flushMicrotasks()
    for (const host of [root.querySelector('.tab0'), root.querySelector('.tab1')]) {
      const el = host!.firstElementChild as unknown as { [k: symbol]: any } | null
      const c = el?.[GEA_DOM_COMPONENT] as { constructor: { name: string } } | undefined
      if (c?.constructor?.name === 'Panel') registerComponentInstance('Panel', c)
    }
    assert.equal(panelText(root.querySelector('.tab0')), 'v1')
    assert.equal(panelText(root.querySelector('.tab1')), 'v1')

    const srcV2 = srcV1.replace('v1', 'v2')
    const m2 = await compileJsxModule(srcV2, '/virtual/TabsPanelsV2.tsx', ['Panel', 'Tabs'], { Component })
    rebindClassInstancesToNewPrototype('Panel', m2.Panel)

    assert.equal(panelText(root.querySelector('.tab0')), 'v2', 'visible tab picks up hot template')
    assert.equal(panelText(root.querySelector('.tab1')), 'v2', 'off-screen tab also updated for later switch')
    app.active = 1
    await flushMicrotasks()
    assert.equal(panelText(root.querySelector('.tab1')), 'v2')
    app.dispose()
  })
})
