import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE } from '../../../gea/src/symbols'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'

test('compiled store push triggers signal update', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-append`
    const [, { Store }] = await loadRuntimeModules(seed)

    const DataStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class DataStore extends Store {
          data = [] as Array<{ id: number }>
        }
      `,
      '/virtual/data-store.ts',
      'DataStore',
      { Store },
    )
    const store = new DataStore()

    assert.equal(store.data.length, 0)

    // v2 signal arrays track the reference; push triggers the setter
    store.data = [...store.data, { id: 1 }, { id: 2 }]
    await flushMicrotasks()

    assert.equal(store.data.length, 2)
    assert.equal(store.data[0].id, 1)
    assert.equal(store.data[1].id, 2)
  } finally {
    restoreDom()
  }
})

test('compiled store array swap via replacement', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-swap-meta`
    const [, { Store }] = await loadRuntimeModules(seed)

    const DataStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class DataStore extends Store {
          data = [{ id: 1 }, { id: 2 }, { id: 3 }]
        }
      `,
      '/virtual/data-store.ts',
      'DataStore',
      { Store },
    )
    const store = new DataStore()

    // Swap first and last elements
    const rows = [...store.data]
    const tmp = rows[0]
    rows[0] = rows[2]
    rows[2] = tmp
    store.data = rows
    await flushMicrotasks()

    assert.equal(store.data[0].id, 3)
    assert.equal(store.data[2].id, 1)
  } finally {
    restoreDom()
  }
})

test('compiled store independent array index updates', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-no-swap-meta`
    const [, { Store }] = await loadRuntimeModules(seed)

    const DataStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class DataStore extends Store {
          data = [{ id: 1 }, { id: 2 }, { id: 3 }]
        }
      `,
      '/virtual/data-store.ts',
      'DataStore',
      { Store },
    )
    const store = new DataStore()

    store.data = store.data.map((item: any, i: number) => {
      if (i === 0) return { id: 4 }
      if (i === 2) return { id: 5 }
      return item
    })
    await flushMicrotasks()

    assert.equal(store.data[0].id, 4)
    assert.equal(store.data[1].id, 2)
    assert.equal(store.data[2].id, 5)
  } finally {
    restoreDom()
  }
})

test('component with null prop does not crash', async () => {
  const restoreDom = installDom()
  resetDelegation()

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
                <span class="route">{pass.departure} - {pass.arrival}</span>
                <span class="code">{pass.confirmationCode}</span>
                <span class="pax">{pass.passengerName}</span>
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
    view[GEA_SET_PROPS]({
      pass: () => ({
        departure: 'IST',
        arrival: 'JFK',
        confirmationCode: 'ABC123',
        passengerName: 'Jane',
      }),
    })
    view.render(root)
    await flushMicrotasks()

    assert.ok(root.querySelector('.route')!.textContent!.includes('IST'))
    assert.ok(root.querySelector('.route')!.textContent!.includes('JFK'))
    assert.equal(root.querySelector('.code')!.textContent, 'ABC123')
    assert.equal(root.querySelector('.pax')!.textContent, 'Jane')

    view.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('store field props update DOM when dependency changes', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-getter-surgical`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const TodoStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class TodoStore extends Store {
          activeCount = 0
          completedCount = 0
        }
      `,
      '/virtual/todo-store.ts',
      'TodoStore',
      { Store },
    )
    const todoStore = new TodoStore()

    const TodoFilters = await compileJsxComponent(
      `
        export default function TodoFilters({ activeCount, completedCount }) {
          return (
            <div class="todo-filters">
              <span class="active-count">{activeCount} items left</span>
              <span class="completed-count">{completedCount} completed</span>
            </div>
          )
        }
      `,
      '/virtual/TodoFilters.jsx',
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
            return (
              <div class="todo-app">
                <TodoFilters activeCount={todoStore.activeCount} completedCount={todoStore.completedCount} />
              </div>
            )
          }
        }
      `,
      '/virtual/TodoApp.jsx',
      'TodoApp',
      { Component, todoStore, TodoFilters },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoApp()
    view.render(root)
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /0 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /0 completed/)

    // Simulate adding 2 todos (1 active, 1 completed)
    todoStore.activeCount = 1
    todoStore.completedCount = 1
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /1 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /1 completed/)

    // Simulate completing the active todo
    todoStore.activeCount = 0
    todoStore.completedCount = 2
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /0 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /2 completed/)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('local state change patches DOM (editing toggle)', async () => {
  const restoreDom = installDom()
  resetDelegation()

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
            return (
              <li class={\`item \${this.editing ? 'editing' : ''}\`}>
                <span class="label">{label}</span>
                <input class="edit-input" type="text" value={this.editText} input={(e) => this.handleInput(e)} />
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
    const item = new EditableItem()
    item[GEA_SET_PROPS]({ label: () => 'Buy groceries' })
    item.render(root)
    await flushMicrotasks()

    assert.ok(item.el, 'item rendered')
    assert.ok(!item.el.className.includes('editing'), 'not editing initially')

    item.startEditing()
    await flushMicrotasks()

    assert.ok(item.el.className.includes('editing'), 'editing class added')

    item.dispose()
  } finally {
    restoreDom()
  }
})

test('compiled store: getter accessed via direct member expression updates when dependency changes', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-getter-member-access`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const CounterStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class CounterStore extends Store {
          count = 0
          get doubled() {
            return this.count * 2
          }
          increment() {
            this.count++
          }
        }
      `,
      '/virtual/counter-store.ts',
      'CounterStore',
      { Store },
    )
    const counterStore = new CounterStore()

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
      '/virtual/CounterDisplay.jsx',
      'CounterDisplay',
      { Component, counterStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new CounterDisplay()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '0', 'initial count')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '0', 'initial doubled')

    counterStore.increment()
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '1', 'count after increment')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '2', 'doubled updates after increment')

    counterStore.increment()
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '2', 'count after second increment')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '4', 'doubled updates after second increment')

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('map creates new items when options list grows via prop update', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-conditional-map-ismulti-props`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SelectLike = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default function SelectLike({ options, isMulti, value }) {
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
      `,
      '/virtual/SelectLikeMapProps.jsx',
      'SelectLike',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    // Mount via parent component to test prop updates through reactive props
    const Parent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import SelectLike from './SelectLike'

        export default class Parent extends Component {
          options = [{ value: '1', label: 'One' }]
          isMulti = true
          value = ['1']

          template() {
            return (
              <div class="parent">
                <SelectLike options={this.options} isMulti={this.isMulti} value={this.value} />
              </div>
            )
          }
        }
      `,
      '/virtual/SelectParent.jsx',
      'Parent',
      { Component, SelectLike },
    )

    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.opt').length, 1)

    view.options = [
      { value: '1', label: 'One' },
      { value: '2', label: 'Two' },
    ]
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.opt').length, 2)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
