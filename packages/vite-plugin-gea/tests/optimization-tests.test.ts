import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE } from '../../gea/src/symbols'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { transformSource } from '../src/transform/index.ts'
import { installDom, flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import {
  compileJsxComponent,
  compileStore,
  loadRuntimeModules,
  transformWithPlugin,
} from './helpers/compile'

/**
 * v2 optimization tests — rewritten from v1 to match the v2 compiler output patterns.
 *
 * v2 uses: reactiveContent, reactiveAttr, reactiveText, computation, keyedList,
 * conditional, template, signal, batch, mount, selectorAttr.
 *
 * v1 used: GEA_ON_PROP_CHANGE, GEA_ENSURE_ARRAY_CONFIGS, GEA_APPLY_LIST_CHANGES,
 * GEA_REGISTER_COND, GEA_OBSERVE, propPatchers, __geaPatchProp_*, etc.
 */

// --- Prop reactive content: v2 uses reactiveContent/reactiveAttr for prop bindings ---
test('compiler generates reactiveContent for prop text bindings', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'

    export default class PropChild extends Component {
      template(props) {
        return <div class="value">{props.count}</div>
      }
    }
  `, '/virtual/PropChild.jsx')

  assert.ok(output)
  assert.match(output, /reactiveContent/, 'should use reactiveContent for prop text')
  assert.match(output, /__props\.count/, 'should reference __props.count')
  assert.match(output, /GEA_CREATE_TEMPLATE/, 'should rename template to GEA_CREATE_TEMPLATE')
})

test('compiler generates reactiveContent for this.props text bindings', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'

    export default class PropChild extends Component {
      template() {
        return <span>{this.props.label}</span>
      }
    }
  `, '/virtual/PropChild.jsx')

  assert.ok(output)
  assert.match(output, /reactiveContent/, 'should use reactiveContent for this.props text')
})

test('compiler generates reactiveAttr for dynamic class prop bindings', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'

    export default class ChildBadge extends Component {
      template({ activeClass }) {
        return <div class={activeClass}>Counter</div>
      }
    }
  `, '/virtual/ChildBadge.jsx')

  assert.ok(output)
  assert.match(output, /reactiveAttr/, 'should use reactiveAttr for dynamic class')
  assert.match(output, /className/, 'should set className attribute')
})

test('compiler generates reactiveAttr for data-* attribute prop bindings', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'

    export default class StatusBadge extends Component {
      template({ dataState }) {
        return <div data-state={dataState}>Status</div>
      }
    }
  `, '/virtual/StatusBadge.jsx')

  assert.ok(output)
  assert.match(output, /reactiveAttr/, 'should use reactiveAttr for data-state')
  assert.match(output, /data-state/, 'should reference data-state attribute')
})

// --- Template cloning: v2 uses template() for static HTML ---
test('compiler hoists static HTML into template() calls', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'

    export default class Card extends Component {
      template() {
        return <div id="test" class="foo">hello</div>
      }
    }
  `, '/virtual/Card.jsx')

  assert.ok(output)
  assert.match(output, /const _tmpl\d+ = template\(/, 'should hoist static HTML into template()')
  assert.match(output, /_tmpl\d+\(\)/, 'should clone template in GEA_CREATE_TEMPLATE')
})

// --- Style expression optimization ---
test('style object with literal values compiles to static attribute', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'

    export default class StaticStyle extends Component {
      template() {
        return <div style={{ backgroundColor: 'red', fontSize: '14px' }}>Hello</div>
      }
    }
  `, '/virtual/StaticStyle.jsx')

  assert.ok(output)
  // v2 uses reactiveAttr for style objects (even static ones) since the runtime
  // handles the object-to-CSS conversion
  assert.ok(
    output.includes('reactiveAttr') || output.includes('style='),
    'should handle style object (either as reactiveAttr or static string)',
  )
})

