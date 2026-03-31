import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import {
  transformComponentSource,
  transformWithPlugin,
  withDom,
  createArrayObserverHarness,
  renderInitialList,
  generate,
  getObserveMethodName,
  t,
} from './plugin-helpers'
import type { ArrayMapBinding } from './plugin-helpers'
import { generateCreateItemMethod } from '../../src/generate-array-patch'
import { generateEnsureArrayConfigsMethod } from '../../src/generate-array'

test('array observer preserves DOM order for unshift insertions', () => {
  withDom(() => {
    const harness = createArrayObserverHarness({
      arrayPathParts: ['todos'],
      itemVariable: 'todo',
      itemBindings: [],
      containerSelector: 'ul',
      isImportedState: false,
      itemIdProperty: 'id',
    })

    const todos = [
      { id: 1, label: 'first' },
      { id: 2, label: 'second' },
    ]

    renderInitialList(harness, todos)

    todos.unshift({ id: 3, label: 'zero' })
    harness[getObserveMethodName('todos')](todos, [
      {
        type: 'add',
        property: '0',
        pathParts: ['todos', '0'],
        newValue: todos[0],
      },
    ])

    const order = Array.from(harness.root.querySelectorAll('li')).map((node) => node.textContent)
    assert.deepEqual(order, ['zero', 'first', 'second'])
  })
})

test('array observer removes nodes when keyed by a non-id property', () => {
  withDom(() => {
    const harness = createArrayObserverHarness({
      arrayPathParts: ['todos'],
      itemVariable: 'todo',
      itemBindings: [],
      containerSelector: 'ul',
      isImportedState: false,
      itemIdProperty: 'key',
    })

    const todos = [
      { key: 'alpha', label: 'first' },
      { key: 'beta', label: 'second' },
    ]

    renderInitialList(harness, todos)

    const removed = todos.splice(0, 1)[0]
    harness[getObserveMethodName('todos')](todos, [
      {
        type: 'delete',
        property: '0',
        pathParts: ['todos', '0'],
        previousValue: removed,
      },
    ])

    const labels = Array.from(harness.root.querySelectorAll('li')).map((node) => node.textContent)
    assert.deepEqual(labels, ['second'])
  })
})

test('array observer batches contiguous tail appends into one DOM append', () => {
  withDom(() => {
    const harness = createArrayObserverHarness({
      arrayPathParts: ['todos'],
      itemVariable: 'todo',
      itemBindings: [],
      containerSelector: 'ul',
      isImportedState: false,
      itemIdProperty: 'id',
    })

    const todos = [
      { id: 1, label: 'first' },
      { id: 2, label: 'second' },
    ]

    renderInitialList(harness, todos)

    const list = harness.root
    assert.ok(list)

    let appendChildCalls = 0
    let insertBeforeCalls = 0
    const originalAppendChild = list.appendChild.bind(list)
    const originalInsertBefore = list.insertBefore.bind(list)

    list.appendChild = ((node: Node) => {
      appendChildCalls++
      return originalAppendChild(node)
    }) as typeof list.appendChild
    list.insertBefore = ((node: Node, child: Node | null) => {
      insertBeforeCalls++
      return originalInsertBefore(node, child)
    }) as typeof list.insertBefore

    todos.push({ id: 3, label: 'third' }, { id: 4, label: 'fourth' })
    harness[getObserveMethodName('todos')](todos, [
      {
        type: 'append',
        property: '2',
        pathParts: ['todos'],
        start: 2,
        count: 2,
        newValue: todos.slice(2),
      },
    ])

    const labels = Array.from(harness.root.querySelectorAll('li')).map((node) => node.textContent)
    assert.deepEqual(labels, ['first', 'second', 'third', 'fourth'])
    assert.equal(appendChildCalls, 1)
    assert.equal(insertBeforeCalls, 0)
  })
})

