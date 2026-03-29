import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('mapped conditional attributes add and remove in place', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mapped-attribute-toggle`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const AttributeList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class AttributeList extends Component {
          items = [{ id: 1, label: 'one', active: false }]

          template() {
            return (
              <div class="items">
                {this.items.map(item => (
                  <button key={item.id} data-state={item.active ? 'on' : null}>
                    {item.label}
                  </button>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/AttributeList.jsx',
      'AttributeList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new AttributeList()
    component.render(root)
    await flushMicrotasks()

    const button = () => component.el.querySelector('button')

    assert.equal(button()?.hasAttribute('data-state'), false)

    component.items[0].active = true
    await flushMicrotasks()
    assert.equal(button()?.getAttribute('data-state'), 'on')

    component.items[0].active = false
    await flushMicrotasks()
    assert.equal(button()?.hasAttribute('data-state'), false)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped list mutations add and remove DOM rows in order', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mapped-list-mutations`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SimpleList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SimpleList extends Component {
          nextId = 2
          items = [{ id: 1, label: 'one' }]

          add(label) {
            this.items.push({ id: this.nextId++, label })
          }

          removeFirst() {
            this.items.splice(0, 1)
          }

          template() {
            return (
              <ul class="items">
                {this.items.map(item => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ul>
            )
          }
        }
      `,
      '/virtual/SimpleList.jsx',
      'SimpleList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new SimpleList()
    component.render(root)

    const rowTexts = () =>
      Array.from(component.el.querySelectorAll('li')).map((node: Element) => node.textContent?.trim())

    assert.deepEqual(rowTexts(), ['one'])

    component.add('two')
    await flushMicrotasks()
    assert.deepEqual(rowTexts(), ['one', 'two'])

    component.removeFirst()
    await flushMicrotasks()
    assert.deepEqual(rowTexts(), ['two'])

    component.add('three')
    await flushMicrotasks()
    assert.deepEqual(rowTexts(), ['two', 'three'])

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('imported mapped table rows rerender selected class in place', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mapped-table-selection`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [], selected: 0 })

    const actions = {
      run() {
        store.data = [
          { id: 1, label: 'one' },
          { id: 2, label: 'two' },
          { id: 3, label: 'three' },
          { id: 4, label: 'four' },
          { id: 5, label: 'five' },
          { id: 6, label: 'six' },
        ]
        store.selected = 0
      },
      select(id: number) {
        store.selected = id
      },
    }

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id} class={store.selected === item.id ? 'danger' : ''}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/BenchmarkTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    actions.run()
    await flushMicrotasks()

    const rowBefore = view.el.querySelector('tbody > tr:nth-of-type(5)')

    assert.equal((rowBefore as any)?.__geaItem?.id, 5)
    assert.equal(view.el.querySelectorAll('tbody > tr.danger').length, 0)

    actions.select(5)
    await flushMicrotasks()

    const rowAfter = view.el.querySelector('tbody > tr:nth-of-type(5)')

    assert.equal((rowAfter as any)?.__geaItem?.id, 5)
    assert.equal(rowAfter?.className, 'danger')
    assert.equal(rowAfter, rowBefore)
    assert.equal(view.el.querySelectorAll('tbody > tr.danger').length, 1)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('keyed mapped tables replace rows by identity on full array updates', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-keyed-reconcile`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number; label: string }> })

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/BenchmarkTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    store.data = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
    ]
    await flushMicrotasks()

    const firstRowBefore = view.el.querySelector('tbody > tr:first-of-type')
    assert.equal((firstRowBefore as any)?.__geaItem?.id, 1)

    store.data = [
      { id: 3, label: 'three' },
      { id: 4, label: 'four' },
    ]
    await flushMicrotasks()

    const firstRowAfter = view.el.querySelector('tbody > tr:first-of-type')
    assert.equal((firstRowAfter as any)?.__geaItem?.id, 3)
    assert.notEqual(firstRowAfter, firstRowBefore)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('keyed mapped tables move existing rows on swaps', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-keyed-swap`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number; label: string }> })

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/BenchmarkTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    store.data = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
      { id: 3, label: 'three' },
    ]
    await flushMicrotasks()

    const firstRowBefore = view.el.querySelector('tbody > tr:nth-of-type(1)')
    const thirdRowBefore = view.el.querySelector('tbody > tr:nth-of-type(3)')
    assert.equal((firstRowBefore as any)?.__geaItem?.id, 1)
    assert.equal((thirdRowBefore as any)?.__geaItem?.id, 3)

    const rows = store.data
    const tmp = rows[0]
    rows[0] = rows[2]
    rows[2] = tmp
    await flushMicrotasks()

    const tbodyAfter = view.el.querySelector('tbody')!
    const firstRowAfter = tbodyAfter.children[0] as Element
    const thirdRowAfter = tbodyAfter.children[2] as Element
    assert.equal((firstRowAfter as any)?.__geaItem?.id, 3)
    assert.equal((thirdRowAfter as any)?.__geaItem?.id, 1)
    assert.equal(firstRowAfter, thirdRowBefore)
    assert.equal(thirdRowAfter, firstRowBefore)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('keyed mapped tables clear all rows on full array resets', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-keyed-clear`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number; label: string }> })

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/BenchmarkTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    store.data = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
      { id: 3, label: 'three' },
    ]
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('tbody > tr').length, 3)

    store.data = []
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('tbody > tr').length, 0)
    assert.equal(view.el.querySelector('tbody')?.textContent, '')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('unkeyed mapped tables do not emit key attributes', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-unkeyed-attrs`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number; label: string }> })

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/UnkeyedTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    store.data = [{ id: 1, label: 'one' }]
    await flushMicrotasks()

    const row = view.el.querySelector('tbody > tr')
    assert.equal(row?.hasAttribute('key'), false)
    assert.equal((row as any)?.__geaKey != null || row?.hasAttribute('data-gea-item-id'), true)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

