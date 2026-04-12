import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { Store } from '../src/store/store'
import { signal } from '../src/signals/signal'
import { batch } from '../src/signals/batch'
import { effect } from '../src/signals/effect'
import { wrapSignalValue } from '../src/reactive/wrap-signal-value'
import { Component } from '../src/component/component'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const raf = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  const caf = (id: number) => clearTimeout(id)
  dom.window.requestAnimationFrame = raf
  dom.window.cancelAnimationFrame = caf

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: (globalThis as any).HTMLElement,
    Node: (globalThis as any).Node,
    NodeFilter: (globalThis as any).NodeFilter,
    MutationObserver: (globalThis as any).MutationObserver,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLUnknownElement: dom.window.HTMLUnknownElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
  })

  return () => {
    Object.assign(globalThis, prev)
    dom.window.close()
  }
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
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

// ---------------------------------------------------------------------------
// v2 compiled Store pattern: signals + getters/setters + batch for methods
// ---------------------------------------------------------------------------
class TodoStore extends Store {
  __todos = signal<any[]>([])
  get todos(): any[] { return wrapSignalValue(this.__todos) }
  set todos(v: any[]) { this.__todos.value = v }

  __filter = signal('all')
  get filter() { return this.__filter.value }
  set filter(v: string) { this.__filter.value = v }

  __draft = signal('')
  get draft() { return this.__draft.value }
  set draft(v: string) { this.__draft.value = v }

  _nextId = 1

  add() {
    return batch(() => {
      const t = this.draft.trim()
      if (!t) return
      this.draft = ''
      this.todos = [...this.todos, { id: this._nextId++, text: t, done: false }]
    })
  }

  toggle(id: number) {
    return batch(() => {
      this.todos = this.todos.map((t: any) =>
        t.id == id ? { ...t, done: !t.done } : t,
      )
    })
  }

  remove(id: number) {
    return batch(() => {
      this.todos = this.todos.filter((t: any) => t.id != id)
    })
  }

  setFilter(filter: string) {
    return batch(() => {
      this.filter = filter
    })
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

// ---------------------------------------------------------------------------
// Pure-DOM todo app wired with effects — no v1 Component lifecycle needed
// ---------------------------------------------------------------------------
function createTodoApp(store: TodoStore) {
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

  const el = document.createElement('div')
  el.className = 'todo-app'
  el.innerHTML = `
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
  `

  const $ = (sel: string) => el.querySelector(sel)!
  const $$ = (sel: string) => el.querySelectorAll(sel)

  // Wire effects (like v1 createdHooks + store.observe)
  const disposers: (() => void)[] = []

  disposers.push(
    effect(() => {
      void store.todos // track
      void store.filteredTodos // track
      $(`.todo-list`).innerHTML = renderItems()
      $(`.active-count`).textContent = `${store.activeCount} items left`
      $(`.footer`).classList.toggle('hidden', store.todos.length === 0)
    }),
  )

  disposers.push(
    effect(() => {
      void store.filter // track
      void store.filteredTodos // track
      $(`.todo-list`).innerHTML = renderItems()
      $$(`.filter-btn`).forEach((btn: any) => {
        btn.classList.toggle('active', btn.dataset.filter === store.filter)
      })
    }),
  )

  disposers.push(
    effect(() => {
      const d = store.draft // track
      const input = $(`.todo-input`) as HTMLInputElement
      if (d === '' || document.activeElement !== input) {
        input.value = d
      }
    }),
  )

  // Wire events (like v1 events getter)
  el.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement
    if (target.matches('.add-btn')) store.add()
    if (target.matches('input[type="checkbox"]')) store.toggle(Number((target as any).dataset.id))
    if (target.matches('.remove-btn')) store.remove(Number((target as any).dataset.id))
    if (target.matches('.filter-btn')) store.setFilter((target as any).dataset.filter)
  })

  el.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLElement
    if (target.matches('.todo-input')) store.draft = (target as HTMLInputElement).value
  })

  el.addEventListener('keydown', (e: Event) => {
    const target = e.target as HTMLElement
    if (target.matches('.todo-input') && (e as KeyboardEvent).key === 'Enter') store.add()
  })

  return {
    el,
    dispose() {
      for (const d of disposers) d()
    },
  }
}

