import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import {
  transformComponentSource,
  transformWithPlugin,
  createObserveHarness,
  withDom,
  generate,
  generateObserveHandler,
  getObserveMethodName,
} from './plugin-helpers'

test('static reactivity wires subscriptions for every imported store used by a component', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import counterStore from './counter-store'
    import filterStore from './filter-store'

    export default class DashboardView extends Component {
      template() {
        return (
          <div>
            <span>{counterStore.count}</span>
            <span>{filterStore.query}</span>
          </div>
        )
      }
    }
  `)

  assert.match(output, /this\.__observe\(counterStore,/)
  assert.match(output, /this\.__observe\(filterStore,/)
})

test('static reactivity detects default Store imports across files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-store-import-'))

  try {
    const componentPath = join(dir, 'DashboardView.jsx')
    const storePath = join(dir, 'dashboard-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class DashboardStore extends Store {
  count = 1
}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import store from './dashboard-store'

        export default class DashboardView extends Component {
          template() {
            return <div>{store.count}</div>
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.match(output, /this\.__observe\(store,/)
    assert.match(output, /\["count"\]/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('imported store array text bindings inject id on stats element for getElementById', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <div class="todo-list">
            <div class="todo-items">
              {store.todos.map(todo => (
                <div class={\`todo-item\${todo.completed ? ' completed' : ''}\`} key={todo.id}>
                  <span>{todo.text}</span>
                </div>
              ))}
            </div>
            <div class="todo-stats">
              Total: {store.todos.length} | Completed: {store.todos.filter(todo => todo.completed).length}
            </div>
          </div>
        )
      }
    }
  `)

  assert.ok(
    /id=.*__id.*-b\d.*todo-stats|todo-stats.*id=.*__id.*-b\d/.test(output),
    'todo-stats div must have id attribute for getElementById lookup',
  )
  assert.ok(
    /this\.__updateText\('b\d'/.test(output),
    'stats binding must use __updateText helper, not inline getElementById',
  )
})

test('imported store input value binding injects id for getElementById', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <div class="todo-list">
            <input
              type="text"
              value={store.inputValue}
              input={store.setInputValue}
            />
          </div>
        )
      }
    }
  `)

  assert.ok(
    /input[^>]*id=.*__id.*-b\d|id=.*__id.*-b\d[^>]*input/.test(output),
    'input must have id for getElementById so value updates (e.g. clear after add) work',
  )
  assert.ok(/getElementById\([^)]*__id[^)]*\+[^)]*"-b\d"\)/.test(output), 'input value binding must use getElementById')
})

test('wildcard observers update index zero items', () => {
  withDom(() => {
    const binding = {
      pathParts: ['todos', '*', 'label'],
      type: 'text' as const,
      selector: '.label',
      elementPath: [],
      itemIdProperty: 'id',
      childPath: [0],
    }
    const method = generateObserveHandler(binding, new Map())
    const methodSource = generate(method).code
    const harness = createObserveHarness(
      methodSource,
      `
      this.todos = [{ id: 1, label: 'before' }];
      `,
    )
    harness.root = document.createElement('div')
    harness.root.innerHTML = '<div class="item" data-gea-item-id="0"><span class="label">before</span></div>'
    harness.__todos_container = harness.root

    harness[getObserveMethodName(['todos', '*', 'label'])]('after', {
      pathParts: ['todos', '0', 'label'],
      arrayPathParts: ['todos'],
      arrayIndex: 0,
      leafPathParts: ['label'],
      isArrayItemPropUpdate: true,
      newValue: 'after',
    })

    assert.equal(harness.root.querySelector('.label')?.textContent, 'after')
  })
})

test('wildcard observers resolve imported array paths correctly', () => {
  withDom(() => {
    const binding = {
      pathParts: ['todos', '*', 'label'],
      isImportedState: true,
      storeVar: 'storeState',
      type: 'text' as const,
      selector: '.label',
      elementPath: [],
      itemIdProperty: 'id',
      childPath: [0],
    }
    const method = generateObserveHandler(
      binding,
      new Map<string, StateRefMeta>([['storeState', { kind: 'imported', source: './store' }]]),
    )
    const methodSource = generate(method).code
    const harness = createObserveHarness(methodSource, '', {
      storeState: { __store: { todos: [{ id: 1, label: 'before' }] } },
    })
    harness.root = document.createElement('div')
    harness.root.innerHTML = '<div class="item" data-gea-item-id="0"><span class="label">before</span></div>'
    harness.__todos_container = harness.root

    harness[getObserveMethodName(['todos', '*', 'label'], 'storeState')]('after', {
      pathParts: ['todos', '0', 'label'],
      arrayPathParts: ['todos'],
      arrayIndex: 0,
      leafPathParts: ['label'],
      isArrayItemPropUpdate: true,
      newValue: 'after',
    })

    assert.equal(harness.root.querySelector('.label')?.textContent, 'after')
  })
})

test('static reactivity subscribes imported array maps without plain text bindings', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoItems extends Component {
      template() {
        return (
          <ul>
            {store.todos.map(todo => (
              <li key={todo.id}>{todo.label}</li>
            ))}
          </ul>
        )
      }
    }
  `)

  assert.match(output, /render(?:__unresolved_0|Todos)Item/)
  assert.match(output, /store\.todos\.map/)
})

