import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { GEA_SET_PROPS } from '../../../gea/src/compiler-runtime'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'
import { countTemplateCreates } from './runtime-conditional-slots-helpers'

test('store-controlled conditional slot patches without full rerender; branch-only store keys skip rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-slot-store`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const formStore = new Store({
      activeColumnId: null as string | null,
      draftTitle: '',
    }) as {
      activeColumnId: string | null
      draftTitle: string
    }

    const KanbanColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import formStore from './form-store'

        export default class KanbanColumn extends Component {
          template({ column }) {
            const isAdding = formStore.activeColumnId === column.id
            return (
              <div class="col">
                <div class="header">{column.title}</div>
                {isAdding ? (
                  <div class="add-form">
                    <input type="text" value={formStore.draftTitle} />
                  </div>
                ) : (
                  <button class="add-btn">Add task</button>
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/KanbanColumn.jsx',
      'KanbanColumn',
      { Component, formStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new KanbanColumn()
    view[GEA_SET_PROPS]({ column: () => ({ id: 'col-1', title: 'Backlog' }) })
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.add-btn'), 'initially shows add button')
    assert.ok(!view.el.querySelector('.add-form'), 'initially no add form')

    const templateCreates = countTemplateCreates(view)

    formStore.activeColumnId = 'col-1'
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.add-form'), 'add form should appear after store change')
    assert.ok(!view.el.querySelector('.add-btn'), 'add button should be gone')
    assert.equal(templateCreates(), 0, 'toggling conditional slot via store should NOT trigger full rerender')

    formStore.draftTitle = 'New task'
    await flushMicrotasks()
    assert.equal(templateCreates(), 0, 'changing draftTitle should NOT trigger full rerender')
    assert.equal((view.el.querySelector('input') as HTMLInputElement).value, 'New task')

    formStore.activeColumnId = null
    await flushMicrotasks()
    assert.ok(view.el.querySelector('.add-btn'), 'add button should reappear')
    assert.ok(!view.el.querySelector('.add-form'), 'add form should be gone')
    assert.equal(templateCreates(), 0, 'toggling slot back should NOT trigger full rerender')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('local state attribute bindings and conditional svg slot patch without full rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `local-state-attrs-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const CopyButton = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CopyButton extends Component {
          copied = false

          doCopy() {
            this.copied = true
          }

          resetCopy() {
            this.copied = false
          }

          template() {
            const copied = this.copied
            return (
              <div class="wrapper">
                <button
                  class={\`copy-btn\${copied ? ' copied' : ''}\`}
                  title={copied ? 'Copied!' : 'Copy'}
                  click={() => this.doCopy()}
                >
                  <svg viewBox="0 0 24 24">
                    {copied ? (
                      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="green" />
                    ) : (
                      <path d="M16 1H6v12h2V3h8zm3 4H10v14h9V5z" fill="gray" />
                    )}
                  </svg>
                </button>
              </div>
            )
          }
        }
      `,
      '/virtual/CopyButton.jsx',
      'CopyButton',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new CopyButton()
    view.render(root)
    await flushMicrotasks()

    const templateCreates = countTemplateCreates(view)
    const btn = root.querySelector('button') as HTMLElement
    assert.ok(btn, 'button exists')
    assert.equal(btn.className, 'copy-btn', 'initial class has no "copied"')
    assert.equal(btn.getAttribute('title'), 'Copy', 'initial title is "Copy"')

    const svgPath = root.querySelector('svg path') as SVGPathElement
    assert.ok(svgPath, 'svg path exists')
    assert.equal(svgPath.namespaceURI, 'http://www.w3.org/2000/svg')
    assert.equal(svgPath.getAttribute('fill'), 'gray', 'initial icon is gray')

    const btnRef = btn
    const wrapperRef = root.querySelector('.wrapper') as HTMLElement

    view.doCopy()
    await flushMicrotasks()

    assert.equal(templateCreates(), 0, 'no full rerender after state change')
    assert.equal(btn.className, 'copy-btn copied', 'class updated to include "copied"')
    assert.equal(btn.getAttribute('title'), 'Copied!', 'title updated to "Copied!"')

    const svgPathAfter = root.querySelector('svg path') as SVGPathElement
    assert.ok(svgPathAfter, 'svg path still exists after state change')
    assert.equal(svgPathAfter.namespaceURI, 'http://www.w3.org/2000/svg')
    assert.equal(svgPathAfter.getAttribute('fill'), 'green', 'icon switched to green checkmark')

    assert.equal(root.querySelector('button'), btnRef, 'button DOM node preserved')
    assert.equal(root.querySelector('.wrapper'), wrapperRef, 'wrapper DOM node preserved')

    view.resetCopy()
    await flushMicrotasks()

    assert.equal(templateCreates(), 0, 'no full rerender after resetting state')
    assert.equal(btn.className, 'copy-btn', 'class back to no "copied"')
    assert.equal(btn.getAttribute('title'), 'Copy', 'title back to "Copy"')

    const svgPathReset = root.querySelector('svg path') as SVGPathElement
    assert.equal(svgPathReset.namespaceURI, 'http://www.w3.org/2000/svg')
    assert.equal(svgPathReset.getAttribute('fill'), 'gray', 'icon back to gray')
    assert.equal(root.querySelector('button'), btnRef, 'button still same DOM node')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