for (const keyed of [true]) {
  test(`local state mapped benchmark table renders rows after array assignment (${keyed ? 'keyed' : 'non-keyed'})`, async () => {
    const restoreDom = installDom()

    try {
      const seed = `runtime-${Date.now()}-local-table-${keyed ? 'keyed' : 'non-keyed'}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const BenchmarkTable = await compileJsxComponent(
        `
          import { Component } from '@geajs/core'

          export default class BenchmarkTable extends Component {
            data = []
            selected = 0

            run() {
              this.data = Array.from({ length: 1000 }, (_, index) => ({
                id: index + 1,
                label: \`row-\${index + 1}\`
              }))
            }

            template() {
              return (
                <table>
                  <tbody id="tbody">
                    {this.data.map(item => (
                      <tr${keyed ? ' key={item.id}' : ''} class={this.selected === item.id ? 'danger' : ''}>
                        <td class="col-md-1">{item.id}</td>
                        <td class="col-md-4">
                          <a>{item.label}</a>
                        </td>
                        <td class="col-md-1">
                          <a>
                            <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                          </a>
                        </td>
                        <td class="col-md-6"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          }
        `,
        `/virtual/LocalBenchmarkTable-${keyed ? 'keyed' : 'non-keyed'}.jsx`,
        'BenchmarkTable',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)

      const view = new BenchmarkTable()
      view.render(root)
      view.run()
      await flushMicrotasks()

      assert.equal(view.el.querySelectorAll('tbody > tr').length, 1000)
      assert.equal(view.el.querySelector('tbody > tr:nth-of-type(1) > td:nth-of-type(1)')?.textContent?.trim(), '1')
      assert.equal(
        view.el.querySelector('tbody > tr:nth-of-type(1000) > td:nth-of-type(2) > a')?.textContent?.trim(),
        'row-1000',
      )

      view.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })
}

for (const keyed of [true]) {
  test(`local state mapped rows update selected class in place (${keyed ? 'keyed' : 'non-keyed'})`, async () => {
    const restoreDom = installDom()

    try {
      const seed = `runtime-${Date.now()}-local-select-${keyed ? 'keyed' : 'non-keyed'}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const BenchmarkTable = await compileJsxComponent(
        `
          import { Component } from '@geajs/core'

          export default class BenchmarkTable extends Component {
            data = [
              { id: 1, label: 'one' },
              { id: 2, label: 'two' },
              { id: 3, label: 'three' },
              { id: 4, label: 'four' },
              { id: 5, label: 'five' }
            ]
            selected = 0

            select(id) {
              this.selected = id
            }

            template() {
              return (
                <table>
                  <tbody id="tbody">
                    {this.data.map(item => (
                      <tr${keyed ? ' key={item.id}' : ''} class={this.selected === item.id ? 'danger' : ''}>
                        <td>{item.id}</td>
                        <td>{item.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          }
        `,
        `/virtual/LocalSelectTable-${keyed ? 'keyed' : 'non-keyed'}.jsx`,
        'BenchmarkTable',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)

      const view = new BenchmarkTable()
      view.render(root)

      const rowBefore = view.el.querySelector('tbody > tr:nth-of-type(5)')
      assert.equal(rowBefore?.className, '')

      view.select(5)
      await flushMicrotasks()

      const rowAfter = view.el.querySelector('tbody > tr:nth-of-type(5)')
      assert.equal(rowAfter?.className, 'danger')
      assert.equal(rowAfter, rowBefore)

      view.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })
}

for (const keyed of [true]) {
  test(`local state mapped rows keep event item refs after full replacement (${keyed ? 'keyed' : 'non-keyed'})`, async () => {
    const restoreDom = installDom()

    try {
      const seed = `runtime-${Date.now()}-local-${keyed ? 'keyed' : 'non-keyed'}-events`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const BenchmarkTable = await compileJsxComponent(
        `
          import { Component } from '@geajs/core'

          export default class BenchmarkTable extends Component {
            data = []
            selected = 0

            run() {
              this.data = Array.from({ length: 10 }, (_, index) => ({
                id: index + 1,
                label: \`row-\${index + 1}\`
              }))
            }

            select(id) {
              this.selected = id
            }

            remove(id) {
              const index = this.data.findIndex(item => item.id === id)
              if (index >= 0) this.data.splice(index, 1)
            }

            template() {
              return (
                <table>
                  <tbody id="tbody">
                    {this.data.map(item => (
                      <tr${keyed ? ' key={item.id}' : ''} class={this.selected === item.id ? 'danger' : ''}>
                        <td>{item.id}</td>
                        <td>
                          <a class="select-link" click={() => this.select(item.id)}>{item.label}</a>
                        </td>
                        <td>
                          <a class="remove-link" click={() => this.remove(item.id)}>
                            <span>x</span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          }
        `,
        `/virtual/Local${keyed ? 'Keyed' : 'NonKeyed'}Events.jsx`,
        'BenchmarkTable',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)

      const view = new BenchmarkTable()
      view.render(root)
      view.run()
      await flushMicrotasks()

      const selectLink = view.el.querySelector('tbody > tr:nth-of-type(5) .select-link') as HTMLElement
      const selectedRowBefore = view.el.querySelector('tbody > tr:nth-of-type(5)')
      assert.equal((selectedRowBefore as any)?.__geaKey ?? selectedRowBefore?.getAttribute('data-gea-item-id'), '5')
      selectLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await flushMicrotasks()

      assert.equal(view.el.querySelector('tbody > tr:nth-of-type(5)')?.className, 'danger')
      const row5 = view.el.querySelector('tbody > tr:nth-of-type(5)')
      assert.equal((row5 as any)?.__geaKey ?? row5?.getAttribute('data-gea-item-id'), '5')

      const removeLink = view.el.querySelector('tbody > tr:nth-of-type(9) .remove-link') as HTMLElement
      removeLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await flushMicrotasks()

      assert.equal(view.el.querySelector('tbody > tr:nth-of-type(9) > td:nth-of-type(1)')?.textContent?.trim(), '10')
      const row9 = view.el.querySelector('tbody > tr:nth-of-type(9)')
      assert.equal((row9 as any)?.__geaKey ?? row9?.getAttribute('data-gea-item-id'), '10')

      view.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })
}

test('store-dependent class in unresolved map patches items without full list rebuild', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-unresolved-map-class-patch`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ activeId: null as string | null })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ items }) {
            return (
              <div class="column">
                <div class="body">
                  {items.map(item => (
                    <div key={item} class={\`card \${store.activeId === item ? 'active' : ''}\`}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new MyColumn({ items: ['a', 'b', 'c'] })
    view.render(root)

    const cards = view.el.querySelectorAll('.body > div')
    assert.equal(cards.length, 3)

    const cardA = cards[0]
    const cardB = cards[1]
    const cardC = cards[2]
    assert.ok(cardA)
    assert.ok(cardB)
    assert.ok(cardC)

    store.activeId = 'b'
    await flushMicrotasks()

    const cardsAfter = view.el.querySelectorAll('.body > div')
    assert.equal(cardsAfter.length, 3)
    assert.equal(cardsAfter[0], cardA, 'first card DOM should be preserved')
    assert.equal(cardsAfter[1], cardB, 'second card DOM should be preserved')
    assert.equal(cardsAfter[2], cardC, 'third card DOM should be preserved')
    assert.match(cardsAfter[1].className, /active/)

    store.activeId = null
    await flushMicrotasks()

    const cardsAfter2 = view.el.querySelectorAll('.body > div')
    assert.equal(cardsAfter2.length, 3)
    assert.equal(cardsAfter2[0], cardA, 'first card DOM still preserved after deactivation')
    assert.doesNotMatch(cardsAfter2[1].className, /active/)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('unresolved map rebuilds when parent mutates prop array in-place and calls __geaUpdateProps (drop scenario)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-drop-inplace-mutation`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      tasks: { t1: { id: 't1', title: 'A' }, t2: { id: 't2', title: 'B' }, t3: { id: 't3', title: 'C' } } as Record<
        string,
        any
      >,
    })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ column }) {
            const taskIds = column.taskIds
            return (
              <div class="column">
                <div class="body">
                  {taskIds.map(taskId =>
                    store.tasks[taskId] ? (
                      <div key={taskId} class="card">{store.tasks[taskId].title}</div>
                    ) : null
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const colA = { id: 'col-a', title: 'From', taskIds: ['t1', 't2'] }
    const colB = { id: 'col-b', title: 'To', taskIds: ['t3'] }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const viewA = new MyColumn({ column: colA })
    viewA.render(root)
    const viewB = new MyColumn({ column: colB })
    viewB.render(root)

    await flushMicrotasks()

    const cardsA1 = viewA.el.querySelectorAll('.body .card')
    const cardsB1 = viewB.el.querySelectorAll('.body .card')
    assert.equal(cardsA1.length, 2, 'column A starts with 2 cards')
    assert.equal(cardsB1.length, 1, 'column B starts with 1 card')

    const idx = colA.taskIds.indexOf('t2')
    colA.taskIds.splice(idx, 1)
    colB.taskIds.push('t2')

    viewA.__geaUpdateProps({ column: colA })
    viewB.__geaUpdateProps({ column: colB })
    await flushMicrotasks()

    const cardsA2 = viewA.el.querySelectorAll('.body .card')
    const cardsB2 = viewB.el.querySelectorAll('.body .card')
    assert.equal(cardsA2.length, 1, 'column A should have 1 card after move')
    assert.equal(cardsB2.length, 2, 'column B should have 2 cards after move')
    assert.equal(cardsA2[0].textContent, 'A', 'remaining card in A is t1')
    assert.equal(cardsB2[1].textContent, 'B', 'moved card in B is t2')

    viewA.dispose()
    viewB.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('map item event handler resolves item on initial render before any list rebuild', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-map-event-initial-render`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      tasks: {
        t1: { id: 't1', title: 'Task A' },
        t2: { id: 't2', title: 'Task B' },
      } as Record<string, any>,
    })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ column }) {
            const taskIds = column.taskIds
            return (
              <div class="column">
                <div class="body">
                  {taskIds.map(taskId =>
                    store.tasks[taskId] ? (
                      <div
                        key={taskId}
                        class="card"
                        draggable="true"
                        dragstart={(e) => {
                          if (e.dataTransfer) {
                            e.dataTransfer.setData('text/plain', taskId)
                          }
                        }}
                        click={() => store.__clicked = taskId}
                      >
                        {store.tasks[taskId].title}
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new MyColumn({ column: { id: 'col-1', title: 'Backlog', taskIds: ['t1', 't2'] } })
    view.render(root)
    await flushMicrotasks()

    const cards = view.el.querySelectorAll('.card')
    assert.equal(cards.length, 2, 'should render 2 cards')

    assert.ok(!(cards[0] as any).__geaItem, 'initial render DOM elements should NOT have __geaItem set')

    const helperName = Object.getOwnPropertyNames(Object.getPrototypeOf(view)).find((n: string) =>
      n.startsWith('__getMapItemFromEvent'),
    )
    assert.ok(helperName, 'compiled component should have a __getMapItemFromEvent helper')
    const fakeEvent = { target: cards[0] }
    const resolved = (view as any)[helperName!](fakeEvent)
    assert.ok(resolved, 'helper should resolve a non-null value on initial render')
    assert.equal(String(resolved), 't1', 'helper should resolve to the item ID string')

    const fakeEvent2 = { target: cards[1] }
    const resolved2 = (view as any)[helperName!](fakeEvent2)
    assert.ok(resolved2, 'helper should resolve second item')
    assert.equal(String(resolved2), 't2', 'helper should resolve to t2')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('component array children reconcile by key, not by index', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-keyed-component-array`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ChildItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ChildItem extends Component {
          template({ label }: any) {
            return <div class="item">{label}</div>
          }
        }
      `,
      '/virtual/ChildItem.tsx',
      'ChildItem',
      { Component },
    )

    const ParentList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import ChildItem from './ChildItem'

        export default class ParentList extends Component {
          template({ items }: any) {
            return (
              <div class="list">
                {items.map((item: any) => (
                  <ChildItem key={item.id} itemId={item.id} label={item.label} />
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/ParentList.tsx',
      'ParentList',
      { Component, ChildItem },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const parent = new ParentList({
      items: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
    })
    parent.render(root)
    await flushMicrotasks()

    const childrenBefore = parent._itemsItems
    assert.ok(childrenBefore, '_itemsItems must exist')
    assert.equal(childrenBefore.length, 2)

    const compA = childrenBefore[0]
    const compB = childrenBefore[1]
    const elA = compA.element_
    const elB = compB.element_
    assert.ok(elA, 'component A must have an element')
    assert.ok(elB, 'component B must have an element')
    assert.equal(elA.textContent, 'Alpha')
    assert.equal(elB.textContent, 'Beta')

    parent.__geaUpdateProps({
      items: [
        { id: 'c', label: 'Gamma' },
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
    })
    await flushMicrotasks()

    const childrenAfter = parent._itemsItems
    assert.equal(childrenAfter.length, 3)

    assert.notStrictEqual(childrenAfter[0], compA, 'index 0 must be a new component (Gamma), not the old A')
    assert.strictEqual(childrenAfter[1], compA, 'old component A must be reused at index 1')
    assert.strictEqual(childrenAfter[2], compB, 'old component B must be reused at index 2')

    assert.strictEqual(childrenAfter[1].element_, elA, 'component A must keep the same DOM node')
    assert.strictEqual(childrenAfter[2].element_, elB, 'component B must keep the same DOM node')

    const container = parent.el.querySelector('.list') || parent.el
    const domChildren = Array.from(container.children)
    assert.equal(domChildren.length, 3, 'container must have 3 children')
    assert.equal(domChildren[0].textContent, 'Gamma')
    assert.equal(domChildren[1].textContent, 'Alpha')
    assert.equal(domChildren[2].textContent, 'Beta')

    parent.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
test('nested member keys let delegated map events target the correct row', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-nested-map-key-events`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      memberships: [
        { member: { name: 'Ada' }, dedication: 1, revenue: 100 },
        { member: { name: 'Grace' }, dedication: 2, revenue: 200 },
      ],
    })

    const MembershipTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MembershipTable extends Component {
          updateDedication(name, dedication) {
            const index = store.memberships.findIndex(entry => entry.member.name === name)
            if (index < 0) return
            store.memberships[index].dedication = dedication
            store.memberships[index].revenue = dedication * 100
          }

          template() {
            return (
              <div>
                <table>
                  <tbody>
                    {store.memberships.map(membership => (
                      <tr key={membership.member.name}>
                        <td class="name">{membership.member.name}</td>
                        <td class="dedication">{membership.dedication}</td>
                        <td class="revenue">{membership.revenue}</td>
                        <td>
                          <button class="bump" click={() => this.updateDedication(membership.member.name, membership.dedication + 1)}>
                            Bump
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div class="total">{store.memberships.reduce((sum, membership) => sum + membership.revenue, 0)}</div>
              </div>
            )
          }
        }
      `,
      '/virtual/MembershipTable.jsx',
      'MembershipTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new MembershipTable()
    view.render(root)
    await flushMicrotasks()

    const rows = () => Array.from(view.el.querySelectorAll('tbody > tr'))
    const graceRowBefore = rows()[1] as HTMLElement | undefined
    const graceButton = graceRowBefore?.querySelector('.bump') as HTMLElement | null

    assert.equal(rows()[0]?.getAttribute('data-gea-item-id'), 'Ada')
    assert.equal(rows()[1]?.getAttribute('data-gea-item-id'), 'Grace')
    assert.equal(graceRowBefore?.querySelector('.dedication')?.textContent?.trim(), '2')
    assert.equal(graceRowBefore?.querySelector('.revenue')?.textContent?.trim(), '200')
    assert.equal(view.el.querySelector('.total')?.textContent?.trim(), '300')

    graceButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    const graceRowAfter = rows()[1] as HTMLElement | undefined
    assert.equal(graceRowAfter, graceRowBefore, 'Grace row DOM should be preserved')
    assert.equal(store.memberships[0].dedication, 1)
    assert.equal(store.memberships[0].revenue, 100)
    assert.equal(store.memberships[1].dedication, 3)
    assert.equal(store.memberships[1].revenue, 300)
    assert.equal(rows()[0]?.getAttribute('data-gea-item-id'), 'Ada')
    assert.equal(rows()[1]?.getAttribute('data-gea-item-id'), 'Grace')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
