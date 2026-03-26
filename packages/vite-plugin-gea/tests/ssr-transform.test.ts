import assert from 'node:assert/strict'
import test from 'node:test'

import babelGenerator from '@babel/generator'
import { parseSource } from '../src/parse'
import { transformComponentFile } from '../src/transform-component'

const generate = 'default' in babelGenerator ? babelGenerator.default : babelGenerator

function transformComponentSSR(source: string, knownComponentImports?: Set<string>): string {
  const parsed = parseSource(source)
  assert.ok(parsed)
  assert.ok(parsed.componentClassName)

  const original = parseSource(source)
  assert.ok(original)
  const storeImports = new Map<string, string>()

  parsed.imports.forEach((importSource, localName) => {
    if (parsed.importKinds.get(localName) !== 'default') return
    if (/store/i.test(importSource)) storeImports.set(localName, importSource)
  })

  const transformed = transformComponentFile(
    parsed.ast,
    parsed.imports,
    storeImports,
    parsed.componentClassName,
    '/virtual/test-component.jsx',
    original.ast,
    new Set(),
    knownComponentImports,
    true, // ssr = true
  )

  assert.equal(transformed, true)
  return generate(parsed.ast).code
}

function transformComponentClient(source: string, knownComponentImports?: Set<string>): string {
  const parsed = parseSource(source)
  assert.ok(parsed)
  assert.ok(parsed.componentClassName)

  const original = parseSource(source)
  assert.ok(original)
  const storeImports = new Map<string, string>()

  parsed.imports.forEach((importSource, localName) => {
    if (parsed.importKinds.get(localName) !== 'default') return
    if (/store/i.test(importSource)) storeImports.set(localName, importSource)
  })

  const transformed = transformComponentFile(
    parsed.ast,
    parsed.imports,
    storeImports,
    parsed.componentClassName,
    '/virtual/test-component.jsx',
    original.ast,
    new Set(),
    knownComponentImports,
    false, // ssr = false
  )

  assert.equal(transformed, true)
  return generate(parsed.ast).code
}

test('SSR: root component in .map() is instantiated inline for server rendering', () => {
  const source = `
    import { Component } from '@geajs/core'
    import todoStore from './todo-store'
    import TodoItem from './components/TodoItem'

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
  `

  const output = transformComponentSSR(source)

  // SSR must instantiate components so template() runs and produces HTML
  assert.ok(
    output.includes('new TodoItem'),
    'SSR output should instantiate TodoItem for server rendering.\nGot:\n' + output,
  )
})

test('Client: root component in .map() compiles into list builder for reconciliation', () => {
  const source = `
    import { Component } from '@geajs/core'
    import todoStore from './todo-store'
    import TodoItem from './components/TodoItem'

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
  `

  const output = transformComponentClient(source)

  // Client compiler builds list items via compiled child pattern, not custom element tags
  assert.ok(
    output.includes('_buildTodosItems') || output.includes('__itemProps_todos'),
    'Client output should compile map children into list builder.\nGot:\n' + output,
  )
})
