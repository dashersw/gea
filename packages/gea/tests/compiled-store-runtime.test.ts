import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { _plain, CompiledLeanStore } from '../src/runtime/compiled-lean-store'
import { CompiledStore } from '../src/runtime/compiled-store'

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('CompiledLeanStore runtime semantics', () => {
  it('exports the tracked-proxy plain-value v1 browser fallback', () => {
    class Nominal {}
    const raw = { value: 1 }
    const proxy = new Proxy(raw, {})
    const nullPrototype = Object.create(null) as Record<string, unknown>

    assert.equal(_plain(raw), true)
    assert.equal(_plain(proxy), true)
    assert.equal(_plain(nullPrototype), true)
    assert.equal(_plain([]), true)
    assert.equal(_plain(new Nominal()), false)
    assert.equal(_plain(null), false)
    assert.equal(_plain('value'), false)
  })

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

describe('compiled stores return class values unbound (#133)', () => {
  class Home {
    static title = 'Home page'
  }

  for (const [label, Base] of [
    ['CompiledLeanStore', CompiledLeanStore],
    ['CompiledStore', CompiledStore],
  ] as const) {
    it(`${label} returns a class read from a field or a getter as the class itself`, () => {
      class ViewStore extends Base {
        view: unknown = Home
        get current() {
          return this.view
        }
      }

      const store = new ViewStore() as any
      for (const prop of ['view', 'current']) {
        const value = store[prop]
        assert.equal(value, Home, prop)
        assert.equal(store[prop], value, prop)
        assert.equal(value.name, 'Home', prop)
        assert.equal(value.title, 'Home page', prop)
      }
    })

    it(`${label} still binds methods to the store`, async () => {
      class CounterStore extends Base {
        count = 0
        inc(): void {
          this.count++
        }
      }

      const store = new CounterStore() as any
      const seen: number[] = []
      store.observe('count', (value: number) => seen.push(value))
      const { inc } = store
      inc()
      await flush()

      assert.equal(store.count, 1)
      assert.deepEqual(seen, [1])
    })
  }
})