test('computed imported array maps subscribe to helper dependencies', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './grid-store'

    export default class FilteredItems extends Component {
      getVisibleItems() {
        return store.items.filter(item => item.visible)
      }

      template() {
        const visibleItems = this.getVisibleItems()
        return (
          <ul>
            {visibleItems.map(item => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        )
      }
    }
  `)

  assert.match(output, /const visibleItems = this\.getVisibleItems\(\)/)
  assert.match(output, /visibleItems\.map/)
})

test('store getter destructuring observes getter state deps when passed as child component props', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-deps-'))

  try {
    const componentPath = join(dir, 'TodoApp.jsx')
    const storePath = join(dir, 'todo-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class TodoStore extends Store {
  todos = [] as Array<{ id: number; text: string; done: boolean }>
  draft = ''
  filter = 'all' as 'all' | 'active' | 'completed'
  get activeCount(): number {
    return this.todos.filter(t => !t.done).length
  }
  get completedCount(): number {
    return this.todos.filter(t => t.done).length
  }
}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import todoStore from './todo-store'
        import TodoFilters from './TodoFilters'

        export default class TodoApp extends Component {
          template() {
            const { filter } = todoStore
            const { activeCount, completedCount } = todoStore
            return (
              <div>
                <TodoFilters filter={filter} activeCount={activeCount} completedCount={completedCount} />
              </div>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.match(output, /\["filter"\]/, 'state property should observe specific path')
    assert.match(output, /\["todos"\]/, 'store getter should observe its actual state dependency')
    assert.doesNotMatch(output, /\["activeCount"\]/, 'should not observe getter name as path')
    assert.doesNotMatch(output, /\["completedCount"\]/, 'should not observe getter name as path')
    assert.doesNotMatch(output, /__observe\([^,]+,\s*\[\]/, 'should not use root observer when getter deps are known')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('store getter via direct member access observes dependency paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-direct-'))

  try {
    const componentPath = join(dir, 'CounterDisplay.jsx')
    const storePath = join(dir, 'counter-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
class CounterStore extends Store {
  count = 0
  increment() { this.count++ }
  get doubled(): number { return this.count * 2 }
}
export default new CounterStore()`,
    )

    const output = await transformWithPlugin(
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
      componentPath,
    )

    assert.ok(output)
    assert.match(output, /\["count"\]/, 'count should be observed directly')
    assert.doesNotMatch(output, /\["doubled"\]/, 'should not observe getter name as path')
    assert.match(output, /counterStore\.doubled/, 'should inline re-read of getter value in merged observer')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('store getter observer refreshes child props instead of re-rendering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-guard-'))

  try {
    const componentPath = join(dir, 'TodoApp.jsx')
    const storePath = join(dir, 'todo-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class TodoStore extends Store {
  todos = [] as Array<{ id: number; done: boolean }>
  get activeCount(): number {
    return this.todos.filter(t => !t.done).length
  }
}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import todoStore from './todo-store'
        import TodoFilters from './TodoFilters'

        export default class TodoApp extends Component {
          template() {
            const { activeCount } = todoStore
            return <div><TodoFilters count={activeCount} /></div>
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.match(output, /__observe_todoStore_todos/, 'todos observer method should be generated')
    const methodStart = output.indexOf('__observe_todoStore_todos')
    const methodSlice = output.slice(methodStart, methodStart + 300)
    assert.match(
      methodSlice,
      /this\._todoFilters\.__geaUpdateProps\(this\.__buildProps_todoFilters\(\)\)/,
      'observer should call child prop update, not __geaRequestRender',
    )
    assert.doesNotMatch(methodSlice, /__geaRequestRender/, 'observer must not trigger a full re-render')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('component class getters that access stores create observers for underlying store paths', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import routeStore from './route-store'

    export default class Page extends Component {
      get isBoard() {
        return routeStore.path.startsWith('/board')
      }

      template() {
        return (
          <div>
            {this.isBoard && <div>Board</div>}
          </div>
        )
      }
    }
  `)

  assert.match(
    output,
    /this\.__observe\(routeStore/,
    'compiler must observe routeStore when a component getter accesses it',
  )
  assert.match(output, /\["path"\]/, 'observer must be registered for the underlying store path the getter reads')
})

test('transitive getter-to-getter deps produce __via observers for underlying store paths', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import routeStore from './route-store'

    function matchRoute(pattern, path) {
      return path.startsWith(pattern) ? { params: { id: '1' } } : null
    }

    export default class Project extends Component {
      get isBoard() {
        return routeStore.path.startsWith('/board')
      }

      get issueMatch() {
        return matchRoute('/board/issues/', routeStore.path)
      }

      get showIssueDetail() {
        return !!this.issueMatch
      }

      get issueId() {
        return this.issueMatch ? this.issueMatch.params.id : ''
      }

      template() {
        return (
          <div>
            {this.isBoard && <div>Board</div>}
            {this.showIssueDetail && <div>Issue {this.issueId}</div>}
          </div>
        )
      }
    }
  `)

  assert.match(
    output,
    /this\.__observe_local_isBoard\((?:this\.isBoard|undefined), null\)/,
    'isBoard (direct store dep) must route through the merged observer',
  )
  assert.match(
    output,
    /this\.__observe_local_showIssueDetail\((?:this\.showIssueDetail|undefined), null\)/,
    'showIssueDetail (transitive via issueMatch → routeStore.path) must route through the merged observer',
  )
  assert.match(output, /Issue \$\{this\.issueId\}/, 'issueId must still participate in the truthy branch HTML')
  assert.doesNotMatch(
    output,
    /__geaRequestRender/,
    'no fallback full re-render should be generated when all deps resolve to store observers',
  )
  assert.doesNotMatch(
    output,
    /__via/,
    'no __via wrapper methods should be generated — re-reads are inlined in merged observer',
  )
})

test('component getter reading this.props registers deps for this.getter in template text', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class SelectLike extends Component {
      get displayLabel() {
        const { value, options = [] } = this.props
        return String(value) + options.length
      }
      template({ value, options = [] }) {
        return <span class="lbl">{this.displayLabel}</span>
      }
    }
  `)

  assert.match(output, /this\.displayLabel/, 'template should invoke getter')
  assert.match(output, /key === "value"/, 'getter reads this.props.value — value must trigger prop patch')
  assert.match(output, /key === "options"/, 'getter reads this.props.options — options must trigger prop patch')
})

test('observer calls __geaUpdateProps when guard-dependent props reference the store', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Icon from './Icon.jsx'

    export default class ProjectSettings extends Component {
      template() {
        const project = projectStore.project

        if (!project) return <div>Loading...</div>

        return (
          <div>
            <Icon type={project.icon} size={20} />
          </div>
        )
      }
    }
  `)

  const observerMatch = output.match(/__observe_projectStore_project\([^)]*\)\s*\{[\s\S]*?\n {2}\}/)
  assert.ok(observerMatch, 'observer for projectStore.project should be generated')

  assert.match(
    observerMatch![0],
    /this\._icon\.__geaUpdateProps\(this\.__buildProps_icon\(\)\)/,
    'observer must call this._icon.__geaUpdateProps to update the child when the guard dependency changes',
  )
})

