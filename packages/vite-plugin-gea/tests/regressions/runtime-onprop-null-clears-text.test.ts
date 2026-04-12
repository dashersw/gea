import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

/**
 * Regression: tic-tac-toe cell text must clear when `value` becomes null after reset.
 * Derived `{value || ''}` must not be wrapped in a blanket nullish guard that skips updates.
 *
 * In v2, props are reactive thunks set via `__setProps`. We use a mutable holder
 * so the thunk re-evaluates when the value changes, then trigger a flush.
 */
test('prop thunks clear text when primitive prop becomes null (value || "")', async () => {
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

    // In v2, props are set via __setProps with thunks (functions returning values).
    // We use a parent component to drive prop updates naturally.
    const Parent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Cell from './Cell.tsx'

        export default class Parent extends Component {
          cellValue = 'X'

          template() {
            return (
              <div>
                <Cell value={this.cellValue} />
              </div>
            )
          }
        }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Cell },
    )

    const parent = new Parent()
    parent.render(root)
    await flushMicrotasks()

    const btn = root.querySelector('button.cell')
    assert.equal(btn?.textContent, 'X')

    parent.cellValue = null
    await flushMicrotasks()

    assert.equal(btn?.textContent, '', 'textContent must clear when value is null')

    parent.cellValue = 'O'
    await flushMicrotasks()
    assert.equal(btn?.textContent, 'O')
  } finally {
    restoreDom()
  }
})
