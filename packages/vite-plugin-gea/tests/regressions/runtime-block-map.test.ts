import assert from 'node:assert/strict'
import { it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

it('updates block-bodied list callbacks when a row is replaced', async () => {
  const restore = installDom()
  try {
    const [{ default: Component }] = await loadRuntimeModules('block-map')
    const App = (await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class App extends Component {
        items = [{ id: 1, name: 'first' }]
        template() {
          return <div>{this.items.map((item) => {
            const label = 'item ' + item.name
            return <span key={item.id}>{label}</span>
          })}</div>
        }
      }
    `,
      '/virtual/BlockMap.jsx',
      'App',
      { Component },
    )) as any
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()
    assert.equal(root.textContent, 'item first')
    app.items = [{ id: 1, name: 'second' }]
    await flushMicrotasks()
    assert.equal(root.textContent, 'item second')
    app.items.push({ id: 2, name: 'third' })
    await flushMicrotasks()
    assert.equal(root.textContent, 'item seconditem third')
    app.items[0].name = 'updated'
    await flushMicrotasks()
    assert.equal(root.textContent, 'item updateditem third')
    app.dispose()
  } finally {
    restore()
  }
})
