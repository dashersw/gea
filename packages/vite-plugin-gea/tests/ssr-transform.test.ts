import assert from 'node:assert/strict'
import test from 'node:test'

import { transformFile } from '../src/closure-codegen/transform.ts'

test('root component in .map() compiles into inline keyed-list mounting', () => {
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

  const output = transformFile(source, '/virtual/test-component.jsx')

  assert.equal(output.changed, true)
  assert.deepEqual(output.rewritten, ['TodoApp'])
  assert.doesNotMatch(output.code, /keyedListSimple\(/)
  assert.doesNotMatch(output.code, /keyedList\(/)
  assert.doesNotMatch(output.code, /_rescue/)
  assert.match(output.code, /mount\(TodoItem/)
  assert.doesNotMatch(output.code, /const __kl_key =/)
  assert.match(output.code, /__kl_byKey\.get\(arr\[i\]\.id\)/)
})