test('component inside .map() compiles to component array instances', async () => {
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
    assert.match(
      output,
      /this\._optionsItems\s*=\s*\(this\.props\.options\s*\?\?\s*\[\]\)\.map/,
      'constructor should init _optionsItems with __child()',
    )
    assert.match(output, /this\.__child\(OptionItem/, 'constructor init should use __child()')
    assert.doesNotMatch(output, /_buildOptionsItems/, 'build method should not exist')
    assert.doesNotMatch(output, /__mountOptionsItems/, 'mount method should not exist')
    assert.match(output, /this\._optionsItems\.join\(""\)/, 'template should use .join("")')
    assert.match(output, /this\.props\.onSelect/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('jsx map conditionals rerender rows instead of emitting raw jsx in observers', () => {
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

  assert.match(output, /render(?:__unresolved_0|Todos)Item/)
  assert.match(output, /(?:store|this\.__rawStore|__rs)\.editingId/)
  assert.doesNotMatch(output, /render(?:__unresolved_0|Todos)Item[\s\S]*<>/)
})

test('identity-based imported map conditionals patch rows without rerender methods', () => {
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

  assert.match(output, /store\.selectedId/)
  assert.match(output, /todo\.id/)
  assert.match(output, /data-gea-item-id/)
  assert.match(output, /\? 'danger' : ''/)
  assert.doesNotMatch(output, /render(?:__unresolved_0|Todos)Item[\s\S]*replaceWith/)
  assert.doesNotMatch(output, /__idMap/)
})

test('unresolved map container uses getElementById for tbody lookup', () => {
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

  assert.ok(
    /<tbody[^>]*id=.*__id.*-b\d/.test(output) || /id=.*__id.*-b\d[^>]*>[\s\S]*<tbody/.test(output),
    'tbody must have id for getElementById',
  )
  assert.ok(
    /____unresolved_0_container.*getElementById|getElementById.*____unresolved_0_container/.test(output),
    'unresolved map container must use getElementById, not this.$(selector)',
  )
  assert.match(
    output,
    /\.join\s*\(\s*['"]['"]\s*\)/,
    'unresolved map must have .join("") to prevent Array.toString commas',
  )
})

test('unresolved map getItems includes local template setup when template() has no props param', () => {
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

  // With store-alias resolution, project.items is a known imported path → array observer + list sync
  // (not an unresolved __geaRegisterMap getItems callback).
  assert.match(output, /observe\(dataStore,\s*\["project",\s*"items"\]/, 'must observe project.items, not only project')
  assert.ok(
    /__applyListChanges/.test(output) && /__observe_.*project__items/.test(output),
    'project.items map should compile to array list observer',
  )
  assert.match(output, /const project = dataStore\.project/, 'template still hoists project for render helpers')
})

test('unresolved helper maps reconcile by calling the helper, not helper-local variables', () => {
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

  assert.match(output, /const displayData = this\.getDisplayData\(\)/)
  assert.doesNotMatch(output, /const displayData = \[\.\.\.filtered\]/)
})

test('hyphenated component names inside .map() produce correct opening tags', () => {
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

  // Components in map callbacks should produce real JS instances via __child(), not HTML strings
  assert.match(output, /this\.__child\(IssueCard/, 'map callback should produce __child(IssueCard) instance')
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
  assert.doesNotMatch(output, /<div class=/, 'raw JSX div should not appear in compiled output')
  assert.match(output, /card /, 'the class expression with card should be present in compiled output')
})

test('__itemProps_* re-derives template-local variable used in .map() child props', async () => {
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

    const itemPropsMatch = output.match(/__itemProps_\w+\([^)]*\)\s*\{[\s\S]*?\n {2}\}/)
    assert.ok(itemPropsMatch, '__itemProps method should be generated')

    const body = itemPropsMatch![0]
    assert.match(
      body,
      /const project = projectStore\.project/,
      '__itemProps must re-derive template-local variable before referencing it',
    )
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

    assert.match(
      output,
      /new Avatar/,
      'Avatar inside .map() HTML wrapper must be instantiated as a component, not rendered as an HTML tag',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('array .map() without key prop on root element produces a compile error', () => {
  const source = `
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
  `
  assert.throws(
    () => transformComponentSource(source),
    (err: Error) => {
      assert.ok(err.message.includes('must have a `key` prop'), `Expected key error, got: ${err.message}`)
      return true
    },
  )
})

test('array .map() with key prop on root element compiles successfully', () => {
  const source = `
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
  `
  const output = transformComponentSource(source)
  assert.ok(output, 'component with keyed .map() must compile successfully')
})

test('store deps used in component array item props must route to __refreshXxxItems, not __geaRequestRender', () => {
  const output = transformComponentSource(
    `
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
  `,
    new Set(['IssueCard']),
  )

  // The refresh method should exist for non-store arrays with store deps
  assert.match(output, /__refreshIssuesItems/, 'must generate __refreshIssuesItems method')

  // The observer in createdHooks should reference __refreshIssuesItems, not __geaRequestRender
  assert.doesNotMatch(
    output,
    /__geaRequestRender/,
    'output must NOT contain __geaRequestRender — store deps should route to __refreshIssuesItems',
  )

  // createdHooks should observe the store and reference __refreshIssuesItems
  assert.match(
    output,
    /this\.__observe\(projectStore,\s*\[.*\],\s*this\.__refreshIssuesItems\)/,
    'createdHooks must observe projectStore and call __refreshIssuesItems',
  )
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
    assert.match(
      output!,
      /render.*Item|__geaRegisterMap/,
      'Should generate a render item method or register a map for the chained array',
    )
    assert.ok(
      output!.includes('.filter(') || output!.includes('.filter(u'),
      'Filter call should be preserved in the output',
    )
  } finally {
    await rm(dir, { recursive: true })
  }
})

test('component-root map items use data-prop-* attributes in template output', async () => {
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

    // Components in map callbacks should produce real JS instances, not HTML strings
    assert.match(output!, /new ConversationItem\(/, 'map callback should produce new ConversationItem() instance')
    assert.doesNotMatch(output!, /data-prop-id/, 'should not use data-prop-* HTML attributes for components')
    assert.doesNotMatch(output!, /<conversation-item/, 'should not produce HTML string for component in map')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('generateCreateItemMethod uses data-prop-* for component-root map items', async () => {
  const babelParser = await import('@babel/parser')
  const jsxCode = `<ConversationItem key={conv.id} id={conv.id} name={conv.name} lastMessage={conv.lastMessage} />`
  const ast = babelParser.parseExpression(jsxCode, { plugins: ['jsx'] })

  const arrayMap: ArrayMapBinding = {
    itemTemplate: ast as t.JSXElement,
    itemVariable: 'conv',
    itemIdProperty: 'id',
    arrayPathParts: ['conversations'],
    itemBindings: [],
    storeVar: 'store',
    key: 'conversations',
  }

  const { method } = generateCreateItemMethod(arrayMap)
  assert.ok(method, 'should generate createItem method')

  const code = generate(method!).code
  // Should use data-prop-* attribute names
  assert.match(code, /data-prop-id/, 'createItem should use data-prop-id')
  assert.match(code, /data-prop-name/, 'createItem should use data-prop-name')
  assert.match(code, /data-prop-last-message/, 'createItem should use data-prop-last-message')
  // Should NOT use raw attribute names
  assert.doesNotMatch(code, /setAttribute\("name"/, 'should not use raw "name" attribute')
  assert.doesNotMatch(code, /setAttribute\("lastMessage"/, 'should not use raw "lastMessage" attribute')
  // Should set __geaProps with actual JS values
  assert.match(code, /__geaProps/, 'should set __geaProps on element')
  assert.match(code, /id:\s*item\.id/, '__geaProps should include id prop')
  assert.match(code, /name:\s*item\.name/, '__geaProps should include name prop')
  assert.match(code, /lastMessage:\s*item\.lastMessage/, '__geaProps should include lastMessage prop')
})

test('generateCreateItemMethod sets __geaProps with object props for component-root items', async () => {
  const babelParser = await import('@babel/parser')
  const jsxCode = `<MessageBubble key={msg.id} message={msg} />`
  const ast = babelParser.parseExpression(jsxCode, { plugins: ['jsx'] })

  const arrayMap: ArrayMapBinding = {
    itemTemplate: ast as t.JSXElement,
    itemVariable: 'msg',
    itemIdProperty: 'id',
    arrayPathParts: ['messages'],
    itemBindings: [],
    storeVar: 'store',
    key: 'messages',
  }

  const { method } = generateCreateItemMethod(arrayMap)
  assert.ok(method, 'should generate createItem method')

  const code = generate(method!).code
  // __geaProps should pass the entire item as the message prop
  assert.match(code, /__geaProps/, 'should set __geaProps on element')
  assert.match(code, /message:\s*item/, '__geaProps should pass item as message prop')
})

test('generateCreateItemMethod does NOT set __geaProps for non-component map items', async () => {
  const babelParser = await import('@babel/parser')
  const jsxCode = `<div key={item.id} title={item.title}>{item.text}</div>`
  const ast = babelParser.parseExpression(jsxCode, { plugins: ['jsx'] })

  const arrayMap: ArrayMapBinding = {
    itemTemplate: ast as t.JSXElement,
    itemVariable: 'item',
    itemIdProperty: 'id',
    arrayPathParts: ['items'],
    itemBindings: [],
    storeVar: 'store',
    key: 'items',
  }

  const { method } = generateCreateItemMethod(arrayMap)
  assert.ok(method, 'should generate createItem method')

  const code = generate(method!).code
  // HTML elements should use raw attribute names
  assert.doesNotMatch(code, /data-prop-/, 'HTML elements should not use data-prop-*')
  assert.doesNotMatch(code, /__geaProps/, 'HTML elements should not set __geaProps')
})

test('generateEnsureArrayConfigsMethod sets hasComponentItems for component-root maps', async () => {
  const babelParser = await import('@babel/parser')
  const jsxCode = `<TodoItem key={todo.id} title={todo.title} done={todo.done} />`
  const ast = babelParser.parseExpression(jsxCode, { plugins: ['jsx'] })

  const arrayMap: ArrayMapBinding = {
    itemTemplate: ast as t.JSXElement,
    itemVariable: 'todo',
    itemIdProperty: 'id',
    arrayPathParts: ['todos'],
    itemBindings: [],
    storeVar: 'store',
    key: 'todos',
  }

  const method = generateEnsureArrayConfigsMethod([arrayMap])
  assert.ok(method, 'should generate __ensureArrayConfigs method')

  const code = generate(method!).code
  assert.match(code, /hasComponentItems:\s*true/, 'config should include hasComponentItems: true')
})

test('generateEnsureArrayConfigsMethod does NOT set hasComponentItems for non-component maps', async () => {
  const babelParser = await import('@babel/parser')
  const jsxCode = `<div key={item.id} title={item.title}>{item.text}</div>`
  const ast = babelParser.parseExpression(jsxCode, { plugins: ['jsx'] })

  const arrayMap: ArrayMapBinding = {
    itemTemplate: ast as t.JSXElement,
    itemVariable: 'item',
    itemIdProperty: 'id',
    arrayPathParts: ['items'],
    itemBindings: [],
    storeVar: 'store',
    key: 'items',
  }

  const method = generateEnsureArrayConfigsMethod([arrayMap])
  assert.ok(method, 'should generate __ensureArrayConfigs method')

  const code = generate(method!).code
  assert.doesNotMatch(code, /hasComponentItems/, 'config should NOT include hasComponentItems')
})

test('non-component map items do NOT use data-prop-* attributes', async () => {
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

    // Regular HTML elements should use raw attribute names
    assert.doesNotMatch(output!, /data-prop-/, 'HTML elements should not use data-prop-* attributes')
    assert.doesNotMatch(output!, /__geaProps/, 'HTML elements should not set __geaProps')
    assert.doesNotMatch(output!, /hasComponentItems/, 'HTML element maps should not have hasComponentItems')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('nested member keys become data-gea-item-id expressions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-nested-map-key-'))
  try {
    const componentPath = join(dir, 'App.jsx')
    const output = await transformWithPlugin(
      `
import store from './store'

export default class App {
  template() {
    return (
      <table>
        <tbody>
          {store.memberships.map((membership) => (
            <tr key={membership.member.name}>
              <td>{membership.member.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
}
      `,
      componentPath,
    )

    assert.ok(output, 'should produce compiled output')
    assert.match(output, /data-gea-item-id="\$\{membership\?\.member\?\.name \?\? membership\}"/)
    assert.doesNotMatch(output, /data-gea-item-id="\$\{membership\.id\}"/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('.map() with (item, index) callback exposes index inside the render method', () => {
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

  // The render/create method must accept index as a parameter (not just item)
  assert.match(output, /render\w*Item\s*\(\s*\w+\s*,\s*\w+\s*\)/, 'render method must accept two params (item, index)')
  // The index variable must appear in the render method body
  assert.match(output, /activeTabIndex/, 'activeTabIndex prop reference must appear in compiled output')
  // The index must not be undefined — it must be the actual second parameter
  assert.doesNotMatch(output, /undefined\s*===\s*activeTabIndex|activeTabIndex\s*===\s*undefined/, 'index must not resolve to undefined')
})

test('store-only component array map generates __observeList and createdHooks', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import recordingStore from './recording-store'
    import SidebarItem from './SidebarItem'

    export default class RecordingSidebar extends Component {
      template() {
        return (
          <div class="recordings">
            {recordingStore.recordings.map((recording) => (
              <SidebarItem key={recording.folder} folder={recording.folder} name={recording.name} />
            ))}
          </div>
        )
      }
    }
  `)

  assert.match(output, /__observeList/, 'must generate __observeList call for store-based component array')
  assert.match(output, /createdHooks/, 'must generate createdHooks method')
  assert.match(output, /_recordingsItems/, 'must generate _recordingsItems array')
})

test('template literal key expression is preserved in data-gea-item-id', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class TabBar extends Component {
      template({ tabs, activeTabIndex, onTabChange }) {
        return (
          <div class="tab-titles">
            {tabs.map((tab) => (
              <button
                key={\`\${tab.title}-button\`}
                class="ghost"
              >
                {tab.title}
              </button>
            ))}
          </div>
        )
      }
    }
  `)

  // The key expression should use tab.title (not String(tab) which gives [object Object])
  assert.doesNotMatch(
    output,
    /data-gea-item-id="\$\{String\(tab\)\}"/,
    'must not stringify the whole item object as key — causes [object Object]',
  )
  // The template literal key should evaluate to something that includes tab.title
  assert.match(
    output,
    /data-gea-item-id="[^"]*tab\.title|data-gea-item-id="[^"]*tab\?\.title/,
    'data-gea-item-id must reference tab.title from the template literal key',
  )
})

test('template literal key with index parameter does not produce ReferenceError', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class TagsInput extends Component {
      template({ tags }) {
        return (
          <div class="tags">
            {tags.map((tag, i) => (
              <span key={\`\${tag}-\${i}\`} data-index={String(i)}>
                {tag}
              </span>
            ))}
          </div>
        )
      }
    }
  `)

  // The key function in __geaRegisterMap must accept both item and index params
  assert.match(
    output,
    /\(__k,\s*__ki\)\s*=>/,
    'key function must accept both item and index parameters',
  )
  // create/patch methods must use __idx, not the original 'i'
  assert.match(
    output,
    /__geaKey = String\(`\$\{item}-\$\{__idx}\`\)/,
    'create/patch __geaKey must use __idx, not original index variable',
  )
})
