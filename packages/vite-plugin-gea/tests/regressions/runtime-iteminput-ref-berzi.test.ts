/**
 * Regression: berzi/gea-example ItemInput — `ref={this.itemTextarea}` on a typed field
 * (`HTMLTextAreaElement | null`) must be assigned before `trySubmitItem` runs (button click
 * or direct call). Mirrors `src/ItemInput/ItemInput.tsx` shape without CSS imports.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { GEA_DOM_COMPONENT } from '@geajs/core'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

const BERZI_ITEM_INPUT = `
import { Component } from '@geajs/core'

export default class ItemInput extends Component {
  itemTextarea: HTMLTextAreaElement | null = null

  template() {
    return (
      <section class="send-item-panel">
        <textarea
          ref={this.itemTextarea}
          class="send-item-textarea"
          placeholder="What's on your mind?"
          autofocus
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              e.preventDefault()
              this.trySubmitItem()
            }
          }}
        />

        <div class="actions">
          <button class="button-primary send-item-button" onclick={this.trySubmitItem}>
            Capture
          </button>
        </div>
      </section>
    )
  }

  trySubmitItem(): string {
    if (!this.itemTextarea) return 'ref-is-null'
    return 'ref-is-set'
  }
}
`

test('berzi ItemInput shape: textarea ref is set after render (typed field + onkeydown + onclick)', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-berzi-iteminput-ref`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ItemInput = await compileJsxComponent(BERZI_ITEM_INPUT, '/virtual/ItemInput.tsx', 'ItemInput', { Component })

    const root = document.createElement('div')
    document.body.appendChild(root)

    const itemInput = new ItemInput()
    itemInput.render(root)
    await flushMicrotasks()

    assert.ok(
      itemInput.itemTextarea,
      'itemTextarea must be assigned after render (querySelector data-gea-ref on component root)',
    )
    assert.equal(itemInput.itemTextarea?.tagName?.toLowerCase(), 'textarea')

    assert.equal(itemInput.trySubmitItem(), 'ref-is-set', 'direct trySubmitItem must see the textarea ref')

    const btn = root.querySelector('.send-item-button') as HTMLElement | null
    assert.ok(btn, 'submit button must exist')
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(itemInput.trySubmitItem(), 'ref-is-set', 'trySubmitItem after delegated click must still see the ref')

    itemInput.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

const APP_WITH_FRAGMENT = `
import { Component } from '@geajs/core'
import ItemInput from './ItemInput'

export default class App extends Component {
  template() {
    return (
      <>
        <div class="notification-stack" />
        <main class="app">
          <ItemInput />
        </main>
      </>
    )
  }
}
`

test('berzi App shape: ItemInput child under fragment + main still gets textarea ref', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-berzi-app-iteminput-ref`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ItemInput = await compileJsxComponent(BERZI_ITEM_INPUT, '/virtual/ItemInput.tsx', 'ItemInput', { Component })

    const App = await compileJsxComponent(APP_WITH_FRAGMENT, '/virtual/App.tsx', 'App', { Component, ItemInput })

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const panel = root.querySelector('.send-item-panel') as HTMLElement | null
    assert.ok(panel, 'ItemInput root section must be in the DOM')
    const itemInstance = (panel as HTMLElement & { [GEA_DOM_COMPONENT]?: unknown })[GEA_DOM_COMPONENT] as
      | { trySubmitItem?: () => string; itemTextarea?: HTMLTextAreaElement | null }
      | undefined
    assert.ok(itemInstance, 'section[GEA_DOM_COMPONENT] must be the ItemInput instance')
    assert.ok(itemInstance.itemTextarea, 'nested ItemInput must have textarea ref after render')

    assert.equal(itemInstance.trySubmitItem?.(), 'ref-is-set')

    const btn = root.querySelector('.send-item-button') as HTMLElement | null
    assert.ok(btn)
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(itemInstance.trySubmitItem?.(), 'ref-is-set')

    app.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
