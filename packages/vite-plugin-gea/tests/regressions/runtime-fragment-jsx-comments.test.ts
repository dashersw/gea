import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

/**
 * Regression: a `{/* comment *\/}` child of a fragment must not shift the DOM
 * walk of the fragment's other children. It emits no node, so counting it made
 * the button's walk read `root.childNodes[1]` (undefined) and mounting threw
 * "Cannot read properties of undefined (reading 'firstChild')".
 * https://github.com/dashersw/gea/issues/92
 */
test('JSX comments inside a fragment do not break sibling bindings', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-fragment-jsx-comments`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const module = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        export class FooButton extends Component {
          template({ children, class: cls, ...props }) {
            return (
              <>
                {/*  */}

                <button class={\`foo-button \${cls ?? ""}\`} {...props}>
                  {children}
                </button>
              </>
            )
          }
        }

        export class Toolbar extends Component {
          label = 'Save'

          template() {
            return (
              <>
                <span class="before">{this.label}</span>
                {/* between siblings */}
                <FooButton class="primary">{this.label}</FooButton>
                {/* trailing */}
              </>
            )
          }
        }
      `,
      '/virtual/fragment-jsx-comments.tsx',
      ['FooButton', 'Toolbar'],
      { Component },
    )

    const Toolbar = module.Toolbar as any
    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Toolbar()
    view.render(root)
    await flushMicrotasks()

    const button = root.querySelector('button')
    assert.ok(button, 'button renders')
    assert.equal(button.className, 'foo-button primary')
    assert.equal(button.textContent?.trim(), 'Save')
    assert.equal(root.querySelector('.before')?.textContent, 'Save')

    view.label = 'Saved'
    await flushMicrotasks()
    assert.equal(root.querySelector('.before')?.textContent, 'Saved')
    assert.equal(root.querySelector('button')?.textContent?.trim(), 'Saved')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
