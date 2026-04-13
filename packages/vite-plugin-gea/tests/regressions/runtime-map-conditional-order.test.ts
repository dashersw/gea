import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

describe('map() items + trailing conditional — DOM order', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => {
    restoreDom()
  })

  it('pushes a new list item and keeps the conditional slot at the end of the <ul>', async () => {
    const seed = `map-cond-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const App = (await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        export default class App extends Component {
          items: string[] = ['a']
          showExtra = true
          template() {
            return (
              <ul class="u">
                {this.items.map((id) => (
                  <li key={id} class="row">{id}</li>
                ))}
                {this.showExtra && <li class="cond">+</li>}
              </ul>
            )
          }
        }
      `,
      '/virtual/MapCond.tsx',
      'App',
      { Component },
    )) as {
      new (): { items: string[]; showExtra: boolean; render: (n: Node) => void; dispose: () => void; el: Element }
    }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()
    const ul = root.querySelector('ul.u')!
    assert.equal(ul?.lastElementChild?.className, 'cond', 'cond slot is last on first paint')
    app.items = [...app.items, 'b']
    await flushMicrotasks()
    assert.equal(ul?.lastElementChild?.className, 'cond', 'cond slot still last after list push')
    assert.equal(ul?.querySelectorAll('li').length, 3, 'two data rows + cond')
    app.dispose()
  })
})
