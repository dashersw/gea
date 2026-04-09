import assert from 'node:assert/strict'
import { GEA_REQUEST_RENDER, GEA_UPDATE_PROPS } from '@geajs/core'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('store push emits one semantic append change', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-append`
    const [, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number }> })
    const seen: Array<{ value: Array<{ id: number }>; changes: Array<Record<string, unknown>> }> = []

    store.observe('data', (value, changes) => {
      seen.push({
        value: value as Array<{ id: number }>,
        changes: changes as Array<Record<string, unknown>>,
      })
    })

    store.data.push({ id: 1 }, { id: 2 })
    await flushMicrotasks()

    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.value.length, 2)
    assert.equal(seen[0]?.changes.length, 1)
    assert.equal(seen[0]?.changes[0]?.type, 'append')
    assert.deepEqual(seen[0]?.changes[0]?.pathParts, ['data'])
    assert.equal(seen[0]?.changes[0]?.start, 0)
    assert.equal(seen[0]?.changes[0]?.count, 2)
  } finally {
    restoreDom()
  }
})

test('store annotates reciprocal array index updates as swaps', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-swap-meta`
    const [, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    const seen: Array<Record<string, unknown>[]> = []

    store.observe('data', (_value, changes) => {
      seen.push(changes as Array<Record<string, unknown>>)
    })

    const rows = store.data
    const tmp = rows[0]
    rows[0] = rows[2]
    rows[2] = tmp
    await flushMicrotasks()

    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.length, 2)
    assert.equal(seen[0]?.[0]?.arrayOp, 'swap')
    assert.equal(seen[0]?.[1]?.arrayOp, 'swap')
    assert.deepEqual(seen[0]?.[0]?.arrayPathParts, ['data'])
    assert.deepEqual(seen[0]?.[1]?.arrayPathParts, ['data'])
    assert.equal(seen[0]?.[0]?.otherIndex, 2)
    assert.equal(seen[0]?.[1]?.otherIndex, 0)
    assert.equal(typeof seen[0]?.[0]?.opId, 'string')
    assert.equal(seen[0]?.[0]?.opId, seen[0]?.[1]?.opId)
  } finally {
    restoreDom()
  }
})

