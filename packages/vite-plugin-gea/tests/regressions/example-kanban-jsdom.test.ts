import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadComponentUnseeded, loadRuntimeModules } from '../helpers/compile'
import { examplePath, readExampleFile } from '../helpers/example-paths'
import { resetDelegation } from '../../../../packages/gea/src/dom/events'

async function mountKanban(seed: string) {
  const Component = await loadComponentUnseeded()
  const [, { Store }] = await loadRuntimeModules(seed)
  const KanbanStoreClass = await compileStore(
    readExampleFile('kanban/src/kanban-store.ts'),
    examplePath('kanban/src/kanban-store.ts'),
    'KanbanStore',
    { Store },
  )
  const kanbanStore = new KanbanStoreClass()
  const TaskModal = await compileJsxComponent(
    readExampleFile('kanban/src/components/TaskModal.tsx'),
    '/virtual/examples/kanban/TaskModal.jsx',
    'TaskModal',
    { Component, kanbanStore },
  )
  const KanbanColumn = await compileJsxComponent(
    readExampleFile('kanban/src/components/KanbanColumn.tsx'),
    '/virtual/examples/kanban/KanbanColumn.jsx',
    'KanbanColumn',
    { Component, kanbanStore },
  )
  const KanbanApp = await compileJsxComponent(
    readExampleFile('kanban/src/kanban-app.tsx'),
    '/virtual/examples/kanban/KanbanApp.jsx',
    'KanbanApp',
    { Component, kanbanStore, KanbanColumn, TaskModal },
  )
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new KanbanApp()
  app.render(root)
  await flushMicrotasks()
  return { app, root, kanbanStore }
}

function col(root: HTMLElement, i: number) {
  return root.querySelectorAll('.kanban-column')[i] as HTMLElement
}