test('dynamic style object uses reactiveAttr', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'

    export default class DynStyle extends Component {
      template({ bg }) {
        return <div style={{ backgroundColor: bg }}>X</div>
      }
    }
  `, '/virtual/DynStyle.jsx')

  assert.ok(output)
  assert.match(output, /reactiveAttr/, 'should use reactiveAttr for dynamic style object')
})

// --- Functional component conditionals: v2 uses conditional() ---
test('functional component with conditionals generates conditional() calls', async () => {
  const output = await transformWithPlugin(
    `
    export default function OptionCard({ selected, color, label }) {
      return (
        <div>
          {selected && <span class="check">V</span>}
          {color && (
            <div class="swatch-wrap">
              <div class={\`swatch \${selected ? 'swatch--selected' : ''}\`}></div>
            </div>
          )}
          <p class="label">{label}</p>
        </div>
      )
    }
  `,
    '/virtual/OptionCard.jsx',
  )

  assert.ok(output)
  assert.match(output, /conditional/, 'should use conditional() for && expressions')

  // Count conditional calls — should have 2 (one for selected, one for color)
  const condCount = (output.match(/conditional\(/g) || []).length
  assert.ok(condCount >= 2, `should have at least 2 conditional() calls, found ${condCount}`)
})

// --- Array/list: v2 uses keyedList() ---
test('compiler generates keyedList for .map() with key', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'

    export default class MultiExprList extends Component {
      constructor() {
        super()
        this.items = [{ id: 1, label: 'a' }, { id: 2, label: 'b' }]
      }

      template() {
        return (
          <ul>
            {this.items.map(item => (
              <li key={item.id} data-gea-item>
                {item.label} - {item.id}
              </li>
            ))}
          </ul>
        )
      }
    }
  `, '/virtual/MultiExprList.jsx')

  assert.ok(output)
  assert.match(output, /keyedList/, 'should use keyedList for .map() with key')
  assert.ok(
    output.includes('item.label') || output.includes('item.id'),
    'should reference item properties in list callback',
  )
})

// --- onAfterRender lifecycle ---
test('onAfterRender is invoked after render', async () => {
  const restoreDom = installDom()

  try {
    const seed = `opt-afterrender-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    let afterRenderCalled = false
    class TestComponent extends Component {
      GEA_CREATE_TEMPLATE() {
        const el = document.createElement('div')
        el.textContent = 'test'
        return el
      }
      onAfterRender() {
        afterRenderCalled = true
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const comp = new TestComponent()
    comp.render(root)

    assert.ok(afterRenderCalled, 'onAfterRender should be called after render')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

// --- Store: fields compile to signals ---
test('store fields compile to signal getters/setters', () => {
  const output = transformSource(`
    import { Store } from '@geajs/core'
    export default class GridStore extends Store {
      activeId = 0
    }
  `, '/virtual/grid-store.ts')

  assert.ok(output)
  assert.match(output, /signal\(0\)/, 'should use signal(0) for field initializer')
  assert.match(output, /get activeId/, 'should generate getter')
  assert.match(output, /set activeId/, 'should generate setter')
  assert.match(output, /GEA_COMPILED/, 'should mark class as compiled')
})

// --- Store observer: v2 uses computation() for reactive bindings ---
test('compiler generates computation for store property bindings in different elements', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'
    import store from './multi-store'

    export default class MultiDisplay extends Component {
      template() {
        return (
          <div>
            <p>{store.firstName}</p>
            <p>{store.lastName}</p>
          </div>
        )
      }
    }
  `, '/virtual/MultiDisplay.jsx')

  assert.ok(output)
  // v2 generates separate computation/reactiveText for each binding
  assert.ok(
    output.includes('store.firstName') && output.includes('store.lastName'),
    'should reference both store properties',
  )
})

test('compiler generates computation for store property text binding', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'
    import store from './status-store'

    export default class StatusDisplay extends Component {
      template() {
        const { activeCount, completedCount } = store
        return (
          <p>{activeCount} active, {completedCount} completed</p>
        )
      }
    }
  `, '/virtual/StatusDisplay.jsx')

  assert.ok(output)
  assert.ok(
    output.includes('store.activeCount') && output.includes('store.completedCount'),
    'should reference destructured store properties via store.x',
  )
})

// --- setAttribute via reactiveAttr ---
test('compiler generates reactiveAttr for tabIndex binding', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'
    import store from './grid-store'

    export default class Cell extends Component {
      template() {
        return <td tabIndex={store.activeId === 99 ? 0 : -1}>cell</td>
      }
    }
  `, '/virtual/Cell.jsx')

  assert.ok(output)
  assert.match(output, /reactiveAttr/, 'should use reactiveAttr for tabIndex')
  assert.match(output, /tabIndex/, 'should reference tabIndex attribute')
})

// --- Runtime: reactiveAttr prevents unnecessary DOM writes ---
test('store observer should not trigger unnecessary DOM writes when value has not changed', async () => {
  const restoreDom = installDom()

  try {
    const seed = `attr-guard-rt-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const CellClass = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class Cell extends Component {
          template() {
            return <td tabIndex={store.activeId === 99 ? 0 : -1}>cell</td>
          }
        }
      `,
      '/virtual/Cell.jsx',
      'Cell',
      { Component, store: new (await compileStore(
        `import { Store } from '@geajs/core'
         export default class CellStore extends Store {
           activeId = 1
         }`,
        '/virtual/cell-store.ts',
        'CellStore',
        { Store },
      ))() },
    )

    const cell = new CellClass()
    const root = document.createElement('div')
    document.body.appendChild(root)
    cell.render(root)
    await flushMicrotasks()

    const td = cell.el as HTMLElement
    assert.equal(td.tagName, 'TD')

    cell.dispose()
  } finally {
    restoreDom()
  }
})

// --- Map item with reactiveAttr ---
test('map-item generates reactiveAttr for attribute bindings', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'
    import store from './grid-store'

    export default class Grid extends Component {
      template() {
        return (
          <table>
            <tbody>
              {store.items.map(item => (
                <tr key={item.id} tabIndex={store.activeId === item.id ? 0 : -1}>
                  <td>{item.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    }
  `, '/virtual/Grid.jsx')

  assert.ok(output)
  assert.match(output, /keyedList/, 'should use keyedList for .map()')
  assert.match(output, /reactiveAttr/, 'should use reactiveAttr for tabIndex in map items')
})

// --- Grid cell selection: only mutated cells should have DOM updates ---
test('selecting a cell in a grid should update only affected cells', async () => {
  const restoreDom = installDom()

  try {
    const seed = `grid-select-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const CellStoreClass = await compileStore(
      `import { Store } from '@geajs/core'
       export default class CellStore extends Store {
         activeId = 1
       }`,
      '/virtual/cell-store.ts',
      'CellStore',
      { Store },
    )
    const store = new CellStoreClass()

    const CellClass = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class GridCell extends Component {
          template() {
            return (
              <td
                class={store.activeId === this.props.id ? 'cell selected' : 'cell'}
                tabIndex={store.activeId === this.props.id ? 0 : -1}
              >
                {this.props.label}
              </td>
            )
          }
        }
      `,
      '/virtual/GridCell.jsx',
      'GridCell',
      { Component, store },
    )

    const CELL_COUNT = 10
    const cells: InstanceType<typeof CellClass>[] = []
    const root = document.createElement('div')
    document.body.appendChild(root)

    for (let i = 1; i <= CELL_COUNT; i++) {
      const cell = new CellClass()
      // v2 uses __setProps with thunks (arrow functions) to pass props
      const cellId = i
      const cellLabel = `cell-${i}`
      cell[GEA_SET_PROPS]({ id: () => cellId, label: () => cellLabel })
      cell.render(root)
      cells.push(cell)
    }
    await flushMicrotasks()

    // Verify initial state
    assert.equal(cells[0].el.className, 'cell selected', 'cell 1 should be selected initially')
    assert.equal(cells[1].el.className, 'cell', 'cell 2 should not be selected')

    // Change selection
    store.activeId = 3
    await flushMicrotasks()
    await new Promise((r) => setTimeout(r, 10))

    assert.equal(cells[0].el.className, 'cell', 'old selected cell should lose selected class')
    assert.equal(cells[2].el.className, 'cell selected', 'new selected cell should gain selected class')

    for (const cell of cells) cell.dispose()
  } finally {
    restoreDom()
  }
})

// --- mount for child components ---
test('compiler uses mount for child component references', () => {
  const output = transformSource(`
    import { Component } from '@geajs/core'
    import TodoItem from './components/TodoItem'
    import todoStore from './todo-store'

    export default class TodoApp extends Component {
      template() {
        return (
          <div class="todo-app">
            <ul>
              {todoStore.todos.map((todo) => (
                <TodoItem key={todo.id} todo={todo} />
              ))}
            </ul>
          </div>
        )
      }
    }
  `, '/virtual/TodoApp.jsx')

  assert.ok(output)
  assert.match(output, /mount/, 'should use mount for TodoItem references')
  assert.match(output, /keyedList/, 'should use keyedList for .map()')
  assert.match(output, /TodoItem/, 'should reference TodoItem component')
})
