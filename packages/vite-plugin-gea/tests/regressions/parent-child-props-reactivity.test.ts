/**
 * Port of deleted two-way-binding matrix: parent → child prop updates (compiled JSX).
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

describe('parent → child prop reactivity (compiled)', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(async () => {
    restoreDom()
  })

  it('primitive prop from parent state updates the child’s rendered output', async () => {
    const seed = `pc-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const m = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        class Child extends Component {
          template({ n }: { n?: number }) {
            return <em class="n">{n}</em>
          }
        }
        export default class Parent extends Component {
          count = 1
          template() { return <div class="p"><Child n={this.count} /></div> }
        }
      `,
      '/virtual/ParentChild.tsx',
      ['Child', 'Parent'],
      { Component },
    )
    const Parent = m.Parent as {
      new (): { render: (n: Node) => void; dispose: () => void; el: Element; count: number }
    }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const p = new Parent()
    p.render(root)
    await flushMicrotasks()
    assert.equal(root.querySelector('.n')?.textContent, '1')
    p.count = 42
    await flushMicrotasks()
    assert.equal(root.querySelector('.n')?.textContent, '42')
    p.dispose()
  })

  it('nested object field passed as prop → deep mutation in parent updates the child', async () => {
    const seed = `pc-obj-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const m = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        class Show extends Component {
          template({ row }: { row?: { k: string } }) {
            return <span class="k">{row.k}</span>
          }
        }
        export default class App extends Component {
          row = { k: 'a' }
          template() { return <div><Show row={this.row} /></div> }
        }
      `,
      '/virtual/ObjProps.tsx',
      ['Show', 'App'],
      { Component },
    )
    const App = m.App as { new (): { render: (n: Node) => void; dispose: () => void; el: Element; row: { k: string } } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()
    app.row.k = 'b'
    await flushMicrotasks()
    assert.equal(root.querySelector('.k')?.textContent, 'b')
    app.dispose()
  })

  it('array push on parent-owned array passed to a child: child text tracks length (getter path)', async () => {
    const seed = `pc-arr-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const m = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        class Len extends Component {
          template({ xs }: { xs?: number[] }) {
            return <span class="len">{xs.length}</span>
          }
        }
        export default class App extends Component {
          xs: number[] = [1, 2]
          template() { return <div><Len xs={this.xs} /></div> }
        }
      `,
      '/virtual/ArrProps.tsx',
      ['Len', 'App'],
      { Component },
    )
    const App = m.App as { new (): { render: (n: Node) => void; dispose: () => void; el: Element; xs: number[] } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()
    assert.equal(root.querySelector('.len')?.textContent, '2')
    app.xs.push(3)
    await flushMicrotasks()
    assert.equal(root.querySelector('.len')?.textContent, '3')
    app.dispose()
  })

  it('callback prop: child button triggers parent state change', async () => {
    const seed = `pc-cb-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const m = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        class Child extends Component {
          template({ onBoom }: { onBoom?: () => void }) {
            return <button class="go" click={onBoom}>go</button>
          }
        }
        export default class App extends Component {
          hits = 0
          template() { return <div><span class="hits">{this.hits}</span><Child onBoom={() => { this.hits++ }} /></div> }
        }
      `,
      '/virtual/CallbackProps.tsx',
      ['Child', 'App'],
      { Component },
    )
    const App = m.App as { new (): { render: (n: Node) => void; dispose: () => void; el: Element; hits: number } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()
    ;(root.querySelector('button.go') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelector('.hits')?.textContent, '1')
    app.dispose()
  })
})
