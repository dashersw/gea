import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { flushMicrotasks, installDom } from '../../../tests/helpers/jsdom-setup'

async function loadRuntimeOnly() {
  const seed = `runtime-only-todo-${Date.now()}-${Math.random()}`
  return import(`../src/runtime-only-browser?${seed}`)
}

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

describe('runtime-only todo app (string templates)', { concurrency: false }, () => {
  let restoreDom: () => void
  let root: HTMLElement
  let app: any

  beforeEach(async () => {
    restoreDom = installDom()
    const gea = await loadRuntimeOnly()
    let nextId = 1

    class TodoStore extends gea.Store {
      todos: any[] = []
      filter = 'all'
      draft = ''

      add() {
        const text = this.draft.trim()
        if (!text) return
        this.draft = ''
        this.todos.push({ id: nextId++, text, done: false })
      }

      toggle(id: number) {
        const todo = this.todos.find((item: any) => item.id == id)
        if (todo) todo.done = !todo.done
      }

      remove(id: number) {
        this.todos = this.todos.filter((item: any) => item.id != id)
      }

      setFilter(filter: string) {
        this.filter = filter
      }

      get filteredTodos() {
        if (this.filter === 'active') return this.todos.filter((item: any) => !item.done)
        if (this.filter === 'completed') return this.todos.filter((item: any) => item.done)
        return this.todos
      }

      get activeCount() {
        return this.todos.filter((item: any) => !item.done).length
      }
    }

    const store = new TodoStore()

    function renderItems() {
      return store.filteredTodos
        .map(
          (todo: any) => `
            <li class="todo-item ${todo.done ? 'done' : ''}">
              <input type="checkbox" data-id="${todo.id}" ${todo.done ? 'checked' : ''} />
              <span class="todo-text">${todo.text}</span>
              <button class="remove-btn" data-id="${todo.id}">&times;</button>
            </li>
          `,
        )
        .join('')
    }

    class TodoApp extends gea.Component {
      template() {
        return `
          <div class="todo-app">
            <div class="input-row">
              <input class="todo-input" type="text" value="${store.draft}" />
              <button class="add-btn" type="button">Add</button>
            </div>
            <ul class="todo-list">${renderItems()}</ul>
            <div class="footer ${store.todos.length === 0 ? 'hidden' : ''}">
              <span class="active-count">${store.activeCount} items left</span>
              <button class="filter-btn ${store.filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
              <button class="filter-btn ${store.filter === 'active' ? 'active' : ''}" data-filter="active">Active</button>
              <button class="filter-btn ${store.filter === 'completed' ? 'active' : ''}" data-filter="completed">Completed</button>
            </div>
          </div>
        `
      }

      createdHooks() {
        this[gea.GEA_OBSERVER_REMOVERS].push(
          store.observe('todos', () => {
            this.$('.todo-list')!.innerHTML = renderItems()
            this.$('.active-count')!.textContent = `${store.activeCount} items left`
            this.$('.footer')!.classList.toggle('hidden', store.todos.length === 0)
          }),
          store.observe('filter', () => {
            this.$('.todo-list')!.innerHTML = renderItems()
            this.$$('.filter-btn').forEach((btn: HTMLElement) => {
              btn.classList.toggle('active', btn.dataset.filter === store.filter)
            })
          }),
          store.observe('draft', () => {
            const input = this.$('.todo-input') as HTMLInputElement
            if (store.draft === '' || document.activeElement !== input) input.value = store.draft
          }),
        )
      }

      get events() {
        return {
          click: {
            '.add-btn': () => store.add(),
            'input[type="checkbox"]': (event: any) => store.toggle(event.target.dataset.id),
            '.remove-btn': (event: any) => store.remove(event.target.dataset.id),
            '.filter-btn': (event: any) => store.setFilter(event.target.dataset.filter),
          },
          input: {
            '.todo-input': (event: any) => {
              store.draft = event.target.value
            },
          },
          keydown: {
            '.todo-input': (event: KeyboardEvent) => {
              if (event.key === 'Enter') store.add()
            },
          },
        }
      }
    }

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

  it('adding a todo via Add button clears the input and updates the active count', async () => {
    const input = root.querySelector('.todo-input') as HTMLInputElement
    fillInput(input, 'Walk dog')
    ;(root.querySelector('.add-btn') as HTMLButtonElement).click()
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Walk dog')
    assert.equal(root.querySelector('.active-count')!.textContent, '1 items left')
    assert.equal(input.value, '')
  })

  it('adding empty text is a no-op', async () => {
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)

    fillInput(root.querySelector('.todo-input') as HTMLInputElement, '   ')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)
  })

  it('toggle, remove, and footer visibility update through runtime-only observers', async () => {
    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    addTodo(root, 'Walk dog')
    await flushMicrotasks()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item.done').length, 1)
    assert.equal(root.querySelector('.active-count')!.textContent, '1 items left')
    ;(root.querySelector('.remove-btn') as HTMLButtonElement).click()
    await flushMicrotasks()
    ;(root.querySelector('.remove-btn') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)
    assert.ok(root.querySelector('.footer')!.classList.contains('hidden'))
  })

  it('filters active/completed/all without losing event delegation on rerendered rows', async () => {
    addTodo(root, 'Buy milk')
    await flushMicrotasks()
    addTodo(root, 'Walk dog')
    await flushMicrotasks()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flushMicrotasks()
    ;(root.querySelector('.filter-btn[data-filter="active"]') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.deepEqual(
      Array.from(root.querySelectorAll('.todo-text')).map((node) => node.textContent),
      ['Walk dog'],
    )
    ;(root.querySelector('.filter-btn[data-filter="completed"]') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.deepEqual(
      Array.from(root.querySelectorAll('.todo-text')).map((node) => node.textContent),
      ['Buy milk'],
    )
    ;(root.querySelector('.filter-btn[data-filter="all"]') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 2)
  })
})
