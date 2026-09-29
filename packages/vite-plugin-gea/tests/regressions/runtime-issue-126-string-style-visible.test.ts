/**
 * https://github.com/dashersw/gea/issues/126
 *
 * A string `style` in braces must only touch the properties it declares, so the
 * `display: none` that `visible={false}` writes on the same element survives
 * style updates, whatever the attribute order.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('issue #126: a string style keeps visible={false} elements hidden', async () => {
  const restoreDom = installDom()

  try {
    const seed = `issue126-string-style-visible-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class App extends Component {
          open = false
          color = 'red'

          template() {
            return (
              <div>
                <div id="visible-then-string" visible={this.open} style={\`color: \${this.color}\`}>A</div>
                <div id="string-then-visible" style={\`color: \${this.color}\`} visible={this.open}>B</div>
                <div id="visible-then-object" visible={this.open} style={{ color: this.color }}>C</div>
                <div id="string-with-display" style={\`color: \${this.color}; display: flex\`} visible={this.open}>D</div>
                <div id="foreign-style" style={\`color: \${this.color}\`}>E</div>
              </div>
            )
          }
        }
      `,
      '/virtual/Issue126App.tsx',
      'App',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new App()
    view.render(root)
    await flushMicrotasks()

    const byId = (id: string) => root.querySelector('#' + id) as HTMLElement
    const hidden = ['visible-then-string', 'string-then-visible', 'visible-then-object', 'string-with-display']

    for (const id of hidden) {
      assert.equal(byId(id).style.display, 'none', `${id} hidden after first render`)
      assert.equal(byId(id).style.color, 'red', `${id} color after first render`)
    }

    byId('foreign-style').style.transform = 'scale(2)'

    view.color = 'green'
    await flushMicrotasks()

    for (const id of hidden) {
      assert.equal(byId(id).style.display, 'none', `${id} hidden after a style update`)
      assert.equal(byId(id).style.color, 'green', `${id} color after a style update`)
    }
    assert.equal(byId('foreign-style').style.transform, 'scale(2)')
    assert.equal(byId('foreign-style').style.color, 'green')

    view.open = true
    await flushMicrotasks()

    for (const id of ['visible-then-string', 'string-then-visible', 'visible-then-object']) {
      assert.equal(byId(id).style.display, '', `${id} shown after open = true`)
    }

    view.open = false
    await flushMicrotasks()
    view.color = 'blue'
    await flushMicrotasks()

    for (const id of hidden) {
      assert.equal(byId(id).style.display, 'none', `${id} hidden again after toggling`)
      assert.equal(byId(id).style.color, 'blue', `${id} color after toggling`)
    }

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
