/**
 * Mapped list compilation regression tests — v2 edition.
 *
 * In v2, array .map() rendering uses `keyedList()` from `@geajs/core/runtime`.
 * There are no `createArrayObserverHarness`, `renderInitialList`,
 * `generateCreateItemMethod`, or `generateEnsureArrayConfigsMethod` helpers.
 * The DOM reconciliation is handled entirely by the runtime `keyedList()` helper.
 *
 * These tests verify the compiled output produces the correct v2 runtime calls.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { transformComponentSource, transformWithPlugin } from './plugin-helpers'

test('store array .map() compiles to keyedList with item factory', () => {
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
  assert.match(output, /\(\) => store\.todos/)
  assert.match(output, /todo => todo\.id/)
  assert.match(output, /__itemGetter/)
})

test('self-state array .map() compiles to keyedList', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class ItemList extends Component {
      constructor() {
        super()
        this.items = []
      }

      template() {
        return (
          <ul>
            {this.items.map(item => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        )
      }
    }
  `)

  assert.match(output, /keyedList\(/)
  assert.match(output, /\(\) => this\.items/)
})

test('component inside .map() compiles to mount in keyedList factory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-func-prop-'))
  try {
    const componentPath = join(dir, 'OptionStep.jsx')
    const output = await transformWithPlugin(
      `
import OptionItem from './OptionItem'

export default function OptionStep({ options, onSelect }) {
  return (
    <div>
      {options.map(opt => (
        <OptionItem key={opt.id} onSelect={() => onSelect(opt.id)} />
      ))}
    </div>
  )
}
      `,
      componentPath,
    )
    assert.ok(output)
    // v2 uses keyedList + mount for component items
    assert.match(output, /keyedList\(/)
    assert.match(output, /mount\(OptionItem/)
    assert.match(output, /__props\.onSelect/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('jsx map conditionals inside items compile correctly', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <div>
            {store.todos.map(todo => (
              <div key={todo.id}>
                {store.editingId === todo.id ? (
                  <>
                    <input value={store.editingValue} />
                    <button click={() => store.updateTodo(todo)}>Save</button>
                  </>
                ) : (
                  <>
                    <span>{todo.text}</span>
                    <button click={() => store.startEditing(todo)}>Edit</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )
      }
    }
  `)

  assert.match(output, /keyedList\(/)
  assert.match(output, /store\.editingId/)
})

test('identity-based imported map conditionals in keyedList produce selectorAttr', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <table>
            <tbody id="tbody">
              {store.todos.map(todo => (
                <tr key={todo.id} class={store.selectedId === todo.id ? 'danger' : ''}>
                  <td>{todo.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    }
  `)

  assert.match(output, /keyedList\(/)
  // v2 uses selectorAttr for identity-based class comparisons in map items
  assert.match(output, /selectorAttr\(/)
  assert.match(output, /selectedId/)
  assert.match(output, /danger/)
})

test('unresolved map: helper-based array compiles to keyedList with helper call', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './data-grid-store'

    export default class DataGrid extends Component {
      getDisplayData() {
        return store.data.filter(() => true)
      }
      template() {
        const displayData = this.getDisplayData()
        return (
          <div class="data-grid">
            <table>
              <tbody>
                {displayData.map(item => (
                  <tr key={item.id}><td>{item.id}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    }
  `)

  assert.match(output, /keyedList\(/)
  assert.match(output, /this\.getDisplayData\(\)/)
})

test('unresolved map getItems includes local template setup', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import dataStore from './data-store'

    export default class List extends Component {
      template() {
        const project = dataStore.project
        return (
          <ul>
            {project.items.map(item => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        )
      }
    }
  `)

  // v2 uses keyedList with store access
  assert.match(output, /keyedList\(/)
  assert.match(output, /dataStore\.project/)
})

test('unresolved helper maps preserve the helper call, not helper-local variables', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './grid-store'

    export default class DataGrid extends Component {
      getDisplayData() {
        const filtered = store.data.filter(item => item.visible)
        const sortBy = store.sortBy
        return [...filtered].sort((a, b) => sortBy === 'id' ? a.id - b.id : 0)
      }

      template() {
        const displayData = this.getDisplayData()
        return (
          <table>
            <tbody>
              {displayData.map(item => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    }
  `)

  assert.match(output, /this\.getDisplayData\(\)/)
  assert.doesNotMatch(output, /const displayData = \[\.\.\.filtered\]/)
})

test('component in map produces mount, not HTML string tag', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'
    import IssueCard from './IssueCard.jsx'

    export default class Board extends Component {
      template() {
        return (
          <div>
            {store.todos.map(issue => (
              <IssueCard key={issue.id} title={issue.text} />
            ))}
          </div>
        )
      }
    }
  `)

  assert.match(output, /mount\(IssueCard/, 'map callback should produce mount(IssueCard)')
  assert.doesNotMatch(output, /<issue-card/, 'should not produce HTML string for component in map')
})

test('&& guarded .map() with components does not leave raw JSX in compiled output', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'
    import CommentItem from './CommentItem.jsx'

    export default class IssueDetails extends Component {
      template() {
        return (
          <div>
            {store.todos && store.todos.map((c) => (
              <CommentItem key={c.id} body={c.text} />
            ))}
          </div>
        )
      }
    }
  `)

  assert.doesNotMatch(output, /<CommentItem/, 'raw JSX <CommentItem> must not appear anywhere in compiled output')
  assert.match(output, /mount\(CommentItem/)
})

test('complex conditional chains inside .map() item attributes compile correctly', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class CardList extends Component {
      template() {
        return (
          <div>
            {store.items.map((item) => (
              <div key={item.id} class={\`card \${item.a && item.b ? (item.c ? 'x' : 'y') : 'z'}\`}>
                {item.label}
              </div>
            ))}
          </div>
        )
      }
    }
  `)

  assert.doesNotMatch(output, /SyntaxError/, 'compiled output must not contain syntax errors')
  assert.match(output, /keyedList\(/)
  assert.match(output, /card /, 'the class expression with card should be present in compiled output')
})

test('__itemProps guard: template-local variable from store is re-derived in reactive prop getter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-itemprops-guard-'))

  try {
    const componentPath = join(dir, 'Board.jsx')
    const storePath = join(dir, 'project-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class ProjectStore extends Store {
  project = null as any
}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import projectStore from './project-store'
        import BoardColumn from './BoardColumn.jsx'

        const statusList = [{ id: 'backlog' }, { id: 'todo' }, { id: 'in-progress' }]

        export default class Board extends Component {
          template() {
            const project = projectStore.project

            if (!project) return <div>Loading...</div>

            return (
              <div>
                {statusList.map(col => (
                  <BoardColumn key={col.id} status={col.id} issues={project.issues} />
                ))}
              </div>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)

    // v2: reactive prop getters should reference projectStore.project for reactive access
    assert.match(output, /keyedList\(/)
    assert.match(output, /projectStore\.project/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('component inside .map() with HTML wrapper compiles correctly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-map-html-wrap-'))

  try {
    const componentPath = join(dir, 'Board.jsx')
    const storePath = join(dir, 'project-store.ts')
    const filtersStorePath = join(dir, 'filters-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'\nexport default class ProjectStore extends Store {\n  project = null as any\n}`,
    )
    await writeFile(
      filtersStorePath,
      `import { Store } from '@geajs/core'\nexport default class FiltersStore extends Store {\n  userIds = [] as string[]\n  toggleUserId(id: string) {}\n}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import projectStore from './project-store'
        import filtersStore from './filters-store'
        import Avatar from './Avatar.jsx'

        export default class Board extends Component {
          template() {
            const project = projectStore.project
            if (!project) return <div></div>

            return (
              <div>
                <div class="avatars">
                  {project.users.map((user: any) => (
                    <div
                      key={user.id}
                      class={\`avatar \${filtersStore.userIds.includes(user.id) ? 'active' : ''}\`}
                      click={() => filtersStore.toggleUserId(user.id)}
                    >
                      <Avatar avatarUrl={user.avatarUrl} name={user.name} size={32} />
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output, 'should produce compiled output')

    // v2 uses mount for Avatar component inside map HTML wrapper
    assert.match(output, /mount\(Avatar/, 'Avatar inside .map() HTML wrapper must be instantiated via mount')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('array .map() without key prop falls back to reactiveContent', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class ItemList extends Component {
      template() {
        return (
          <ul>
            {this.items.map(item => (
              <li>{item.label}</li>
            ))}
          </ul>
        )
      }
    }
  `)
  // v2 does not throw — it falls back to reactiveContent for unkeyable maps
  assert.match(output, /reactiveContent\(/, 'unkeyable map should use reactiveContent')
  assert.doesNotMatch(output, /keyedList\(/, 'unkeyable map should NOT use keyedList')
})

test('array .map() with key prop compiles to keyedList', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class ItemList extends Component {
      template() {
        return (
          <ul>
            {this.items.map(item => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        )
      }
    }
  `)
  assert.ok(output, 'component with keyed .map() must compile successfully')
  assert.match(output, /keyedList\(/)
})

test('store deps used in component array item props produce reactive getters via mount', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import IssueCard from './IssueCard'

    function resolveAssignees(issue, users) {
      return (issue.userIds || []).map(uid => users.find(u => u.id === uid)).filter(Boolean)
    }

    export default class BoardColumn extends Component {
      template({ status, issues = [] }) {
        const project = projectStore.project
        const users = project ? project.users : []
        return (
          <div class="board-list">
            <div class="board-list-issues">
              {issues.map(issue => (
                <IssueCard
                  key={issue.id}
                  issueId={issue.id}
                  title={issue.title}
                  assignees={resolveAssignees(issue, users)}
                />
              ))}
            </div>
          </div>
        )
      }
    }
  `)

  // v2 uses keyedList with mount, reactive props reference store
  assert.match(output, /keyedList\(/)
  assert.match(output, /mount\(IssueCard/)
  assert.match(output, /projectStore\.project/)
})

test('chained .filter().map() resolves store path for reactivity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-chain-test-'))
  try {
    const storePath = join(dir, 'store.ts')
    await writeFile(storePath, 'export default { users: [{ id: 1, name: "Alice", active: true }] }')
    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class UserList extends Component {
          template() {
            return (
              <ul>
                {store.users.filter(u => u.active).map(u => (
                  <li key={u.id}>{u.name}</li>
                ))}
              </ul>
            )
          }
        }
      `,
      storePath.replace('store.ts', 'UserList.tsx'),
    )
    assert.ok(output, 'Should compile without errors')
    assert.match(output!, /keyedList\(/, 'Should use keyedList for chained array')
    assert.ok(output!.includes('.filter('), 'Filter call should be preserved in the output')
  } finally {
    await rm(dir, { recursive: true })
  }
})

test('component-root map items use mount, not data-prop-* attributes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-comp-map-'))
  try {
    const componentPath = join(dir, 'App.jsx')
    const output = await transformWithPlugin(
      `
import ConversationItem from './ConversationItem'
import store from './store'

export default class App {
  template() {
    return (
      <div>
        {store.conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            id={conv.id}
            name={conv.name}
            lastMessage={conv.lastMessage}
          />
        ))}
      </div>
    )
  }
}
      `,
      componentPath,
    )
    assert.ok(output, 'should produce compiled output')

    // v2 uses mount for component items — no data-prop-* attributes
    assert.match(output!, /mount\(ConversationItem/, 'map callback should produce mount(ConversationItem)')
    assert.doesNotMatch(output!, /data-prop-id/, 'should not use data-prop-* HTML attributes for components')
    assert.doesNotMatch(output!, /<conversation-item/, 'should not produce HTML string for component in map')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('non-component map items do NOT produce mount', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-html-map-'))
  try {
    const componentPath = join(dir, 'App.jsx')
    const output = await transformWithPlugin(
      `
import store from './store'

export default class App {
  template() {
    return (
      <div>
        {store.items.map((item) => (
          <div key={item.id} class={item.className} title={item.title}>
            {item.text}
          </div>
        ))}
      </div>
    )
  }
}
      `,
      componentPath,
    )
    assert.ok(output, 'should produce compiled output')

    // Regular HTML elements in map should use template() + cloning, not mount
    assert.doesNotMatch(output!, /mount\(/, 'HTML elements should not use mount')
    assert.match(output!, /keyedList\(/, 'should use keyedList')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('.map() with (item, index) callback exposes index inside the keyedList factory', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './tab-store'

    export default class TabBar extends Component {
      template({ activeTabIndex, onTabChange }) {
        return (
          <div class="tab-titles">
            {store.tabs.map((tab, index) => (
              <button
                key={tab.id}
                class={\`ghost \${index === activeTabIndex ? "active" : ""}\`}
                click={() => onTabChange(index)}
              >
                {tab.title}
              </button>
            ))}
          </div>
        )
      }
    }
  `)

  // v2 uses __indexGetter for the second parameter
  assert.match(output, /__indexGetter/, 'keyedList factory must accept index getter')
  assert.doesNotMatch(output, /const index = __indexGetter\(\)/, 'index must NOT be captured as const (stale closure)')
  assert.match(output, /__props\.activeTabIndex/, 'activeTabIndex prop reference must appear in compiled output')
  assert.match(output, /onTabChange\(__indexGetter\(\)\)/, 'event handler must call __indexGetter() dynamically')
})