function setColumnDraft(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('examples/kanban in JSDOM (ported from kanban.spec)', { concurrency: false }, () => {
  let restoreDom: () => void
  let root: HTMLElement
  let app: { dispose?: () => void }

  beforeEach(async () => {
    resetDelegation()
    restoreDom = installDom()
    const m = await mountKanban(`ex-kanban-${Date.now()}-${Math.random()}`)
    app = m.app
    root = m.root
  })

  afterEach(async () => {
    try { app.dispose?.() } catch {}
    await flushMicrotasks()
    root.remove()
    restoreDom()
  })

  it('initial render must produce exactly 4 columns', () => {
    assert.equal(root.querySelectorAll('.kanban-column').length, 4)
  })

  it('initial render shows correct card counts per column', () => {
    assert.equal(root.querySelectorAll('.kanban-card').length, 8)
    assert.equal(col(root, 0).querySelectorAll('.kanban-card').length, 3)
    assert.equal(col(root, 1).querySelectorAll('.kanban-card').length, 3)
    assert.equal(col(root, 2).querySelectorAll('.kanban-card').length, 2)
    assert.equal(col(root, 3).querySelectorAll('.kanban-card').length, 0)
  })

  it('adding a task must not detach existing cards in the column', async () => {
    const body = col(root, 0).querySelector('.kanban-column-body')!
    const removed: string[] = []
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of [...m.removedNodes]) {
          if (node.nodeType === 1 && (node as HTMLElement).classList.contains('kanban-card')) {
            removed.push('x')
          }
        }
      }
    })
    obs.observe(body, { childList: true })
    ;(col(root, 0).querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = col(root, 0).querySelector('input[type="text"]') as HTMLInputElement
    setColumnDraft(input, 'New regression task')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushMicrotasks()
    obs.disconnect()
    assert.deepEqual(removed, [])
    assert.equal(col(root, 0).querySelectorAll('.kanban-card').length, 4)
  })

  it('adding a task must not detach cards in other columns', async () => {
    const todoCol = col(root, 1)
    todoCol.querySelector('.kanban-card')!.setAttribute('data-test-marker', 'todo-first')
    col(root, 2).querySelector('.kanban-card')!.setAttribute('data-test-marker', 'progress-first')
    ;(col(root, 0).querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = col(root, 0).querySelector('input[type="text"]') as HTMLInputElement
    setColumnDraft(input, 'Another task')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushMicrotasks()

    assert.equal(todoCol.querySelector('.kanban-card')!.getAttribute('data-test-marker'), 'todo-first')
    assert.equal(col(root, 2).querySelector('.kanban-card')!.getAttribute('data-test-marker'), 'progress-first')
  })

  it('opening and closing task modal must not rebuild column cards', async () => {
    const backlog = col(root, 0)
    backlog.querySelector('.kanban-card')!.setAttribute('data-test-marker', 'backlog-first')
    ;(backlog.querySelector('.kanban-card') as HTMLElement).click()
    await flushMicrotasks()
    assert.ok(root.querySelector('.kanban-modal-backdrop'))
    ;(root.querySelector('.kanban-modal-close') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(backlog.querySelector('.kanban-card')!.getAttribute('data-test-marker'), 'backlog-first')
  })

  it('delete task via modal removes the card and closes the modal', async () => {
    const backlog = col(root, 0)
    const before = backlog.querySelectorAll('.kanban-card').length
    const title = backlog.querySelector('.kanban-card-title')!.textContent
    ;(backlog.querySelector('.kanban-card') as HTMLElement).click()
    await flushMicrotasks()
    ;(root.querySelector('.kanban-modal .kanban-btn-danger') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.ok(!root.querySelector('.kanban-modal-backdrop'))
    assert.equal(backlog.querySelectorAll('.kanban-card').length, before - 1)
    const titles = [...backlog.querySelectorAll('.kanban-card-title')].map((n) => n.textContent)
    assert.ok(!titles.includes(title))
  })

  it('deleting a task removes only one card node', async () => {
    const backlog = col(root, 0)
    const body = backlog.querySelector('.kanban-column-body')!
    const removed: string[] = []
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of [...m.removedNodes]) {
          if (node.nodeType === 1 && (node as HTMLElement).classList.contains('kanban-card')) {
            removed.push((node as HTMLElement).textContent?.trim().slice(0, 40) || '')
          }
        }
      }
    })
    obs.observe(body, { childList: true })
    ;(backlog.querySelector('.kanban-card') as HTMLElement).click()
    await flushMicrotasks()
    ;(root.querySelector('.kanban-modal .kanban-btn-danger') as HTMLButtonElement).click()
    await flushMicrotasks()
    obs.disconnect()
    assert.equal(removed.length, 1)
  })

  it('cancel adding via Cancel button', async () => {
    const backlog = col(root, 0)
    const before = backlog.querySelectorAll('.kanban-card').length
    ;(backlog.querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = backlog.querySelector('input[type="text"]') as HTMLInputElement
    setColumnDraft(input, 'Will be cancelled')
    ;(backlog.querySelector('.kanban-btn-ghost') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.ok(!backlog.querySelector('input[type="text"]'))
    assert.equal(backlog.querySelectorAll('.kanban-card').length, before)
  })

  it('cancel adding via Escape', async () => {
    const backlog = col(root, 0)
    const before = backlog.querySelectorAll('.kanban-card').length
    ;(backlog.querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = backlog.querySelector('input[type="text"]') as HTMLInputElement
    setColumnDraft(input, 'Will be escaped')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushMicrotasks()
    assert.equal(backlog.querySelectorAll('.kanban-card').length, before)
  })

  it('modal shows correct task content', async () => {
    const todoCol = col(root, 1)
    ;(todoCol.querySelector('.kanban-card') as HTMLElement).click()
    await flushMicrotasks()
    assert.match(root.querySelector('.kanban-modal-title')!.textContent || '', /API rate limiting/)
    assert.match(root.querySelectorAll('.kanban-modal-value')[1].textContent || '', /medium/)
    ;(root.querySelector('.kanban-modal-close') as HTMLButtonElement).click()
    await flushMicrotasks()
  })

  it('modal shows No description for new task', async () => {
    const backlog = col(root, 0)
    const before = backlog.querySelectorAll('.kanban-card').length
    ;(backlog.querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = backlog.querySelector('input[type="text"]') as HTMLInputElement
    setColumnDraft(input, 'No desc task')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushMicrotasks()
    const cards = backlog.querySelectorAll('.kanban-card')
    assert.equal(cards.length, before + 1)
    ;(cards[cards.length - 1] as HTMLElement).click()
    await flushMicrotasks()
    const empty = root.querySelector('.kanban-modal-value.empty')
    assert.ok(empty)
    assert.match(empty!.textContent || '', /No description/)
  })

  it('add task via Add button', async () => {
    const todoCol = col(root, 1)
    const before = todoCol.querySelectorAll('.kanban-card').length
    ;(todoCol.querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = todoCol.querySelector('input[type="text"]') as HTMLInputElement
    setColumnDraft(input, 'Added via button')
    ;(todoCol.querySelector('.kanban-btn-primary') as HTMLButtonElement).click()
    await flushMicrotasks()
    const titles = todoCol.querySelectorAll('.kanban-card-title')
    assert.equal(todoCol.querySelectorAll('.kanban-card').length, before + 1)
    assert.match(titles[titles.length - 1].textContent || '', /Added via button/)
  })

  it('empty title does not create a task', async () => {
    const backlog = col(root, 0)
    const before = backlog.querySelectorAll('.kanban-card').length
    ;(backlog.querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = backlog.querySelector('input[type="text"]') as HTMLInputElement
    setColumnDraft(input, '')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushMicrotasks()
    assert.equal(backlog.querySelectorAll('.kanban-card').length, before)
    setColumnDraft(input, '   ')
    ;(backlog.querySelector('.kanban-btn-primary') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.equal(backlog.querySelectorAll('.kanban-card').length, before)
  })

  it('surgical DOM: adding a task preserves first card marker', async () => {
    const backlog = col(root, 0)
    backlog.querySelector('.kanban-card')!.setAttribute('data-stability-marker', 'survivor')
    ;(backlog.querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = backlog.querySelector('input[type="text"]') as HTMLInputElement
    setColumnDraft(input, 'Stability test task')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushMicrotasks()
    assert.equal(backlog.querySelector('.kanban-card')!.getAttribute('data-stability-marker'), 'survivor')
  })

  it('no data-gea-compiled-child-root in document', () => {
    assert.equal(document.querySelectorAll('[data-gea-compiled-child-root]').length, 0)
  })

  it('typing in add-form input keeps same input element', async () => {
    const backlog = col(root, 0)
    ;(backlog.querySelector('.kanban-add-task') as HTMLButtonElement).click()
    await flushMicrotasks()
    const input = backlog.querySelector('input[type="text"]') as HTMLInputElement
    const ref = input
    for (const ch of 'New task') {
      input.value += ch
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flushMicrotasks()
    assert.equal(backlog.querySelector('input[type="text"]'), ref)
  })
})
