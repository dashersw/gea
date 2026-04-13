import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

describe('ported events and forms regressions', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('delegated direct method, React-style, pointer, and transition events fire', async () => {
    const seed = `events-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const EventProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class EventProbe extends Component {
          hits = ''

          add(part) {
            this.hits = this.hits + part
          }

          template() {
            return (
              <button
                class="target"
                click={this.add.bind(this, 'c')}
                onMouseOver={() => this.add('m')}
                pointerdown={() => this.add('p')}
                onTransitionEnd={() => this.add('t')}
              >
                {this.hits}
              </button>
            )
          }
        }
      `,
      '/virtual/EventProbe.tsx',
      'EventProbe',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new EventProbe()
    view.render(root)
    await flushMicrotasks()

    const button = root.querySelector('button') as HTMLButtonElement
    button.click()
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    button.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(button.textContent, 'cmpt')

    view.dispose()
    await flushMicrotasks()
  })

  it('mapped checkbox handlers resolve the live item and patch the row class', async () => {
    const seed = `events-map-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      todos: [
        { id: 'a', text: 'Alpha', done: false },
        { id: 'b', text: 'Beta', done: false },
      ],
    }) as { todos: Array<{ id: string; text: string; done: boolean }> }

    const TodoProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class TodoProbe extends Component {
          setDone(id, checked) {
            const todo = store.todos.find((candidate) => candidate.id === id)
            if (todo) todo.done = checked
          }

          template() {
            return (
              <ul class="todos">
                {store.todos.map(todo => (
                  <li key={todo.id} class={todo.done ? 'todo done' : 'todo'} data-id={todo.id}>
                    <input class="check" type="checkbox" checked={todo.done} change={(e) => this.setDone(todo.id, e.target.checked)} />
                    <span>{todo.text}</span>
                  </li>
                ))}
              </ul>
            )
          }
        }
      `,
      '/virtual/TodoProbe.tsx',
      'TodoProbe',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new TodoProbe()
    view.render(root)
    await flushMicrotasks()

    const rowA = root.querySelector('[data-id="a"]') as HTMLLIElement
    const rowB = root.querySelector('[data-id="b"]') as HTMLLIElement
    const checkboxB = rowB.querySelector('input') as HTMLInputElement
    checkboxB.checked = true
    checkboxB.dispatchEvent(new Event('change', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(store.todos[1].done, true)
    assert.equal(root.querySelector('[data-id="a"]'), rowA)
    assert.equal(root.querySelector('[data-id="b"]'), rowB)
    assert.equal(rowA.className, 'todo')
    assert.equal(rowB.className, 'todo done')

    view.dispose()
    await flushMicrotasks()
  })

  it('inline event handlers can read template-local validation state while preserving form focus', async () => {
    const seed = `events-form-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const FormProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class FormProbe extends Component {
          value = ''
          submitted = ''

          template() {
            const valid = this.value.trim().length >= 3
            return (
              <form class="form">
                <input class="field" value={this.value} input={(e) => this.value = e.target.value} />
                {!valid && <span class="error">Too short</span>}
                <button type="button" class="submit" click={() => { if (valid) this.submitted = this.value }}>Save</button>
                <output class="out">{this.submitted}</output>
              </form>
            )
          }
        }
      `,
      '/virtual/FormProbe.tsx',
      'FormProbe',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new FormProbe()
    view.render(root)
    await flushMicrotasks()

    const input = root.querySelector('.field') as HTMLInputElement
    input.focus()
    input.value = 'ab'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    ;(root.querySelector('.submit') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelector('.out')?.textContent, '')
    assert.equal(document.activeElement, input)

    input.value = 'abcd'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushMicrotasks()
    ;(root.querySelector('.submit') as HTMLButtonElement).click()
    await flushMicrotasks()

    assert.equal(root.querySelector('.error'), null)
    assert.equal(root.querySelector('.out')?.textContent, 'abcd')
    assert.equal(document.activeElement, input)

    view.dispose()
    await flushMicrotasks()
  })
})
