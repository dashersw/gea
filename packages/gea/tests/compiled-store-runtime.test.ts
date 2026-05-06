import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CompiledLeanStore } from '../src/runtime/compiled-lean-store'
import { CompiledStore } from '../src/runtime/compiled-store'

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('CompiledLeanStore runtime semantics', () => {
  it('keeps nested array proxies scoped by root prop when a getter aliases an array', async () => {
    class TodoStore extends CompiledLeanStore {
      todos = [{ id: 'a', done: false }]
      filter = 'all'

      add(): void {
        this.todos.push({ id: 'b', done: false })
      }

      get filteredTodos() {
        if (this.filter === 'active') return this.todos.filter((todo) => !todo.done)
        return this.todos
      }
    }

    const store = new TodoStore() as any
    assert.equal(store.filteredTodos.length, 1)

    let todosFired = 0
    let filteredFired = 0
    store.observe('todos', (_value: unknown, changes: Array<Record<string, unknown>>) => {
      todosFired++
      assert.equal(changes[0].prop, 'todos')
    })
    store.observe('filteredTodos', (value: Array<unknown>) => {
      filteredFired++
      assert.equal(value.length, 2)
    })

    store.add()
    await flush()

    assert.equal(todosFired, 1)
    assert.equal(filteredFired, 1)
    assert.equal(store.todos.length, 2)
  })

  it('supports root observers', async () => {
    class ExampleStore extends CompiledLeanStore {
      value = 1
    }

    const store = new ExampleStore() as any
    const props: string[] = []
    store.observe('', (_value: unknown, changes: Array<{ prop: string }>) => {
      for (const change of changes) props.push(change.prop)
    })

    store.value = 2
    await flush()

    assert.deepEqual(props, ['value'])
  })

  it('continues a batch after one observer in a multi-observer bucket throws', async () => {
    class ExampleStore extends CompiledLeanStore {
      value = 1
      other = 1
    }

    const store = new ExampleStore() as any
    const seen: string[] = []
    store.observe('value', () => {
      throw new Error('boom')
    })
    store.observe('value', () => {
      seen.push('value')
    })
    store.observe('other', () => {
      seen.push('other')
    })

    store.value = 2
    store.other = 2
    await flush()

    assert.deepEqual(seen, ['value', 'other'])
  })
})

describe('CompiledStore runtime semantics', () => {
  it('notifies derived observers from underlying root-array mutations', async () => {
    class CountStore extends CompiledStore {
      items = [1]

      add(): void {
        this.items.push(2)
      }

      get count() {
        return this.items.length
      }
    }

    const store = new CountStore() as any
    const seen: number[] = []
    store.observe('count', (value: number) => {
      seen.push(value)
    })

    store.add()
    await flush()

    assert.deepEqual(seen, [2])
  })

  it('supports root observers without a same-prop observer', async () => {
    class ExampleStore extends CompiledStore {
      value = 1
    }

    const store = new ExampleStore() as any
    const props: string[] = []
    store.observe('', (_value: unknown, changes: Array<{ prop: string }>) => {
      for (const change of changes) props.push(change.prop)
    })

    store.value = 2
    await flush()

    assert.deepEqual(props, ['value'])
  })

  it('continues a batch after one observer in a multi-observer bucket throws', async () => {
    class ExampleStore extends CompiledStore {
      value = 1
      other = 1
    }

    const store = new ExampleStore() as any
    const seen: string[] = []
    store.observe('value', () => {
      throw new Error('boom')
    })
    store.observe('value', () => {
      seen.push('value')
    })
    store.observe('other', () => {
      seen.push('other')
    })

    store.value = 2
    store.other = 2
    await flush()

    assert.deepEqual(seen, ['value', 'other'])
  })
})
