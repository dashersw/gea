import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'
import { countTemplateCreates } from './runtime-conditional-slots-helpers'

test('ported runtime bindings: text, class, boolean attrs, style, and value patch in place', async () => {
  const restoreDom = installDom()

  try {
    const seed = `bindings-ported-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      label: 'Alpha',
      active: false,
      disabled: false,
      color: 'red',
      name: 'Ada',
    }) as {
      label: string
      active: boolean
      disabled: boolean
      color: string
      name: string
    }

    const BindingProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class BindingProbe extends Component {
          template() {
            return (
              <section class={store.active ? 'card active' : 'card'} style={{ color: store.color }}>
                <span class="label">{store.label}</span>
                <button class="action" disabled={store.disabled}>Go</button>
                <input class="name" value={store.name} input={(e) => store.name = e.target.value} />
              </section>
            )
          }
        }
      `,
      '/virtual/BindingProbe.tsx',
      'BindingProbe',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new BindingProbe()
    view.render(root)
    await flushMicrotasks()

    const creates = countTemplateCreates(view)
    const section = root.querySelector('section') as HTMLElement
    const label = root.querySelector('.label') as HTMLElement
    const button = root.querySelector('.action') as HTMLButtonElement
    const input = root.querySelector('.name') as HTMLInputElement

    assert.equal(label.textContent, 'Alpha')
    assert.equal(section.className, 'card')
    assert.equal(section.style.color, 'red')
    assert.equal(button.hasAttribute('disabled'), false)
    assert.equal(input.value, 'Ada')

    store.label = 'Beta'
    store.active = true
    store.disabled = true
    store.color = 'blue'
    store.name = 'Grace'
    await flushMicrotasks()

    assert.equal(root.querySelector('section'), section, 'root element should be patched, not rebuilt')
    assert.equal(root.querySelector('.label'), label, 'text binding node should be stable')
    assert.equal(root.querySelector('.action'), button, 'button should be stable')
    assert.equal(root.querySelector('.name'), input, 'input should be stable')
    assert.equal(label.textContent, 'Beta')
    assert.equal(section.className, 'card active')
    assert.equal(section.style.color, 'blue')
    assert.equal(button.hasAttribute('disabled'), true)
    assert.equal(input.value, 'Grace')
    assert.equal(creates(), 0, 'binding updates should not invoke the template builder again')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('ported runtime bindings: mapped row property changes patch attributes without replacing rows', async () => {
  const restoreDom = installDom()

  try {
    const seed = `bindings-map-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      rows: [
        { id: 'a', label: 'Alpha', done: false },
        { id: 'b', label: 'Beta', done: true },
      ],
    }) as {
      rows: Array<{ id: string; label: string; done: boolean }>
    }

    const RowList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class RowList extends Component {
          template() {
            return (
              <ul class="rows">
                {store.rows.map(row => (
                  <li key={row.id} class={row.done ? 'row done' : 'row'} data-state={row.done ? 'done' : 'todo'}>
                    {row.label}
                  </li>
                ))}
              </ul>
            )
          }
        }
      `,
      '/virtual/RowList.tsx',
      'RowList',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new RowList()
    view.render(root)
    await flushMicrotasks()

    const rowsBefore = Array.from(root.querySelectorAll('li'))
    assert.deepEqual(
      rowsBefore.map((row) => row.textContent),
      ['Alpha', 'Beta'],
    )
    assert.equal(rowsBefore[0].className, 'row')

    store.rows[0].done = true
    store.rows[0].label = 'Alpha!'
    await flushMicrotasks()

    const rowsAfter = Array.from(root.querySelectorAll('li'))
    assert.equal(rowsAfter[0], rowsBefore[0], 'dirty row should be patched in place')
    assert.equal(rowsAfter[1], rowsBefore[1], 'untouched sibling should stay mounted')
    assert.equal(rowsAfter[0].className, 'row done')
    assert.equal(rowsAfter[0].getAttribute('data-state'), 'done')
    assert.equal(rowsAfter[0].textContent, 'Alpha!')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
