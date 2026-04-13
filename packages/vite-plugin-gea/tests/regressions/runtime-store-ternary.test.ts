import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

describe('ternary branches with component local store state (A/B swap)', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => {
    restoreDom()
  })

  it('flips A/B when a boolean on the parent component changes', async () => {
    const seed = `tern-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const m = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        class A extends Component { template() { return <i class="a">A</i> } }
        class B extends Component { template() { return <i class="b">B</i> } }
        export default class Gate extends Component {
          ok = true
          template() { return <div class="g">{this.ok ? <A /> : <B />}</div> }
        }
      `,
      '/virtual/Gate.tsx',
      ['A', 'B', 'Gate'],
      { Component },
    )
    const Gate = m.Gate as { new (): { ok: boolean; render: (n: Node) => void; dispose: () => void; el: Element } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const g = new Gate()
    g.render(root)
    await flushMicrotasks()
    assert.ok(root.querySelector('i.a'))
    g.ok = false
    await flushMicrotasks()
    assert.ok(root.querySelector('i.b'))
    g.dispose()
  })
})
