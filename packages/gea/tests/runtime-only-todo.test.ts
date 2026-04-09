import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { GEA_OBSERVER_REMOVERS } from '../src/lib/symbols'

async function loadModules() {
  const seed = `runtime-only-${Date.now()}-${Math.random()}`
  const { default: ComponentManager } = await import('../src/lib/base/component-manager')
  ComponentManager.instance = undefined
  const [compMod, storeMod] = await Promise.all([
    import(`../src/lib/base/component.tsx?${seed}`),
    import(`../src/lib/store?${seed}`),
  ])
  return {
    Component: compMod.default as typeof import('../src/lib/base/component').default,
    Store: storeMod.Store as typeof import('../src/lib/store').Store,
  }
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
  let Component: Awaited<ReturnType<typeof loadModules>>['Component']
  let Store: Awaited<ReturnType<typeof loadModules>>['Store']
  let root: HTMLElement
  let app: InstanceType<typeof Component>
  let store: any

  beforeEach(async () => {
    restoreDom = installDom()
    const mods = await loadModules()
    Component = mods.Component
    Store = mods.Store

    let nextId = 1

    class TodoStore extends Store {
      todos: any[] = []
      filter = 'all'
      draft = ''

      add() {
        const t = this.draft.trim()
        if (!t) return
        this.draft = ''
        this.todos.push({ id: nextId++, text: t, done: false })
      }

      toggle(id: number) {
        const todo = this.todos.find((t: any) => t.id == id)
        todo.done = !todo.done
      }

      remove(id: number) {
        this.todos = this.todos.filter((t: any) => t.id != id)
      }

      setFilter(filter: string) {
        this.filter = filter
      }

      get filteredTodos() {
        if (this.filter === 'active') return this.todos.filter((t: any) => !t.done)
        if (this.filter === 'completed') return this.todos.filter((t: any) => t.done)
        return this.todos
      }

      get activeCount() {
        return this.todos.filter((t: any) => !t.done).length
      }
    }

    store = new TodoStore()

    class TodoApp extends Component {
      template() {
        return `
          <div class="todo-app" id="${this.id}">
            <h1>Todo</h1>
            <div class="input-row">
              <input class="todo-input" type="text" placeholder="What needs to be done?" value="${store.draft}" />
              <button class="add-btn">Add</button>
            </div>
            <ul class="todo-list">${renderItems()}</ul>
            <div class="footer ${store.todos.length === 0 ? 'hidden' : ''}">
              <span class="active-count">${store.activeCount} items left</span>
              <div class="filters">
                ${['all', 'active', 'completed']
                  .map(
                    (f) =>
                      `<button class="filter-btn ${store.filter === f ? 'active' : ''}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        `
      }

      createdHooks() {
        this[GEA_OBSERVER_REMOVERS].push(
          store.observe('todos', () => {
            this.$('.todo-list').innerHTML = renderItems()
            this.$('.active-count').textContent = `${store.activeCount} items left`
            this.$('.footer').classList.toggle('hidden', store.todos.length === 0)
          }),
          store.observe('filter', () => {
            this.$('.todo-list').innerHTML = renderItems()
            this.$$('.filter-btn').forEach((btn: any) => {
              btn.classList.toggle('active', btn.dataset.filter === store.filter)
            })
          }),
          store.observe('draft', () => {
            const input = this.$('.todo-input') as HTMLInputElement
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
            'input[type="checkbox"]': (e: any) => store.toggle(e.target.dataset.id),
            '.remove-btn': (e: any) => store.remove(e.target.dataset.id),
            '.filter-btn': (e: any) => store.setFilter(e.target.dataset.filter),
          },
          input: {
            '.todo-input': (e: any) => (store.draft = e.target.value),
          },
          keydown: {
            '.todo-input': (e: any) => e.key === 'Enter' && store.add(),
          },
        }
      }
    }

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