test('store observer for top-level project guard must observe the guard path and handle loading transitions', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Board from './Board'

    export default class Project extends Component {
      template() {
        const project = projectStore.project
        if (!project) return <div>Loading</div>
        return <div><Board /></div>
      }
    }
  `,
    new Set(['Board']),
  )

  assert.match(output, /__observe\(projectStore,\s*\["project"\]/, 'must observe projectStore.project')
  const projectObserver =
    output.match(/__observe_projectStore_project\([\s\S]*?\n {2}\}/)?.[0] ??
    output.match(/__observe\(projectStore,\s*\["project"\],[\s\S]*?\)\s*\)/)?.[0] ??
    ''
  assert.ok(projectObserver, 'project guard path must produce an observer')
  assert.ok(
    projectObserver.includes('__geaRequestRender') || projectObserver.includes('__geaPatchCond'),
    'project guard observer must handle loading transitions',
  )
})

test('store observer for nested project.users must NOT trigger __geaRequestRender on the parent component', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'
    import projectStore from './project-store'
    import Select from './Select'

    export default class IssueDetails extends Component {
      template() {
        const { isLoading, issue } = issueStore
        const project = projectStore.project
        const users = project ? project.users : []
        const userOptions = users.map((u) => ({ value: u.id, label: u.name }))
        if (isLoading || !issue) return <div>Loading</div>
        return (
          <div>
            <Select items={userOptions} value={issue.userIds || []} />
          </div>
        )
      }
    }
  `,
    new Set(['Select']),
  )

  const projectObserver = output.match(/__observe_projectStore_project\b[^_]([\s\S]*?)\n {2}\}/)?.[0]
  assert.ok(projectObserver, 'must generate __observe_projectStore_project')
  assert.ok(
    !projectObserver.includes('__geaRequestRender'),
    '__observe_projectStore_project must NOT call __geaRequestRender (it should only refresh child props). Got: ' +
      projectObserver,
  )
})

