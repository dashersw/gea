/**
 * Regression: text node with mixed state+prop deps must generate a stateOnly binding
 * so the state observer reads this.props.X live instead of inheriting `value` from
 * the prop binding's patch body (where `value` is the incoming prop value).
 *
 * Reproduces the Select placeholder bug: `{this.valueAsString || props.placeholder || 'Select...'}`
 * showed 'Select...' after the Zag machine started (setting valueAsString="") because the state
 * observer for valueAsString received value="" and the compiled patch body substituted that for
 * props.placeholder. Initial HTML rendered correctly; the bug fired on the post-render state flush.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

const SOURCE = `
  import { Component } from '@geajs/core'

  export default class SelectLike extends Component {
    declare valueAsString: string

    onAfterRender(): void {
      this.valueAsString = ''
    }

    template(props: any) {
      return (
        <div>
          <span class="display">
            {this.valueAsString || props.placeholder || 'Select...'}
          </span>
        </div>
      )
    }
  }
`

describe('text mixed state+prop regression', () => {
  it('prop fallback shown on initial render when state is empty', async () => {
    const restoreDom = installDom()
    try {
      const seed = `text-state-prop-${Date.now()}`
      const [{ default: Component }] = await loadRuntimeModules(seed)
      const SelectLike = await compileJsxComponent(SOURCE, '/virtual/SelectLike.jsx', 'SelectLike', { Component })

      const root = document.createElement('div')
      document.body.appendChild(root)

      const comp = new SelectLike({ placeholder: 'Pick one...' })
      comp.render(root)
      await flushMicrotasks()

      assert.equal(
        comp.el.querySelector('.display')?.textContent?.trim(),
        'Pick one...',
        'placeholder must be shown when valueAsString is empty',
      )

      comp.valueAsString = 'Option A'
      await flushMicrotasks()
      assert.equal(comp.el.querySelector('.display')?.textContent?.trim(), 'Option A', 'selected value must appear')

      comp.valueAsString = ''
      await flushMicrotasks()
      assert.equal(
        comp.el.querySelector('.display')?.textContent?.trim(),
        'Pick one...',
        'placeholder must return when state is cleared',
      )

      comp.dispose()
    } finally {
      restoreDom()
    }
  })

  it('prop change updates text using current state value', async () => {
    const restoreDom = installDom()
    try {
      const seed = `text-state-prop-propchange-${Date.now()}`
      const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
      const store = new Store({ placeholder: 'First...' })

      const SelectLike = await compileJsxComponent(SOURCE, '/virtual/SelectLike.jsx', 'SelectLike', { Component })

      const Parent = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'
        import store from './store'
        import SelectLike from './SelectLike'
        export default class Parent extends Component {
          template() {
            return <SelectLike placeholder={store.placeholder} />
          }
        }
      `,
        '/virtual/Parent.jsx',
        'Parent',
        { Component, store, SelectLike },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)

      const parent = new Parent()
      parent.render(root)
      await flushMicrotasks()

      assert.equal(parent.el.querySelector('.display')?.textContent?.trim(), 'First...')

      store.placeholder = 'Second...'
      await flushMicrotasks()
      assert.equal(
        parent.el.querySelector('.display')?.textContent?.trim(),
        'Second...',
        'prop change must update text when state is empty',
      )

      parent.dispose()
    } finally {
      restoreDom()
    }
  })
})