describe('runtime-only todo app (string templates)', { concurrency: false }, () => {
  let restoreDom: () => void
  let root: HTMLElement
  let store: TodoStore
  let dispose: () => void

  beforeEach(async () => {
    restoreDom = installDom()

    store = new TodoStore()
    const app = createTodoApp(store)
    root = app.el
    dispose = app.dispose
    document.body.appendChild(root)
    await flush()
  })

  afterEach(async () => {
    dispose()
    await flush()
    root.remove()
    restoreDom()
  })

  it('adding a todo via Add button', async () => {
    const input = root.querySelector('.todo-input') as HTMLInputElement
    fillInput(input, 'Walk dog')
    ;(root.querySelector('.add-btn') as HTMLButtonElement).click()
    await flush()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Walk dog')
  })

  it('adding empty text is a no-op', async () => {
    pressEnter(root.querySelector('.todo-input')!)
    await flush()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)

    const input = root.querySelector('.todo-input') as HTMLInputElement
    fillInput(input, '   ')
    pressEnter(input)
    await flush()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)
  })

  it('toggling a todo marks it as done', async () => {
    addTodo(root, 'Buy milk')
    await flush()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flush()

    assert.equal(root.querySelectorAll('.todo-item.done').length, 1)
  })

  it('removing a todo', async () => {
    addTodo(root, 'Buy milk')
    await flush()
    addTodo(root, 'Walk dog')
    await flush()
    assert.equal(root.querySelectorAll('.todo-item').length, 2)
    ;(root.querySelector('.remove-btn') as HTMLButtonElement).click()
    await flush()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Walk dog')
  })

  it('active count updates correctly', async () => {
    addTodo(root, 'Buy milk')
    await flush()
    assert.equal(root.querySelector('.active-count')!.textContent, '1 items left')

    addTodo(root, 'Walk dog')
    await flush()
    assert.equal(root.querySelector('.active-count')!.textContent, '2 items left')
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flush()
    assert.equal(root.querySelector('.active-count')!.textContent, '1 items left')
  })

  it('footer is hidden when no todos exist', async () => {
    assert.ok(root.querySelector('.footer')!.classList.contains('hidden'))

    addTodo(root, 'Buy milk')
    await flush()
    assert.ok(!root.querySelector('.footer')!.classList.contains('hidden'))
    ;(root.querySelector('.remove-btn') as HTMLButtonElement).click()
    await flush()
    assert.ok(root.querySelector('.footer')!.classList.contains('hidden'))
  })

  it('filter: Active hides completed items', async () => {
    addTodo(root, 'Buy milk')
    await flush()
    addTodo(root, 'Walk dog')
    await flush()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flush()
    ;(root.querySelector('.filter-btn[data-filter="active"]') as HTMLButtonElement).click()
    await flush()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Walk dog')
    assert.equal(root.querySelector('.filter-btn.active')!.textContent, 'Active')
  })

  it('filter: Completed shows only completed items', async () => {
    addTodo(root, 'Buy milk')
    await flush()
    addTodo(root, 'Walk dog')
    await flush()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flush()
    ;(root.querySelector('.filter-btn[data-filter="completed"]') as HTMLButtonElement).click()
    await flush()

    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Buy milk')
  })

  it('filter: switching back to All restores full list', async () => {
    addTodo(root, 'Buy milk')
    await flush()
    addTodo(root, 'Walk dog')
    await flush()
    ;(root.querySelector('.todo-item input[type="checkbox"]') as HTMLInputElement).click()
    await flush()
    ;(root.querySelector('.filter-btn[data-filter="active"]') as HTMLButtonElement).click()
    await flush()
    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    ;(root.querySelector('.filter-btn[data-filter="all"]') as HTMLButtonElement).click()
    await flush()
    assert.equal(root.querySelectorAll('.todo-item').length, 2)
  })

  it('input clears after adding a todo', async () => {
    const input = root.querySelector('.todo-input') as HTMLInputElement
    fillInput(input, 'Buy milk')
    ;(root.querySelector('.add-btn') as HTMLButtonElement).click()
    await flush()

    assert.equal(input.value, '')
  })
})
