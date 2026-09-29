/**
 * https://github.com/dashersw/gea/issues/127
 *
 * Custom property names in `style` objects are case-sensitive, so `'--myColor'`
 * must be set as `--myColor`, not kebab-cased to `--my-color`. Covers the
 * compiler's static-key path and the runtime's dynamic-object path.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('issue #127: camelCase custom properties in style objects keep their spelling', async () => {
  const restoreDom = installDom()

  try {
    const seed = `issue127-style-custom-props-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class App extends Component {
          theme = { '--brandColor': 'blue', color: 'var(--brandColor)' }
          size = 4

          template() {
            return (
              <div>
                <div id="custom-static" style={{ '--myColor': 'red', color: 'var(--myColor)' }}>D</div>
                <div id="custom-dynamic" style={this.theme}>E</div>
                <div id="custom-lower" style={{ '--mycolor': 'red', color: 'var(--mycolor)' }}>F</div>
                <div id="custom-reactive" style={{ '--gapSize': this.size, backgroundColor: 'red' }}>G</div>
              </div>
            )
          }
        }
      `,
      '/virtual/Issue127App.tsx',
      'App',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new App()
    view.render(root)
    await flushMicrotasks()

    const style = (id: string) => (root.querySelector('#' + id) as HTMLElement).style

    assert.equal(style('custom-static').getPropertyValue('--myColor'), 'red')
    assert.equal(style('custom-static').getPropertyValue('--my-color'), '')
    assert.equal(style('custom-dynamic').getPropertyValue('--brandColor'), 'blue')
    assert.equal(style('custom-dynamic').getPropertyValue('--brand-color'), '')
    assert.equal(style('custom-lower').getPropertyValue('--mycolor'), 'red')
    assert.equal(style('custom-reactive').getPropertyValue('--gapSize'), '4')
    assert.equal(style('custom-reactive').backgroundColor, 'red')

    view.size = 8
    view.theme = { '--brandColor': 'green', color: 'var(--brandColor)' }
    await flushMicrotasks()

    assert.equal(style('custom-reactive').getPropertyValue('--gapSize'), '8')
    assert.equal(style('custom-dynamic').getPropertyValue('--brandColor'), 'green')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