test('store-alias nested field must produce inline patch or rerender observer (status badge pattern)', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import itemStore from './item-store'

    const StatusCopy = { backlog: 'Backlog', selected: 'Selected', done: 'Done' }

    export default class Badge extends Component {
      template() {
        const issue = itemStore.issue
        const issueStatus = issue.status || 'backlog'

        return (
          <div class="badge">
            <span class="status-text">{(StatusCopy[issueStatus] || 'Backlog').toUpperCase()}</span>
            <span class="priority-text">{issue.priority}</span>
          </div>
        )
      }
    }
  `)

  const hasIssueObserver =
    /__observe_itemStore_issue\b/.test(output) || /__observe_itemStore_issue__status\b/.test(output)
  assert.ok(
    hasIssueObserver,
    'must generate an observer for itemStore issue or issue.status. Output: ' + output.slice(0, 3000),
  )

  const observerMatch = output.match(/__observe_itemStore_issue[^(]*\([^)]*\)\s*\{[\s\S]*?\n {2}\}/)
  if (observerMatch) {
    assert.ok(
      observerMatch[0].includes('__patchNode') ||
        observerMatch[0].includes('__geaRequestRender') ||
        observerMatch[0].includes('textContent') ||
        observerMatch[0].includes('__updateText'),
      'observer must contain patch logic or rerender. Got: ' + observerMatch[0],
    )
  }
})

test('method call on store field observes the field, not the method', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-method-obs-'))
  try {
    const storePath = join(dir, 'store.ts')
    await writeFile(
      storePath,
      `
import { Store } from '@geajs/core'
class MyStore extends Store {
  draft = ''
  setDraft(e) { this.draft = e.target.value }
}
export default new MyStore()
      `.trim(),
    )

    const componentPath = join(dir, 'App.jsx')
    const output = await transformWithPlugin(
      `
import { Component } from '@geajs/core'
import store from './store'

export default class App extends Component {
  template() {
    return (
      <div>
        <button disabled={!store.draft.trim()}>Send</button>
      </div>
    )
  }
}
      `,
      componentPath,
    )
    assert.ok(output, 'should produce compiled output')

    assert.match(output!, /observe\(.*"draft"/, 'should observe "draft" path')
    assert.doesNotMatch(output!, /observe\(.*"draft".*"trim"/, 'should NOT observe "draft","trim" path')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
