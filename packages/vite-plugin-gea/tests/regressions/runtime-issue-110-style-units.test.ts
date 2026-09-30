/**
 * https://github.com/dashersw/gea/issues/110
 *
 * Numeric `style` values pass through without added units, and a string
 * passed to `style` in braces must be applied
 * as `cssText`, like a static `style="…"`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('issue #110: numeric style values retain their units and explicit string styles apply', async () => {
  const restoreDom = installDom()

  try {
    const seed = `issue110-style-units-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class App extends Component {
          height = 120
          opacity = 0.5

          template() {
            return (
              <div>
                <div id="static-number" style={{ height: 120, width: 50 }} />
                <div id="dynamic-number" style={{ height: this.height }} />
                <div id="template-string" style={{ height: \`\${this.height}px\` }} />
                <div id="string-style" style={\`height: \${this.height}px\`} />
                <div id="unitless" style={{ opacity: this.opacity, zIndex: 3, flex: 1, lineHeight: 1.5, fontWeight: 500, order: 2 }} />
                <div id="zero-and-custom" style={{ margin: 0, '--gap': 4 }} />
                <div id="dynamic-object" style={this.height > 100 ? { height: this.height, opacity: 1 } : { width: this.height }} />
              </div>
            )
          }
        }
      `,
      '/virtual/Issue110App.tsx',
      'App',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new App()
    view.render(root)
    await flushMicrotasks()

    const byId = (id: string) => root.querySelector('#' + id) as HTMLElement

    assert.equal(byId('static-number').style.height, '')
    assert.equal(byId('static-number').style.width, '')
    assert.equal(byId('dynamic-number').style.height, '')
    assert.equal(byId('template-string').style.height, '120px')
    assert.equal(byId('string-style').style.height, '120px')

    const unitless = byId('unitless').style
    assert.equal(unitless.opacity, '0.5')
    assert.equal(unitless.zIndex, '3')
    assert.equal(unitless.getPropertyValue('flex-grow'), '1')
    assert.equal(unitless.lineHeight, '1.5')
    assert.equal(unitless.fontWeight, '500')
    assert.equal(unitless.order, '2')

    assert.equal(byId('zero-and-custom').style.margin, '0px')
    assert.equal(byId('zero-and-custom').style.getPropertyValue('--gap'), '4')

    assert.equal(byId('dynamic-object').style.height, '')
    assert.equal(byId('dynamic-object').style.opacity, '1')

    view.height = 60
    await flushMicrotasks()

    assert.equal(byId('dynamic-number').style.height, '')
    assert.equal(byId('template-string').style.height, '60px')
    assert.equal(byId('string-style').style.height, '60px')
    assert.equal(byId('dynamic-object').style.height, '')
    assert.equal(byId('dynamic-object').style.width, '')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
