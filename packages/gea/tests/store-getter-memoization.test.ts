import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../src/lib/store'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

class TodoStore extends Store {
  todos: { done: boolean; text: string }[] = []
  filter: string = 'all'

  get filteredTodos() {
    if (this.filter === 'done') return this.todos.filter((t) => t.done)
    if (this.filter === 'active') return this.todos.filter((t) => !t.done)
    return this.todos
  }

  get count() {
    return this.todos.length
  }
}

class ChainedStore extends Store {
  items: number[] = [1, 2, 3, 4, 5]

  get evens() {
    return this.items.filter((n) => n % 2 === 0)
  }

  get evenCount() {
    return this.evens.length
  }
}

describe('Store getter memoization', () => {
  it('returns the same value on repeated access', () => {
    const store = new TodoStore()
    store.todos = [{ done: false, text: 'a' }]
    const first = store.filteredTodos
    const second = store.filteredTodos
    assert.equal(first, second, 'repeated access should return same cached reference')
  })

  it('invalidates cache when a direct dependency changes', () => {
    const store = new TodoStore()
    store.todos = [{ done: false, text: 'a' }, { done: true, text: 'b' }]
    store.filter = 'done'
    const before = store.filteredTodos
    assert.equal(before.length, 1)

    store.filter = 'active'
    const after = store.filteredTodos
    assert.equal(after.length, 1)
    assert.notEqual(before, after, 'cache should be invalidated after dependency change')
  })

  it('recomputes correctly after array mutation', async () => {
    const store = new TodoStore()
    store.todos = []
    assert.equal(store.count, 0)

    store.todos = [{ done: false, text: 'x' }]
    assert.equal(store.count, 1)
  })

  it('handles chained getters (getter depending on getter)', () => {
    const store = new ChainedStore()
    const firstEvenCount = store.evenCount
    assert.equal(firstEvenCount, 2)

    // Access again — should return cached
    assert.equal(store.evenCount, 2)

    // Change items — both evens and evenCount caches should invalidate
    store.items = [1, 2, 3, 4, 5, 6]
    const newEvenCount = store.evenCount
    assert.equal(newEvenCount, 3)
  })

  it('does not share cache between different store instances', () => {
    const a = new TodoStore()
    const b = new TodoStore()
    a.todos = [{ done: false, text: 'a' }]
    b.todos = []

    assert.equal(a.count, 1)
    assert.equal(b.count, 0)

    a.todos = []
    assert.equal(a.count, 0)
    assert.equal(b.count, 0)
  })

  it('tracks computation count', () => {
    let calls = 0
    class CountStore extends Store {
      value = 42
      get doubled() {
        calls++
        return this.value * 2
      }
    }

    const store = new CountStore()
    assert.equal(store.doubled, 84)
    assert.equal(store.doubled, 84)
    assert.equal(store.doubled, 84)
    assert.equal(calls, 1, 'getter should only be computed once when deps do not change')

    store.value = 10
    assert.equal(store.doubled, 20)
    assert.equal(calls, 2, 'getter should recompute after dependency change')

    store.value = 10 // same value
    // rootSetValue skips unchanged primitives, so no invalidation
    assert.equal(store.doubled, 20)
    assert.equal(calls, 2, 'getter should NOT recompute when value is unchanged')
  })

  it('handles push() mutation invalidating getter cache', async () => {
    class ListStore extends Store {
      items: number[] = []
      get total() {
        return this.items.reduce((s, n) => s + n, 0)
      }
    }
    const store = new ListStore()
    assert.equal(store.total, 0)
    store.items.push(5)
    await flush()
    assert.equal(store.total, 5)
  })
})

describe('Store getter memoization – uncacheable getters', () => {
  it('does not cache getter that reads an internal (_-prefixed) field', () => {
    let calls = 0
    class MixedStore extends Store {
      value = 5
      _factor = 2  // internal, starts with _
      get total() {
        calls++
        return this.value * (this as any)._factor
      }
    }
    const store = new MixedStore()
    assert.equal(store.total, 10)
    assert.equal(store.total, 10)
    // Each access must recompute because _factor is untrackable
    assert.equal(calls, 2, 'getter reading internal field must not be cached')

    ;(store as any)._factor = 3
    assert.equal(store.total, 15, 'updated value when _factor changes')
  })

  it('does not cache getter that calls a function-valued own property', () => {
    let calls = 0
    class FnStore extends Store {
      value = 5
      multiply = (x: number) => x * 2
      get doubled() {
        calls++
        return this.multiply(this.value)
      }
    }
    const store = new FnStore()
    assert.equal(store.doubled, 10)
    assert.equal(store.doubled, 10)
    // Function-valued field reads prevent caching
    assert.equal(calls, 2, 'getter calling function field must not be cached')
  })

  it('marks parent getter uncacheable when child getter is uncacheable', () => {
    let childCalls = 0
    class ChainedUncacheable extends Store {
      value = 5
      _scale = 2
      get inner() {
        childCalls++
        return this.value * (this as any)._scale
      }
      get outer() {
        return this.inner + 1
      }
    }
    const store = new ChainedUncacheable()
    assert.equal(store.outer, 11)
    assert.equal(store.outer, 11)
    // outer depends on inner which is uncacheable → outer must also recompute
    assert.equal(childCalls, 2, 'parent of uncacheable getter must also recompute')
  })
})
