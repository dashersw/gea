import assert from 'node:assert/strict'
import { it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

for (const pattern of ['value', '[value]']) {
  it(`updates child props and events from a keyed row parameter ${pattern}`, async () => {
    const restore = installDom()
    let view: any
    try {
      const [{ default: Component }, { Store }] = await loadRuntimeModules(`row-${pattern}`)
      const wrap = (value: any) => (pattern === 'value' ? value : [value])
      const store = new Store({ items: [wrap(null)] })
      const clicks: any[] = []
      const App = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'
        function Child({ value, click }) { return <button click={click}>{value ?? 'empty'}</button> }
        export default class App extends Component {
          template() { return <div>{store.items.map((${pattern}, index) => <Child key={index} value={value} click={() => clicks.push(value)} />)}</div> }
        }
      `,
        '/virtual/ObservableRow.tsx',
        'App',
        { Component, store, clicks },
      )
      const root = document.createElement('div')
      document.body.appendChild(root)
      view = new App()
      view.render(root)
      const button = root.querySelector('button')!
      assert.equal(button.textContent, 'empty')
      for (const value of ['X', 'O', null, 'Z']) {
        store.items[0] = wrap(value)
        await flushMicrotasks()
        assert.equal(root.querySelector('button'), button, 'keyed row retains its DOM')
        assert.equal(button.textContent, value ?? 'empty')
        button.click()
      }
      assert.deepEqual(clicks, ['X', 'O', null, 'Z'])
    } finally {
      view?.dispose()
      restore()
    }
  })
}

it('keeps outer and inner row values distinct in nested lists', async () => {
  const restore = installDom()
  let view: any
  try {
    const [{ default: Component }] = await loadRuntimeModules('nested-row-values')
    const App = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      function Cell({ address }) { return <span data-address={address}>{address}</span> }
      export default class App extends Component {
        template() { return <div>{[1, 2].map(row => <section key={row}>{['A', 'B'].map(col => {
          const address = col + row
          return <Cell key={address} address={address} />
        })}</section>)}</div> }
      }
    `,
      '/virtual/NestedRow.tsx',
      'App',
      { Component },
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    view = new App()
    view.render(root)
    assert.deepEqual(
      Array.from(root.querySelectorAll('[data-address]'), (el) => el.textContent),
      ['A1', 'B1', 'A2', 'B2'],
    )
  } finally {
    view?.dispose()
    restore()
  }
})
