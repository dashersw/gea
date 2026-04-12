/**
 * Store observer / reactivity wiring regression tests — v2 edition.
 *
 * In v2 the compiler does NOT emit `[GEA_OBSERVE]`, `__observe_*` methods,
 * `[GEA_REQUEST_RENDER]`, `[GEA_UPDATE_TEXT]`, or `__buildProps_*`.
 * Instead, reactivity is handled at runtime through:
 *   - `computation()` for reactive text/attribute bindings
 *   - `keyedList()` for array .map() rendering
 *   - `conditional()` for && / ternary conditional rendering
 *   - `mount()` for child component instantiation with reactive props
 *   - `reactiveAttr()` for reactive element attributes
 *   - `reactiveText()` for dynamic text nodes
 *   - `delegateEvent()` for event handlers
 *
 * These tests verify the compiled output uses the correct v2 runtime helpers
 * and that store field access is preserved for signal-based tracking.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import {
  transformComponentSource,
  transformWithPlugin,
} from './plugin-helpers'

test('multiple stores produce computation() calls that access each store', () => {
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

  // v2 uses computation() for each store field binding
  assert.match(output, /computation\(\(\) => counterStore\.count/)
  assert.match(output, /computation\(\(\) => filterStore\.query/)
})

test('default Store import across files compiles to computation', async () => {
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
    assert.match(output, /computation\(\(\) => store\.count/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('imported store array text bindings use reactiveText for computed values', () => {
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

  // v2 uses reactiveText for dynamic text nodes reading store arrays
  assert.match(output, /reactiveText\(\(\) => store\.todos\.length\)/)
  assert.match(output, /reactiveText\(\(\) => store\.todos\.filter/)
  // v2 uses keyedList for .map()
  assert.match(output, /keyedList\(/)
})

test('imported store input value binding uses reactiveAttr', () => {
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

  // v2 uses reactiveAttr for value binding and delegateEvent for event
  assert.match(output, /reactiveAttr\([^,]+, "value", \(\) => store\.inputValue\)/)
  assert.match(output, /delegateEvent\([^,]+, "input"/)
})

test('imported array map without plain text bindings uses keyedList', () => {
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

  assert.match(output, /keyedList\(/)
  assert.match(output, /store\.todos/)
})

test('computed imported array maps preserve helper call in keyedList source', () => {
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

  // v2 preserves the helper call in the keyedList source getter
  assert.match(output, /keyedList\(/)
  assert.match(output, /this\.getVisibleItems\(\)/)
})

test('store getter destructuring: template accesses getter through runtime tracking', async () => {
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
    // v2 uses mount with reactive prop getters
    assert.match(output, /mount\(TodoFilters/)
    // The getter values should be accessed through todoStore
    assert.match(output, /todoStore/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('store getter via direct member access compiles to computation', async () => {
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
    // v2 accesses both count and doubled through computation()
    assert.match(output, /computation\(\(\) => counterStore\.count/)
    assert.match(output, /computation\(\(\) => counterStore\.doubled/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('store getter observer refreshes child props via mount reactive props', async () => {
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
    // v2 uses mount with reactive prop getters — no explicit observer methods
    assert.match(output, /mount\(TodoFilters/)
    // The prop should be reactive (a getter function)
    assert.match(output, /count:\s*\(\)\s*=>/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('component class getters that access stores are preserved and used in conditional', () => {
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

  // v2 preserves the getter and uses it in conditional()
  assert.match(output, /get isBoard\(\)/)
  assert.match(output, /routeStore\.path\.startsWith/)
  assert.match(output, /conditional\(/)
  assert.match(output, /this\.isBoard/)
})

test('transitive getter-to-getter deps are preserved as getters, used in conditional', () => {
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

  // v2 preserves all getters and uses them via conditional()
  assert.match(output, /get isBoard\(\)/)
  assert.match(output, /get issueMatch\(\)/)
  assert.match(output, /get showIssueDetail\(\)/)
  assert.match(output, /get issueId\(\)/)
  assert.match(output, /conditional\([^)]+__anchor0, \(\) => this\.isBoard/)
  assert.match(output, /conditional\([^)]+__anchor1, \(\) => this\.showIssueDetail/)
  // issueId should be used in the branch HTML
  assert.match(output, /this\.issueId/)
})

test('component getter reading this.props is preserved with computation', () => {
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

  // v2 preserves the getter and uses computation() to track it
  assert.match(output, /get displayLabel\(\)/)
  assert.match(output, /computation\(\(\) => this\.displayLabel/)
})

test('guard-dependent child component props use mount with reactive getters', () => {
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

  // v2 handles early return guard in [GEA_CREATE_TEMPLATE]()
  assert.match(output, /\[GEA_CREATE_TEMPLATE\]\(\)/)
  assert.match(output, /if \(!projectStore\.project\)/)
  // Child component mounted via mount with reactive props
  assert.match(output, /mount\(Icon/)
  assert.match(output, /type:\s*\(\)\s*=>/)
})

test('store observer for top-level project guard uses early-return in GEA_CREATE_TEMPLATE', () => {
  const output = transformComponentSource(`
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
  `)

  // v2 uses early-return pattern in GEA_CREATE_TEMPLATE
  assert.match(output, /if \(!projectStore\.project\)/)
  assert.match(output, /mount\(Board/)
})

test('store-alias nested field produces computation for reactive text', () => {
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

  // v2 uses computation() for reactive text — store access is inlined
  assert.match(output, /computation\(/)
  assert.match(output, /itemStore\.issue/)
})

test('method call on store field compiles to computation reading the field', async () => {
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

    // v2 uses reactiveAttr for the disabled attribute
    assert.match(output!, /reactiveAttr\(/)
    assert.match(output!, /store\.draft/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('guard-key observer with nested property accesses handles null via early return', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-guard-null-'))
  try {
    const componentPath = join(dir, 'IssueDetails.jsx')
    const storePath = join(dir, 'issue-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
class IssueStore extends Store {
  issue: any = null
  isLoading = false
  get timeRemaining(): number {
    if (!this.issue) return 0
    return Math.max(0, (this.issue.estimate || 0) - (this.issue.timeSpent || 0))
  }
}
export default new IssueStore()`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import issueStore from './issue-store'
        import StatusBadge from './StatusBadge'
        import TimeTracker from './TimeTracker'

        export default class IssueDetails extends Component {
          template() {
            const { isLoading, issue } = issueStore
            if (isLoading || !issue) {
              return <div class="loader">Loading...</div>
            }
            const timeSpent = issue.timeSpent || 0
            const estimate = issue.estimate || 0
            return (
              <div class="issue-details">
                <StatusBadge status={issue.status} />
                <TimeTracker spent={timeSpent} remaining={issueStore.timeRemaining} />
                <span class="estimate">{estimate}h estimated</span>
              </div>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output, 'should produce compiled output')

    // v2 uses early-return guard in [GEA_CREATE_TEMPLATE]()
    assert.match(output!, /\[GEA_CREATE_TEMPLATE\]\(\)/)
    // The guard condition should be present
    assert.match(output!, /isLoading|issueStore/)
    // Child components should use mount
    assert.match(output!, /mount\(StatusBadge/)
    assert.match(output!, /mount\(TimeTracker/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('store observer for nested project.users compiles child props as reactive getters', () => {
  const output = transformComponentSource(`
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
  `)

  // v2 compiles child component with reactive prop getters
  assert.match(output, /mount\(Select/)
  assert.match(output, /projectStore/)
  assert.match(output, /issueStore/)
})
