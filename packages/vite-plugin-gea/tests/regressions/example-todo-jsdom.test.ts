import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'
import { readExampleFile } from '../helpers/example-paths'

async function mountTodoApp(seed: string) {
  const { TodoStore } = await import('../../../../examples/todo/todo-store.ts')
  const [{ default: Component }] = await loadRuntimeModules(seed)

  const TodoInput = await compileJsxComponent(
    readExampleFile('todo/components/TodoInput.tsx'),
    '/virtual/examples/todo/TodoInput.jsx',
    'TodoInput',
    { Component },
  )
  const TodoItem = await compileJsxComponent(
    readExampleFile('todo/components/TodoItem.tsx'),
    '/virtual/examples/todo/TodoItem.jsx',
    'TodoItem',
    { Component },
  )
  const TodoFilters = await compileJsxComponent(
    readExampleFile('todo/components/TodoFilters.tsx'),
    '/virtual/examples/todo/TodoFilters.jsx',
    'TodoFilters',
    { Component },
  )

  const todoStore = new TodoStore()
  const TodoApp = await compileJsxComponent(
    readExampleFile('todo/todo-app.tsx'),
    '/virtual/examples/todo/TodoApp.jsx',
    'TodoApp',
    { Component, todoStore, TodoInput, TodoItem, TodoFilters },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new TodoApp()
  app.render(root)
  await flushMicrotasks()
  return { app, root, todoStore }
}

function fillInput(root: HTMLElement, text: string) {
  const input = root.querySelector('.todo-input') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function pressEnter(el: Element) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

function typeSequentially(el: HTMLInputElement, text: string) {
  el.focus()
  for (const ch of text) {
    el.value += ch
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

describe('examples/todo app in JSDOM (ported from todo.spec)', { concurrency: false }, () => {
  let restoreDom: () => void
  let root: HTMLElement
  let app: { dispose: () => void }

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `ex-todo-${Date.now()}-${Math.random()}`
    const m = await mountTodoApp(seed)
    app = m.app
    root = m.root
  })

  afterEach(async () => {
    app.dispose()
    await flushMicrotasks()
    root.remove()
    restoreDom()
  })

  it('adding a todo must surgically append, not rebuild the list', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 1)

    root.querySelector('.todo-item')!.setAttribute('data-test-marker', 'first')

    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 2)
    assert.equal(root.querySelector('.todo-item')!.getAttribute('data-test-marker'), 'first')

    root.querySelectorAll('.todo-item')[1]!.setAttribute('data-test-marker', 'second')
    fillInput(root, 'Clean house')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 3)
    assert.equal(root.querySelectorAll('.todo-item')[0].getAttribute('data-test-marker'), 'first')
    assert.equal(root.querySelectorAll('.todo-item')[1].getAttribute('data-test-marker'), 'second')
  })

  it('toggling a todo must not rebuild the list', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()

    root.querySelectorAll('.todo-item')[0].setAttribute('data-test-marker', 'first')
    root.querySelectorAll('.todo-item')[1].setAttribute('data-test-marker', 'second')
    ;(root.querySelector('.todo-checkbox') as HTMLInputElement).click()
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.todo-item')[0].getAttribute('data-test-marker'), 'first')
    assert.equal(root.querySelectorAll('.todo-item')[1].getAttribute('data-test-marker'), 'second')
  })

  it('removing a todo must not rebuild surviving items', async () => {
    for (const t of ['Buy milk', 'Walk dog', 'Clean house']) {
      fillInput(root, t)
      pressEnter(root.querySelector('.todo-input')!)
    }
    await flushMicrotasks()
    root.querySelectorAll('.todo-item')[1].setAttribute('data-test-marker', 'second')
    root.querySelectorAll('.todo-item')[2].setAttribute('data-test-marker', 'third')
    ;(root.querySelector('.todo-remove') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 2)
    assert.equal(root.querySelectorAll('.todo-item')[0].getAttribute('data-test-marker'), 'second')
    assert.equal(root.querySelectorAll('.todo-item')[1].getAttribute('data-test-marker'), 'third')
  })

  it('adding a todo must not detach/reattach existing items in the DOM', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()

    const refs = [...root.querySelectorAll('.todo-item')]
    fillInput(root, 'Clean house')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()

    const after = [...root.querySelectorAll('.todo-item')]
    assert.ok(refs.every((r, i) => r === after[i]))
  })

  it('toggling a todo must not detach/reattach any items in the DOM', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()

    const list = root.querySelector('.todo-list')!
    const removed: string[] = []
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of [...m.removedNodes]) {
          if (node.nodeType === 1) removed.push((node as HTMLElement).className)
        }
      }
    })
    obs.observe(list, { childList: true })
    ;(root.querySelector('.todo-checkbox') as HTMLInputElement).click()
    await flushMicrotasks()
    obs.disconnect()
    assert.deepEqual(removed, [])
  })

  it('filters: switching to Active hides completed items', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    ;(root.querySelector('.todo-checkbox') as HTMLInputElement).click()
    await flushMicrotasks()
    ;([...root.querySelectorAll('.filter-btn')].find((b) => b.textContent?.trim() === 'Active') as HTMLElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.match(root.querySelector('.todo-text')!.textContent || '', /Walk dog/)
    assert.match(root.querySelector('.filter-btn.active')!.textContent || '', /Active/)
  })

  it('filters: switching to Completed shows only completed items', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    ;(root.querySelector('.todo-checkbox') as HTMLInputElement).click()
    await flushMicrotasks()

    const completedBtn = [...root.querySelectorAll('.filter-btn')].find((b) =>
      b.textContent?.includes('Completed'),
    )! as HTMLElement
    completedBtn.click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    assert.match(root.querySelector('.todo-text')!.textContent || '', /Buy milk/)
  })

  it('filters: switching back to All restores full list', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    ;(root.querySelector('.todo-checkbox') as HTMLInputElement).click()
    await flushMicrotasks()
    ;([...root.querySelectorAll('.filter-btn')].find((b) => b.textContent?.trim() === 'Active') as HTMLElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 1)
    ;([...root.querySelectorAll('.filter-btn')].find((b) => b.textContent?.trim() === 'All') as HTMLElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 2)
  })

  it('filters: items surviving a filter change are the same DOM nodes', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    ;(root.querySelector('.todo-checkbox') as HTMLInputElement).click()
    await flushMicrotasks()

    const walkDogEl = root.querySelectorAll('.todo-item')[1]
    ;([...root.querySelectorAll('.filter-btn')].find((b) => b.textContent?.trim() === 'Active') as HTMLElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelector('.todo-item'), walkDogEl)
  })

  it('counter: "X items left" updates after adding/toggling/removing', async () => {
    assert.ok(!root.querySelector('.todo-filters'))

    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.ok(root.querySelector('.todo-filters'))
    assert.match(root.querySelector('.todo-count')!.textContent || '', /1 item left/)

    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.match(root.querySelector('.todo-count')!.textContent || '', /2 items left/)
    ;(root.querySelector('.todo-checkbox') as HTMLInputElement).click()
    await flushMicrotasks()
    assert.match(root.querySelector('.todo-count')!.textContent || '', /1 item left/)
    assert.match(root.querySelector('.todo-count.completed')!.textContent || '', /1 completed/)
    ;(root.querySelector('.todo-remove') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.match(root.querySelector('.todo-count')!.textContent || '', /1 item left/)
    assert.ok(!root.querySelector('.todo-count.completed'))
  })

  it('inline rename: double-click opens edit mode, Enter commits', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()

    root.querySelector('.todo-text')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flushMicrotasks()
    assert.ok(root.querySelector('.todo-edit'))
    assert.equal(root.querySelectorAll('.todo-item.editing').length, 1)

    const edit = root.querySelector('.todo-edit') as HTMLInputElement
    edit.value = 'Buy oat milk'
    edit.dispatchEvent(new Event('input', { bubbles: true }))
    pressEnter(edit)
    await flushMicrotasks()

    assert.ok(!root.querySelector('.todo-edit'))
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Buy oat milk')
  })

  it('inline rename: Escape cancels without changing text', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()

    root.querySelector('.todo-text')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flushMicrotasks()
    const edit = root.querySelector('.todo-edit') as HTMLInputElement
    edit.value = 'Something else'
    edit.dispatchEvent(new Event('input', { bubbles: true }))
    edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushMicrotasks()

    assert.ok(!root.querySelector('.todo-edit'))
    assert.equal(root.querySelector('.todo-text')!.textContent, 'Buy milk')
  })

  it('inline rename: renaming a todo does not detach other items', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()

    const second = root.querySelectorAll('.todo-item')[1]
    root.querySelector('.todo-text')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flushMicrotasks()
    const edit = root.querySelector('.todo-edit') as HTMLInputElement
    edit.value = 'Buy oat milk'
    edit.dispatchEvent(new Event('input', { bubbles: true }))
    pressEnter(edit)
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.todo-item')[1], second)
  })

  it('adding empty text is a no-op', async () => {
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)

    fillInput(root, '   ')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)
  })

  it('TodoFilters only renders when todos exist', async () => {
    assert.ok(!root.querySelector('.todo-filters'))
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.ok(root.querySelector('.todo-filters'))
    ;(root.querySelector('.todo-remove') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(root.querySelectorAll('.todo-item').length, 0)
    assert.ok(!root.querySelector('.todo-filters'))
  })

  it('removing a todo does not detach surviving items via MutationObserver', async () => {
    for (const t of ['Buy milk', 'Walk dog', 'Clean house']) {
      fillInput(root, t)
      pressEnter(root.querySelector('.todo-input')!)
    }
    await flushMicrotasks()

    const list = root.querySelector('.todo-list')!
    const removedClassNames: string[] = []
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of [...m.removedNodes]) {
          if (node.nodeType === 1) removedClassNames.push((node as HTMLElement).className)
        }
      }
    })
    obs.observe(list, { childList: true })
    ;(root.querySelectorAll('.todo-remove')[1] as HTMLButtonElement).click()
    await flushMicrotasks()
    obs.disconnect()
    assert.equal(removedClassNames.length, 1)
  })

  it('surgical DOM updates: adding a todo preserves existing DOM nodes', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    root.querySelector('.todo-item')!.setAttribute('data-stability-marker', 'survivor')
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(root.querySelector('.todo-item')!.getAttribute('data-stability-marker'), 'survivor')
  })

  it('no data-gea-compiled-child-root attributes in the DOM', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()
    assert.equal(document.querySelectorAll('[data-gea-compiled-child-root]').length, 0)
  })

  it('typing in the todo input does not trigger list rerender', async () => {
    fillInput(root, 'Buy milk')
    pressEnter(root.querySelector('.todo-input')!)
    fillInput(root, 'Walk dog')
    pressEnter(root.querySelector('.todo-input')!)
    await flushMicrotasks()

    const refs = [...root.querySelectorAll('.todo-item')]
    const input = root.querySelector('.todo-input') as HTMLInputElement
    input.value = ''
    typeSequentially(input, 'New todo text')
    await flushMicrotasks()

    const cur = [...root.querySelectorAll('.todo-item')]
    assert.ok(refs.every((r, i) => r === cur[i]))
  })
})
