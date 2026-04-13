import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('conditional branches swap rendered elements when state flips', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-branches`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ConditionalBranchComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ConditionalBranchComponent extends Component {
          expanded = false

          template() {
            return (
              <section class="card">
                {this.expanded ? (
                  <p class="details">Details</p>
                ) : (
                  <button class="summary">Open</button>
                )}
              </section>
            )
          }
        }
      `,
      '/virtual/ConditionalBranchComponent.jsx',
      'ConditionalBranchComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ConditionalBranchComponent()
    component.render(root)

    assert.equal(component.el.querySelector('.summary')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)

    component.expanded = true
    await flushMicrotasks()
    assert.equal(component.el.querySelector('.details')?.textContent?.trim(), 'Details')
    assert.equal(component.el.querySelector('.summary'), null)

    component.expanded = false
    await flushMicrotasks()
    assert.equal(component.el.querySelector('.summary')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional branches preserve surrounding siblings across repeated flips', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-sibling-stability`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SiblingStableConditional = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SiblingStableConditional extends Component {
          open = false

          template() {
            return (
              <section class="panel">
                <header class="title">Title</header>
                {this.open ? (
                  <div class="details">
                    <span class="details-copy">Details</span>
                  </div>
                ) : (
                  <button class="trigger">Open</button>
                )}
                <footer class="footer">Footer</footer>
              </section>
            )
          }
        }
      `,
      '/virtual/SiblingStableConditional.jsx',
      'SiblingStableConditional',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new SiblingStableConditional()
    component.render(root)

    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'trigger', 'footer'],
    )

    component.open = true
    await flushMicrotasks()
    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'details', 'footer'],
    )

    component.open = false
    await flushMicrotasks()
    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'trigger', 'footer'],
    )

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional slots keep tracking skipped store reads after a delayed branch opens', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-delayed-deps`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const details = new Store({ status: 'pending' }) as { status: string }

    const DelayedCondition = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import details from './details'

        export default class DelayedCondition extends Component {
          gate = ''

          template() {
            return (
              <section>
                {this.gate.length >= 3 && details.status === 'ok' ? (
                  <p class="ready">Ready</p>
                ) : (
                  <p class="waiting">Waiting</p>
                )}
              </section>
            )
          }
        }
      `,
      '/virtual/DelayedCondition.jsx',
      'DelayedCondition',
      { Component, details },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new DelayedCondition()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.waiting'), 'initially waiting')

    view.gate = 'a'
    await flushMicrotasks()
    view.gate = 'ab'
    await flushMicrotasks()
    view.gate = 'abc'
    await flushMicrotasks()
    details.status = 'ok'
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.ready'), 'branch should update when the skipped store read changes')
    assert.equal(view.el.querySelector('.waiting'), null)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional branches do not leave stale transitioning nodes behind', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-stale-node-cleanup`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TransitionBranchComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TransitionBranchComponent extends Component {
          showToast = false

          template() {
            return (
              <div class="shell">
                {this.showToast ? (
                  <div class="toast" style="opacity: 1; transition: opacity 120ms ease;">Saved</div>
                ) : (
                  <span class="idle">Idle</span>
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/TransitionBranchComponent.jsx',
      'TransitionBranchComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new TransitionBranchComponent()
    component.render(root)

    assert.equal(component.el.querySelectorAll('.toast').length, 0)
    assert.equal(component.el.querySelectorAll('.idle').length, 1)

    component.showToast = true
    await flushMicrotasks()
    assert.equal(component.el.querySelectorAll('.toast').length, 1)
    assert.equal(component.el.querySelectorAll('.idle').length, 0)

    component.showToast = false
    await flushMicrotasks()
    assert.equal(component.el.querySelectorAll('.toast').length, 0)
    assert.equal(component.el.querySelectorAll('.idle').length, 1)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional slot with early-return guard does not crash constructor when store value is null', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-early-return-cond`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const dataStore = new Store({
      item: null as { description: string } | null,
    }) as { item: { description: string } | null }

    const DetailView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import dataStore from './data-store'

        export default class DetailView extends Component {
          isEditing = false

          template() {
            const { item } = dataStore

            if (!item) return <div class="loader">Loading</div>

            const desc = item.description || ''

            return (
              <div class="detail">
                {this.isEditing && <textarea value={desc} />}
                {!this.isEditing && desc && <p class="desc">{desc}</p>}
                {!this.isEditing && !desc && <p class="placeholder">Add description</p>}
              </div>
            )
          }
        }
      `,
      '/virtual/DetailView.jsx',
      'DetailView',
      { Component, dataStore },
    )

    assert.doesNotThrow(
      () => new DetailView(),
      'constructing a component with null store data and an early-return guard must not throw',
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new DetailView()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.textContent?.includes('Loading'), 'should show loader when item is null')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
