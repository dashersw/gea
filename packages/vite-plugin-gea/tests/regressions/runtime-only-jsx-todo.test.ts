import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'

function fillInput(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function pressEnter(el: HTMLElement) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

function addTodo(root: HTMLElement, text: string) {
  const input = root.querySelector('.todo-input') as HTMLInputElement
  fillInput(input, text)
  ;(root.querySelector('.add-btn') as HTMLButtonElement).click()
}

describe('runtime-only-jsx todo app (JSX templates)', { concurrency: false }, () => {
  let restoreDom: () => void
  let root: HTMLElement
  let app: any
  let store: any

  beforeEach(async () => {
    restoreDom = installDom()

    const seed = `runtime-only-jsx-${Date.now()}-${Math.random()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    resetDelegation()

    const TodoStore = await compileStore(`
      import { Store } from '@geajs/core'
      let nextId = 1
      export class TodoStore extends Store {
        todos = []
        filter = 'all'
        draft = ''
        add() {
          const t = this.draft.trim()
          if (!t) return
          this.draft = ''
          this.todos.push({ id: nextId++, text: t, done: false })
        }
        toggle(id) {
          const todo = this.todos.find(t => t.id == id)
          todo.done = !todo.done
        }
        remove(id) {
          this.todos = this.todos.filter(t => t.id != id)
        }
        setFilter(filter) {
          this.filter = filter
        }
        get filteredTodos() {
          if (this.filter === 'active') return this.todos.filter(t => !t.done)
          if (this.filter === 'completed') return this.todos.filter(t => t.done)
          return this.todos
        }
        get activeCount() {
          return this.todos.filter(t => !t.done).length
        }
      }
    `, '/virtual/todo-store.ts', 'TodoStore', { Store })

    store = new TodoStore()

    const TodoApp = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class TodoApp extends Component {
          template() {
            return (
              <div class="todo-app" id={this.id}>
                <h1>Todo</h1>
                <div class="input-row">
                  <input class="todo-input" type="text" placeholder="What needs to be done?" value={store.draft} input={(e) => { store.draft = e.target.value }} keydown={(e) => { if (e.key === 'Enter') store.add() }} />
                  <button class="add-btn" click={() => store.add()}>Add</button>
                </div>
                <ul class="todo-list">
                  {store.filteredTodos.map((todo) => (
                    <li key={todo.id} class={\`todo-item \${todo.done ? 'done' : ''}\`}>
                      <input type="checkbox" data-id={todo.id} checked={todo.done} change={() => store.toggle(todo.id)} />
                      <span class="todo-text">{todo.text}</span>
                      <button class="remove-btn" data-id={todo.id} click={() => store.remove(todo.id)}>
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
                <div class={\`footer \${store.todos.length === 0 ? 'hidden' : ''}\`}>
                  <span class="active-count">{store.activeCount} items left</span>
                  <div class="filters">
                    {['all', 'active', 'completed'].map((f) => (
                      <button key={f} class={\`filter-btn \${store.filter === f ? 'active' : ''}\`} data-filter={f} click={() => store.setFilter(f)}>
                        {f[0].toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          }

          /** HTML mirror of the list above — observers must assign a string to innerHTML; JSX nodes are not strings. */
          itemsHtml() {
            return store.filteredTodos
              .map((todo) => {
                const cls = 'todo-item' + (todo.done ? ' done' : '')
                const chk = todo.done ? 'checked' : ''
                return (
                  '<li class="' +
                  cls +
                  '"><input type="checkbox" data-id="' +
                  todo.id +
                  '" ' +
                  chk +
                  ' /><span class="todo-text">' +
                  todo.text +
                  '</span><button class="remove-btn" data-id="' +
                  todo.id +
                  '">&times;</button></li>'
                )
              })
              .join('')
          }

          createdHooks() {
            this[GEA_OBSERVER_REMOVERS].push(
              store.observe('todos', () => {
                this.$('.todo-list').innerHTML = this.itemsHtml()
                this.$('.active-count').textContent = \`\${store.activeCount} items left\`
                this.$('.footer').classList.toggle('hidden', store.todos.length === 0)
              }),
              store.observe('filter', () => {
                this.$('.todo-list').innerHTML = this.itemsHtml()
                this.$$('.filter-btn').forEach((btn) => {
                  btn.classList.toggle('active', btn.dataset.filter === store.filter)
                })
              }),
              store.observe('draft', () => {
                const input = this.$('.todo-input')
                if (store.draft === '' || document.activeElement !== input) {
                  input.value = store.draft
                }
              }),
            )
          }

          get events() {
            return {
              click: {
                '.add-btn': () => store.add(),
                'input[type="checkbox"]': (e) => store.toggle(e.target.dataset.id),
                '.remove-btn': (e) => store.remove(e.target.dataset.id),
                '.filter-btn': (e) => store.setFilter(e.target.dataset.filter),
              },
              input: {
                '.todo-input': (e) => (store.draft = e.target.value),
              },
              keydown: {
                '.todo-input': (e) => e.key === 'Enter' && store.add(),
              },
            }
          }
        }
      `,
      '/virtual/TodoApp.jsx',
      'TodoApp',
      { Component, store },
    )

    root = document.createElement('div')
    document.body.appendChild(root)
    app = new TodoApp()
    app.render(root)
    await flushMicrotasks()
  })

  afterEach(async () => {
    app.dispose()
    await flushMicrotasks()
    root.remove()
    restoreDom()
  })

  it('adding a todo via Add button', async () => {
    const input = root.querySelector('.todo-input') as HTMLInputElement
    fillInput(input, 'Walk dog')
    ;(root.querySelector('.add-btn') as HTMLButtonElement).click()
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Walk dog')
  })

  it('adding empty text is a no-op', async () => {
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)

    const input = root.querySelector('.todo-input') as HTMLInputElement
    fillInput(input, '   ')
    pressEnter(input)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)
  })

  it('toggling a todo marks it as done', async () => {
    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.todo-item.done').length, 1)
  })

  it('removing a todo', async () => {
    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    addTodo(root, 'Walk dog')
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 2)
    ;(root.querySelector('.remove-btn') as HTMLButtonElement).click()
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Walk dog')
  })

  it('active count updates correctly', async () => {
    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    assert.equal(root.querySelector('.active-count')!.textContent, '1 items left')

    addTodo(root, 'Walk dog')
    await flushMicrotasks()
    assert.equal(root.querySelector('.active-count')!.textContent, '2 items left')
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelector('.active-count')!.textContent, '1 items left')
  })

  it('footer is hidden when no todos exist', async () => {
    assert.ok(root.querySelector('.footer')!.classList.contains('hidden'))

    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    assert.ok(!root.querySelector('.footer')!.classList.contains('hidden'))
    ;(root.querySelector('.remove-btn') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.ok(root.querySelector('.footer')!.classList.contains('hidden'))
  })

  it('filter: Active hides completed items', async () => {
    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    addTodo(root, 'Walk dog')
    await flushMicrotasks()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flushMicrotasks()
    ;(root.querySelector('.filter-btn[data-filter="active"]') as HTMLButtonElement).click()
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Walk dog')
    assert.equal(root.querySelector('.filter-btn.active')!.textContent, 'Active')
  })

  it('filter: Completed shows only completed items', async () => {
    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    addTodo(root, 'Walk dog')
    await flushMicrotasks()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flushMicrotasks()
    ;(root.querySelector('.filter-btn[data-filter="completed"]') as HTMLButtonElement).click()
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Buy milk')
  })

  it('filter: switching back to All restores full list', async () => {
    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    addTodo(root, 'Walk dog')
    await flushMicrotasks()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flushMicrotasks()
    ;(root.querySelector('.filter-btn[data-filter="active"]') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    ;(root.querySelector('.filter-btn[data-filter="all"]') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 2)
  })

  it('input clears after adding a todo', async () => {
    const input = root.querySelector('.todo-input') as HTMLInputElement
    fillInput(input, 'Buy milk')
    ;(root.querySelector('.add-btn') as HTMLButtonElement).click()
    await flushMicrotasks()

    assert.equal(input.value, '')
  })
})
