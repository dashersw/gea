import assert from 'node:assert/strict'
import test from 'node:test'

import { transformSource } from '../src/transform/index.ts'

/**
 * v2 compiler does NOT have a separate SSR mode.
 * These tests verify that transformSource correctly compiles components
 * that reference child components — the v2 equivalent of what SSR/client
 * transforms tested in v1 (child component instantiation vs list builder).
 *
 * In v2, child components in .map() are compiled with mount inside keyedList,
 * and standalone child components are compiled with mount directly.
 */

test('child component in .map() is compiled with mount inside keyedList', () => {
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

  const output = transformSource(source, '/virtual/TodoApp.jsx')

  assert.ok(output, 'should return transformed code')

  // v2 compiles child components in .map() using mount inside keyedList
  assert.ok(
    output.includes('mount'),
    'output should use mount for child component.\nGot:\n' + output,
  )
  assert.ok(
    output.includes('keyedList'),
    'output should use keyedList for .map().\nGot:\n' + output,
  )
  assert.ok(
    output.includes('TodoItem'),
    'output should reference TodoItem component.\nGot:\n' + output,
  )
})

test('standalone child component compiles with mount', () => {
  const source = `
    import { Component } from '@geajs/core'
    import todoStore from './todo-store'
    import Header from './components/Header'

    export default class TodoApp extends Component {
      template() {
        return (
          <div class="todo-app">
            <Header title="My Todos" />
            <p>{todoStore.count} items</p>
          </div>
        )
      }
    }
  `

  const output = transformSource(source, '/virtual/TodoApp.jsx')

  assert.ok(output, 'should return transformed code')

  // v2 compiles standalone child components using mount
  assert.ok(
    output.includes('mount(Header'),
    'output should use mount(Header, ...) for standalone child component.\nGot:\n' + output,
  )
  // Props are passed as thunks
  assert.ok(
    output.includes('title'),
    'output should pass title prop.\nGot:\n' + output,
  )
})
