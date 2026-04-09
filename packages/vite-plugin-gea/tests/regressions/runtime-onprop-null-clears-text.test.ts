import assert from 'node:assert/strict'
import { GEA_UPDATE_PROPS } from '@geajs/core'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

/**
 * Regression: tic-tac-toe cell text must clear when `value` becomes null after reset.
 * Derived `{value || ''}` must not be wrapped in a blanket nullish guard that skips updates.
 */
test('__onPropChange clears text when primitive prop becomes null (value || "")', async () => {
  const restoreDom = installDom()
  try {
    const seed = `onprop-null-text-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Cell = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Cell extends Component {
          template({ value }) {
            return (
              <button type="button" class="cell">
                {value || ''}
              </button>
            )
          }
        }
      `,
      '/virtual/NullTextCell.jsx',
      'Cell',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Cell()
    view.props = { value: 'X' as string | null }
    view.render(root)
    await flushMicrotasks()

    const btn = root.querySelector('button.cell')
    assert.equal(btn?.textContent, 'X')

    view[GEA_UPDATE_PROPS]({ value: null })
    await flushMicrotasks()

    assert.equal(btn?.textContent, '', 'textContent must clear when value is null')

    view[GEA_UPDATE_PROPS]({ value: 'O' })
    await flushMicrotasks()
    assert.equal(btn?.textContent, 'O')
  } finally {
    restoreDom()
  }
})