test('store leaves unrelated array index updates unclassified', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-no-swap-meta`
    const [, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    const seen: Array<Record<string, unknown>[]> = []

    store.observe('data', (_value, changes) => {
      seen.push(changes as Array<Record<string, unknown>>)
    })

    store.data[0] = { id: 4 }
    store.data[2] = { id: 5 }
    await flushMicrotasks()

    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.length, 2)
    assert.equal(seen[0]?.[0]?.arrayOp, undefined)
    assert.equal(seen[0]?.[1]?.arrayOp, undefined)
  } finally {
    restoreDom()
  }
})

test('__onPropChange does not crash when an object prop becomes null', async () => {
  const restoreDom = installDom()

  try {
    const seed = `null-prop-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const BoardingCard = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class BoardingCard extends Component {
          copied = false

          doCopy() { this.copied = true }
          resetCopy() { this.copied = false }

          template({ pass }) {
            const copied = this.copied
            return (
              <div class="card">
                <span class="route">{pass.departure} → {pass.arrival}</span>
                <span class="code">{pass.confirmationCode}</span>
                <span class="pax">{pass.passengerName}</span>
                <button class={copied ? 'btn copied' : 'btn'}>
                  <svg viewBox="0 0 24 24">
                    {copied ? (
                      <path d="M9 16L5 12l-1 1L9 19 21 7l-1-1z" fill="green" />
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
      '/virtual/BoardingCard.jsx',
      'BoardingCard',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BoardingCard()
    view.props = { pass: { departure: 'IST', arrival: 'JFK', confirmationCode: 'ABC123', passengerName: 'Jane' } }
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.route')!.textContent!.trim(), 'IST → JFK')
    assert.equal(root.querySelector('.code')!.textContent, 'ABC123')
    assert.equal(root.querySelector('.pax')!.textContent, 'Jane')

    assert.doesNotThrow(() => {
      view[GEA_UPDATE_PROPS]({ pass: null })
    }, 'setting object prop to null must not throw')

    assert.equal(
      root.querySelector('.route')!.textContent!.trim(),
      'IST → JFK',
      'DOM stays unchanged when prop becomes null',
    )

    assert.doesNotThrow(() => {
      view[GEA_UPDATE_PROPS]({
        pass: { departure: 'LAX', arrival: 'ORD', confirmationCode: 'XYZ', passengerName: 'Bob' },
      })
    }, 'restoring prop must not throw')
    assert.equal(root.querySelector('.route')!.textContent!.trim(), 'LAX → ORD', 'DOM updates when prop is restored')
    assert.equal(root.querySelector('.pax')!.textContent, 'Bob')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('store getter props produce surgical DOM patches without full rerender', async () => {
  const restoreDom = installDom()
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-surgical-'))

  try {
    const seed = `runtime-${Date.now()}-getter-surgical`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    await writeFile(
      join(dir, 'todo-store.ts'),
      `import { Store } from '@geajs/core'
export default class TodoStore extends Store {
  todos = [] as Array<{ id: number; text: string; done: boolean }>
  draft = ''
  get activeCount(): number {
    return this.todos.filter(t => !t.done).length
  }
  get completedCount(): number {
    return this.todos.filter(t => t.done).length
  }
}`,
    )

    const store = new Store({
      todos: [] as Array<{ id: number; text: string; done: boolean }>,
      draft: '',
    }) as any

    Object.defineProperty(store, 'activeCount', {
      get() {
        return store.todos.filter((t: any) => !t.done).length
      },
    })
    Object.defineProperty(store, 'completedCount', {
      get() {
        return store.todos.filter((t: any) => t.done).length
      },
    })

    const TodoFilters = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoFilters extends Component {
          template({ activeCount, completedCount }) {
            return (
              <div class="todo-filters">
                <span class="active-count">{activeCount} items left</span>
                <span class="completed-count">{completedCount} completed</span>
              </div>
            )
          }
        }
      `,
      join(dir, 'TodoFilters.jsx'),
      'TodoFilters',
      { Component },
    )

    const TodoApp = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import todoStore from './todo-store'
        import TodoFilters from './TodoFilters'

        export default class TodoApp extends Component {
          template() {
            const { activeCount, completedCount } = todoStore
            return (
              <div class="todo-app">
                <TodoFilters activeCount={activeCount} completedCount={completedCount} />
              </div>
            )
          }
        }
      `,
      join(dir, 'TodoApp.jsx'),
      'TodoApp',
      { Component, todoStore: store, TodoFilters },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoApp()
    view.render(root)
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /0 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /0 completed/)

    let parentRerenders = 0
    const origParentRender = view[GEA_REQUEST_RENDER].bind(view)
    view[GEA_REQUEST_RENDER] = () => {
      parentRerenders++
      return origParentRender()
    }

    const filtersChild = view._todoFilters
    assert.ok(filtersChild, 'TodoFilters child must exist after render')
    let childRerenders = 0
    const origChildRender = filtersChild[GEA_REQUEST_RENDER].bind(filtersChild)
    filtersChild[GEA_REQUEST_RENDER] = () => {
      childRerenders++
      return origChildRender()
    }

    const filtersElBefore = root.querySelector('.todo-filters')
    assert.ok(filtersElBefore, 'todo-filters element should exist')

    store.todos = [
      { id: 1, text: 'buy milk', done: false },
      { id: 2, text: 'walk dog', done: true },
    ]
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /1 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /1 completed/)

    assert.equal(parentRerenders, 0, 'parent must NOT call [GEA_REQUEST_RENDER]')
    assert.equal(childRerenders, 0, 'child must NOT call [GEA_REQUEST_RENDER] (should use surgical prop patches)')

    const filtersElAfter = root.querySelector('.todo-filters')
    assert.equal(filtersElAfter, filtersElBefore, 'TodoFilters DOM element must be the same object (not replaced)')

    parentRerenders = 0
    childRerenders = 0
    store.todos = store.todos.map((t: any) => (t.id === 1 ? { ...t, done: true } : t))
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /0 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /2 completed/)
    assert.equal(parentRerenders, 0, 'parent must NOT rerender on toggle')
    assert.equal(childRerenders, 0, 'child must NOT rerender on toggle (should use surgical prop patches)')

    parentRerenders = 0
    childRerenders = 0
    let childUpdatePropsCalled = false
    const origUpdateProps = filtersChild[GEA_UPDATE_PROPS].bind(filtersChild)
    filtersChild[GEA_UPDATE_PROPS] = (...args: any[]) => {
      childUpdatePropsCalled = true
      return origUpdateProps(...args)
    }

    store.draft = 'some text'
    await flushMicrotasks()

    assert.equal(
      childUpdatePropsCalled,
      false,
      'draft mutation must NOT trigger [GEA_UPDATE_PROPS] on child (observer targets ["todos"], not root [])',
    )
    assert.equal(parentRerenders, 0, 'draft mutation must NOT rerender parent')
    assert.equal(childRerenders, 0, 'draft mutation must NOT rerender child')

    view.dispose()
    await flushMicrotasks()
  } finally {
    await rm(dir, { recursive: true, force: true })
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Real-file store tests: exercise the OPTIMIZED observer path
// (analyzeStoreGetters + analyzeStoreReactiveFields succeed because the
// store file exists on disk, unlike virtual-file tests that always fall
// back to root observers)
// ---------------------------------------------------------------------------

test('local state change patches DOM without full rerender (editing toggle)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-local-state-patch`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const EditableItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class EditableItem extends Component {
          editing = false
          editText = ''

          startEditing() {
            if (this.editing) return
            this.editing = true
            this.editText = this.props.label
          }

          handleInput(e) {
            this.editText = e.target.value
          }

          template({ label }) {
            const { editing, editText } = this
            return (
              <li class={\`item \${editing ? 'editing' : ''}\`}>
                <span class="label">{label}</span>
                <input class="edit-input" type="text" value={editText} input={this.handleInput} />
              </li>
            )
          }
        }
      `,
      '/virtual/EditableItem.jsx',
      'EditableItem',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const item = new EditableItem({ label: 'Buy groceries' })
    item.render(root)
    await flushMicrotasks()

    assert.ok(item.el, 'item rendered')
    assert.ok(!item.el.className.includes('editing'), 'not editing initially')

    let rerenders = 0
    const origRerender = item[GEA_REQUEST_RENDER].bind(item)
    item[GEA_REQUEST_RENDER] = () => {
      rerenders++
      return origRerender()
    }

    item.startEditing()
    await flushMicrotasks()

    assert.ok(item.el.className.includes('editing'), 'editing class added')
    assert.equal(rerenders, 0, 'editing toggle must patch class without full rerender')

    item.dispose()
  } finally {
    restoreDom()
  }
})

test('real-file store: getter accessed via direct member expression updates when dependency changes', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-getter-member-access`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const store = new Store({ count: 0 }) as any
    Object.defineProperty(store, 'doubled', {
      get() {
        return store.count * 2
      },
    })
    store.increment = () => {
      store.count++
    }

    const fixtureDir = join(__dirname, '../fixtures')

    const CounterDisplay = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import counterStore from './counter-store'

        export default class CounterDisplay extends Component {
          template() {
            return (
              <div>
                <span class="count">{counterStore.count}</span>
                <span class="doubled">{counterStore.doubled}</span>
              </div>
            )
          }
        }
      `,
      join(fixtureDir, 'CounterDisplay.jsx'),
      'CounterDisplay',
      { Component, counterStore: store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new CounterDisplay()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '0', 'initial count')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '0', 'initial doubled')

    store.increment()
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '1', 'count after increment')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '2', 'doubled updates after increment')

    store.increment()
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '2', 'count after second increment')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '4', 'doubled updates after second increment')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('map createItem patch path rewrites template props after [GEA_UPDATE_PROPS] (Select isMulti)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-map-ismulti-props`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SelectLike = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SelectLike extends Component {
          template({ options = [], isMulti = false, value }) {
            return (
              <div class="select">
                <div class="options">
                  {options.map((opt) => (
                    <div
                      key={opt.value}
                        class={\`opt \${isMulti ? ((value || []).includes(opt.value) ? 'on' : '') : opt.value === value ? 'on' : ''}\`}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/SelectLikeMapProps.jsx',
      'SelectLike',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new SelectLike({
      options: [{ value: '1', label: 'One' }],
      isMulti: true,
      value: ['1'],
    })
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('.opt').length, 1)

    view[GEA_UPDATE_PROPS]({
      options: [
        { value: '1', label: 'One' },
        { value: '2', label: 'Two' },
      ],
    })
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('.opt').length, 2)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
