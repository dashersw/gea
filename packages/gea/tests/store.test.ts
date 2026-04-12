import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { Store } from '../src/store/store'
import { signal, type Signal } from '../src/signals/signal'
import { effect } from '../src/signals/effect'
import { batch } from '../src/signals/batch'
import { wrapSignalValue } from '../src/reactive/wrap-signal-value'

// ---------------------------------------------------------------------------
// Helper: since the compiler is not available in unit tests, we manually
// apply the compiler's transformation pattern for each Store subclass.
//
// Compiled field pattern:
//   __fieldName = signal(initialValue)
//   get fieldName() { return wrapSignalValue(this.__fieldName) }
//   set fieldName(v) { this.__fieldName.value = v }
//
// Compiled method pattern:
//   methodName(...args) { return batch(() => { ...body }) }
// ---------------------------------------------------------------------------

// isClassConstructorValue was part of v1. We keep a local copy so the 3 tests
// in the "isClassConstructorValue" describe block still work.
function isClassConstructorValue(fn: unknown): boolean {
  if (typeof fn !== 'function') return false
  try {
    const d = Object.getOwnPropertyDescriptor(fn, 'prototype')
    return !!(d && d.writable === false)
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------
// isClassConstructorValue
// ---------------------------------------------------------------------------
describe('isClassConstructorValue', () => {
  it('identifies class constructors (not via toString)', () => {
    class RouteComponent {}
    function plainFn() {}
    assert.equal(isClassConstructorValue(RouteComponent), true)
    assert.equal(isClassConstructorValue(plainFn), false)
    assert.equal(
      isClassConstructorValue(() => {}),
      false,
    )
  })

  it('treats HMR-style constructor proxy as a class (real prototype.constructor)', () => {
    class Page {}
    const target = function GeaHotStub() {}
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === 'prototype') return Page.prototype
        return Reflect.get(Page as object as Function, prop)
      },
      getOwnPropertyDescriptor(_t, prop) {
        return Object.getOwnPropertyDescriptor(Page, prop)
      },
    }) as unknown as Function
    assert.throws(() => Object.getOwnPropertyDescriptor(proxy, 'prototype'))
    assert.equal(isClassConstructorValue(proxy), true)
  })

  it('root store preserves class reference for route components (no spurious bind)', () => {
    // In v2 the Store is plain — class values are not proxied, so they come
    // back as-is without any wrapping.
    class HomePage {}
    class RouterStore extends Store {
      __component = signal<any>(HomePage)
      get component() { return this.__component.value }
      set component(v: any) { this.__component.value = v }
    }
    const router = new RouterStore()
    assert.strictEqual(router.component, HomePage)
  })
})

// ---------------------------------------------------------------------------
// Store – construction
// ---------------------------------------------------------------------------
describe('Store – construction', () => {
  it('creates with explicit initial state', () => {
    class CountStore extends Store {
      __count = signal(0)
      get count() { return this.__count.value }
      set count(v: number) { this.__count.value = v }
    }
    const store = new CountStore()
    assert.equal(store.count, 0)
  })

  it('creates with empty state when no argument given', () => {
    const store = new Store()
    assert.ok(store)
  })

  it('nested object fields are accessible through wrapped getter', () => {
    class NestedStore extends Store {
      __nested = signal({ x: 1 })
      get nested(): any { return wrapSignalValue(this.__nested) }
      set nested(v: any) { this.__nested.value = v }
    }
    const store = new NestedStore()
    assert.equal(store.nested.x, 1)
  })
})

// ---------------------------------------------------------------------------
// Store – basic reactivity
// ---------------------------------------------------------------------------
describe('Store – basic reactivity', () => {
  it('mutations are visible through the setter/getter', () => {
    class NameStore extends Store {
      __name = signal('hello')
      get name() { return this.__name.value }
      set name(v: string) { this.__name.value = v }
    }
    const store = new NameStore()
    store.name = 'world'
    assert.equal(store.name, 'world')
  })

  it('nested object mutations are reactive', () => {
    class UserStore extends Store {
      __user = signal({ name: 'Alice' })
      get user(): any { return wrapSignalValue(this.__user) }
      set user(v: any) { this.__user.value = v }
    }
    const store = new UserStore()
    store.user.name = 'Bob'
    assert.equal(store.user.name, 'Bob')
  })

  it('setting same value does not emit change', () => {
    class XStore extends Store {
      __x = signal(5)
      get x() { return this.__x.value }
      set x(v: number) { this.__x.value = v }
    }
    const store = new XStore()
    let callCount = 0
    effect(() => {
      void store.x
      callCount++
    })
    // effect runs once immediately
    assert.equal(callCount, 1)
    store.x = 5 // same value — should NOT trigger
    assert.equal(callCount, 1)
  })
})

// ---------------------------------------------------------------------------
// Store – observe and notify (via effect)
// ---------------------------------------------------------------------------
describe('Store – observe and notify', () => {
  let store: any
  beforeEach(() => {
    class S extends Store {
      __count = signal(0)
      get count() { return this.__count.value }
      set count(v: number) { this.__count.value = v }

      __nested = signal({ a: 1 })
      get nested(): any { return wrapSignalValue(this.__nested) }
      set nested(v: any) { this.__nested.value = v }
    }
    store = new S()
  })

  it('notifies effect on property change', () => {
    const values: number[] = []
    effect(() => {
      values.push(store.count)
    })
    // initial run pushes 0
    assert.deepEqual(values, [0])
    store.count = 10
    assert.deepEqual(values, [0, 10])
  })

  it('notifies when any tracked field changes', () => {
    let callCount = 0
    effect(() => {
      void store.count
      void store.nested
      callCount++
    })
    assert.equal(callCount, 1)
    store.count = 7
    assert.equal(callCount, 2)
  })

  it('notifies effect on nested property change via wrapped object', () => {
    const values: number[] = []
    effect(() => {
      values.push(store.nested.a)
    })
    assert.deepEqual(values, [1])
    store.nested.a = 99
    // wrapObject set trap calls parentSignal._notify() which re-runs effect
    assert.deepEqual(values, [1, 99])
  })

  it('dispose stops notifications', () => {
    const values: number[] = []
    const dispose = effect(() => {
      values.push(store.count)
    })
    assert.deepEqual(values, [0])
    store.count = 1
    assert.deepEqual(values, [0, 1])
    dispose()
    store.count = 2
    assert.deepEqual(values, [0, 1])
  })

  it('multiple effects on same field', () => {
    let a = 0
    let b = 0
    effect(() => { void store.count; a++ })
    effect(() => { void store.count; b++ })
    // initial runs
    assert.equal(a, 1)
    assert.equal(b, 1)
    store.count = 5
    assert.equal(a, 2)
    assert.equal(b, 2)
  })

  it('parent signal effect is notified by child property changes', () => {
    let callCount = 0
    effect(() => {
      void store.nested
      callCount++
    })
    assert.equal(callCount, 1)
    store.nested.a = 42
    assert.equal(callCount, 2)
  })

  it('effect reacts when object field is entirely replaced', () => {
    class IssueStore extends Store {
      __issue = signal<any>({ id: '1', status: 'backlog' })
      get issue(): any { return wrapSignalValue(this.__issue) }
      set issue(v: any) { this.__issue.value = v }
    }
    const s = new IssueStore()
    const values: string[] = []
    effect(() => {
      values.push(s.issue.status as string)
    })
    assert.deepEqual(values, ['backlog'])
    s.issue = { id: '1', status: 'done' }
    assert.deepEqual(values, ['backlog', 'done'])
  })
})

// ---------------------------------------------------------------------------
// Store – batching via batch()
// ---------------------------------------------------------------------------
describe('Store – batching via batch()', () => {
  it('batches synchronous mutations into one effect run', () => {
    class ABStore extends Store {
      __a = signal(0)
      get a() { return this.__a.value }
      set a(v: number) { this.__a.value = v }
      __b = signal(0)
      get b() { return this.__b.value }
      set b(v: number) { this.__b.value = v }
    }
    const store = new ABStore()
    let callCount = 0
    effect(() => {
      void store.a
      void store.b
      callCount++
    })
    assert.equal(callCount, 1) // initial run
    batch(() => {
      store.a = 1
      store.b = 2
    })
    assert.equal(callCount, 2) // only one additional run
  })

  it('separate fields trigger their own effects independently', () => {
    class DSStore extends Store {
      __data = signal<number[]>([])
      get data(): any { return wrapSignalValue(this.__data) }
      set data(v: any) { this.__data.value = v }
      __selected = signal(0)
      get selected() { return this.__selected.value }
      set selected(v: number) { this.__selected.value = v }
    }
    const store = new DSStore()

    let dataCalls = 0
    let selectedCalls = 0
    effect(() => { void store.data; dataCalls++ })
    effect(() => { void store.selected; selectedCalls++ })

    assert.equal(dataCalls, 1)
    assert.equal(selectedCalls, 1)

    batch(() => {
      store.data = [1, 2, 3]
      store.selected = 1
    })

    assert.equal(dataCalls, 2)
    assert.equal(selectedCalls, 2)
  })

  it('replacing array with empty array triggers effect', () => {
    class DataStore extends Store {
      __data = signal<number[]>([1, 2, 3])
      get data(): any { return wrapSignalValue(this.__data) }
      set data(v: any) { this.__data.value = v }
      __selected = signal(0)
      get selected() { return this.__selected.value }
      set selected(v: number) { this.__selected.value = v }
    }
    const store = new DataStore()
    let observedValue: unknown

    effect(() => {
      observedValue = store.data
    })

    store.data = []

    assert.ok(Array.isArray(observedValue))
    assert.equal((observedValue as any[]).length, 0)
  })
})

// ---------------------------------------------------------------------------
// Store – array methods
// ---------------------------------------------------------------------------
describe('Store – array methods', () => {
  let store: any
  let callCount: number

  beforeEach(() => {
    class ItemsStore extends Store {
      __items = signal([1, 2, 3])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    store = new ItemsStore()
    callCount = 0
    effect(() => {
      void store.items
      callCount++
    })
    // reset after initial effect run
    callCount = 0
  })

  it('push appends and notifies', () => {
    store.items.push(4)
    assert.deepEqual([...store.items], [1, 2, 3, 4])
    assert.equal(callCount, 1)
  })

  it('push multiple items in one call', () => {
    store.items.push(4, 5)
    assert.deepEqual([...store.items], [1, 2, 3, 4, 5])
    assert.equal(callCount, 1)
  })

  it('pop removes last and notifies', () => {
    const result = store.items.pop()
    assert.equal(result, 3)
    assert.deepEqual([...store.items], [1, 2])
    assert.equal(callCount, 1)
  })

  it('pop on empty array returns undefined', () => {
    class EmptyStore extends Store {
      __items = signal<number[]>([])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const empty = new EmptyStore()
    const result = empty.items.pop()
    assert.equal(result, undefined)
  })

  it('shift removes first and notifies', () => {
    const result = store.items.shift()
    assert.equal(result, 1)
    assert.deepEqual([...store.items], [2, 3])
    assert.equal(callCount, 1)
  })

  it('shift on empty array returns undefined', () => {
    class EmptyStore extends Store {
      __items = signal<number[]>([])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const empty = new EmptyStore()
    const result = empty.items.shift()
    assert.equal(result, undefined)
  })

  it('unshift prepends and notifies', () => {
    store.items.unshift(0)
    assert.deepEqual([...store.items], [0, 1, 2, 3])
    assert.equal(callCount, 1)
  })

  it('splice remove-only notifies', () => {
    store.items.splice(1, 1)
    assert.deepEqual([...store.items], [1, 3])
    assert.equal(callCount, 1)
  })

  it('splice insert-at-end notifies', () => {
    store.items.splice(3, 0, 4, 5)
    assert.deepEqual([...store.items], [1, 2, 3, 4, 5])
    assert.equal(callCount, 1)
  })

  it('splice insert-in-middle notifies', () => {
    store.items.splice(1, 0, 99)
    assert.deepEqual([...store.items], [1, 99, 2, 3])
    assert.equal(callCount, 1)
  })

  it('splice replace notifies', () => {
    store.items.splice(1, 1, 99)
    assert.deepEqual([...store.items], [1, 99, 3])
    assert.equal(callCount, 1)
  })

  it('sort reorders and notifies', () => {
    class UnsortedStore extends Store {
      __items = signal([3, 1, 2])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const s = new UnsortedStore()
    let calls = 0
    effect(() => { void s.items; calls++ })
    calls = 0
    s.items.sort((a: number, b: number) => a - b)
    assert.deepEqual([...s.items], [1, 2, 3])
    assert.equal(calls, 1)
  })

  it('reverse reorders and notifies', () => {
    store.items.reverse()
    assert.deepEqual([...store.items], [3, 2, 1])
    assert.equal(callCount, 1)
  })
})

// ---------------------------------------------------------------------------
// Store – array iterator methods
// ---------------------------------------------------------------------------
describe('Store – array iterator proxies', () => {
  it('map returns correct items', () => {
    class ObjArrStore extends Store {
      __items = signal([{ name: 'a' }, { name: 'b' }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new ObjArrStore()
    const names = store.items.map((item: any) => item.name)
    assert.deepEqual(names, ['a', 'b'])
  })

  it('filter returns matching items', () => {
    class NumStore extends Store {
      __items = signal([1, 2, 3, 4])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new NumStore()
    const even = store.items.filter((n: number) => n % 2 === 0)
    assert.equal(even.length, 2)
  })

  it('find returns matching item', () => {
    class IdStore extends Store {
      __items = signal([{ id: 1 }, { id: 2 }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new IdStore()
    const found = store.items.find((item: any) => item.id === 2)
    assert.equal(found?.id, 2)
  })

  it('findIndex returns correct index', () => {
    class NumStore extends Store {
      __items = signal([10, 20, 30])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new NumStore()
    const idx = store.items.findIndex((n: number) => n === 20)
    assert.equal(idx, 1)
  })

  it('some returns true when predicate matches', () => {
    class NumStore extends Store {
      __items = signal([1, 2, 3])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new NumStore()
    assert.equal(
      store.items.some((n: number) => n > 2),
      true,
    )
  })

  it('every returns false when predicate fails', () => {
    class NumStore extends Store {
      __items = signal([1, 2, 3])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new NumStore()
    assert.equal(
      store.items.every((n: number) => n > 2),
      false,
    )
  })

  it('reduce accumulates correctly', () => {
    class NumStore extends Store {
      __items = signal([1, 2, 3])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new NumStore()
    const sum = store.items.reduce((acc: number, n: number) => acc + n, 0)
    assert.equal(sum, 6)
  })

  it('reduce without initializer uses first element', () => {
    class NumStore extends Store {
      __items = signal([10, 20, 30])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new NumStore()
    const sum = store.items.reduce((acc: number, n: number) => acc + n)
    assert.equal(sum, 60)
  })

  it('forEach iterates all items', () => {
    class StrStore extends Store {
      __items = signal(['a', 'b', 'c'])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new StrStore()
    const result: string[] = []
    store.items.forEach((item: string) => result.push(item))
    assert.deepEqual(result, ['a', 'b', 'c'])
  })

  it('indexOf with wrapped item', () => {
    class ObjStore extends Store {
      __items = signal([{ id: 1 }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new ObjStore()
    // The wrapped array is the raw array itself (no proxy layer), so
    // items[0] returns the raw object and indexOf finds it.
    assert.equal(store.items.indexOf(store.items[0]), 0)
  })

  it('includes with wrapped item', () => {
    class ObjStore extends Store {
      __items = signal([{ id: 1 }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new ObjStore()
    assert.equal(store.items.includes(store.items[0]), true)
  })
})

// ---------------------------------------------------------------------------
// Store – swap detection (index swap via temp variable)
// ---------------------------------------------------------------------------
describe('Store – swap detection', () => {
  it('swapping array elements via temp variable is visible', () => {
    class SwapStore extends Store {
      __items = signal(['a', 'b', 'c'])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new SwapStore()
    let callCount = 0
    effect(() => {
      void store.items
      callCount++
    })
    callCount = 0

    // Direct index mutation on the raw array followed by signal notification
    const arr = store.__items.peek()
    const temp = arr[0]
    arr[0] = arr[2]
    arr[2] = temp
    store.__items._notify()

    assert.equal(callCount, 1)
    assert.deepEqual([...store.items], ['c', 'b', 'a'])
  })
})

// ---------------------------------------------------------------------------
// Store – array item property updates
// ---------------------------------------------------------------------------
describe('Store – array item property updates', () => {
  it('nested object property change in array item notifies parent signal', () => {
    class TodoStore extends Store {
      __items = signal([{ done: false }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new TodoStore()
    let callCount = 0
    effect(() => {
      void store.items
      callCount++
    })
    callCount = 0

    // Wrapped array items are not individually reactive without ensureItemSignal.
    // But we can still mutate and notify the parent.
    const arr = store.__items.peek()
    arr[0].done = true
    store.__items._notify()

    assert.equal(callCount, 1)
  })

  it('multiple nested property changes batch into one notification', () => {
    class LabelStore extends Store {
      __items = signal([{ label: 'a' }, { label: 'b' }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new LabelStore()
    let callCount = 0
    effect(() => {
      void store.items
      callCount++
    })
    callCount = 0

    batch(() => {
      const arr = store.__items.peek()
      arr[0].label = 'updated a'
      arr[1].label = 'updated b'
      store.__items._notify()
    })

    assert.equal(callCount, 1)
  })

  it('array item objects are accessible via wrapped getter', () => {
    class ItemStore extends Store {
      __items = signal([{ label: 'a' }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new ItemStore()
    const items = store.items
    const item = items[0]
    assert.ok(item)
    assert.equal(item.label, 'a')
  })

  it('array item property update notifies via direct mutation and notify', () => {
    class ItemStore extends Store {
      __items = signal([{ label: 'a' }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new ItemStore()
    let callCount = 0
    effect(() => {
      void store.items
      callCount++
    })
    callCount = 0

    const arr = store.__items.peek()
    arr[0].label = 'updated'
    store.__items._notify()

    assert.equal(callCount, 1)
    assert.equal(store.items[0].label, 'updated')
  })
})

// ---------------------------------------------------------------------------
// Store – getters (computed values)
// ---------------------------------------------------------------------------
describe('Store – getters (computed values)', () => {
  it('getters on subclass are accessible', () => {
    class TodoStore extends Store {
      __items = signal([{ done: false }, { done: true }, { done: false }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
      get completedCount(): number {
        return this.items.filter((i: any) => i.done).length
      }
    }
    const store = new TodoStore()
    assert.equal(store.completedCount, 1)
  })

  it('getters react to state changes', () => {
    class CountStore extends Store {
      __count = signal(0)
      get count() { return this.__count.value }
      set count(v: number) { this.__count.value = v }
      get doubled(): number {
        return this.count * 2
      }
    }
    const store = new CountStore()
    assert.equal(store.doubled, 0)
    store.count = 5
    assert.equal(store.doubled, 10)
  })
})

// ---------------------------------------------------------------------------
// Store – property reassignment
// ---------------------------------------------------------------------------
describe('Store – property reassignment', () => {
  it('reassigning a property triggers effect', () => {
    class XStore extends Store {
      __x = signal(1)
      get x() { return this.__x.value }
      set x(v: number) { this.__x.value = v }
    }
    const store = new XStore()
    let callCount = 0
    effect(() => {
      void store.x
      callCount++
    })
    callCount = 0
    batch(() => {
      store.x = 99
      store.x = 100
    })
    assert.equal(store.x, 100)
    assert.equal(callCount, 1) // batched into one
  })
})

// ---------------------------------------------------------------------------
// Store – delete property (signal-based equivalent)
// ---------------------------------------------------------------------------
describe('Store – delete property', () => {
  it('setting to undefined emulates delete and triggers effect', () => {
    class ABStore extends Store {
      __a = signal<number | undefined>(1)
      get a() { return this.__a.value }
      set a(v: number | undefined) { this.__a.value = v }
      __b = signal(2)
      get b() { return this.__b.value }
      set b(v: number) { this.__b.value = v }
    }
    const store = new ABStore()
    let callCount = 0
    effect(() => {
      void store.a
      callCount++
    })
    callCount = 0
    store.a = undefined
    assert.equal(callCount, 1)
    assert.equal(store.a, undefined)
  })
})

// ---------------------------------------------------------------------------
// Store – signal identity
// ---------------------------------------------------------------------------
describe('Store – signal identity', () => {
  it('nested object fields are wrapped for reactivity', () => {
    class NestedStore extends Store {
      __nested = signal({ val: 1 })
      get nested(): any { return wrapSignalValue(this.__nested) }
      set nested(v: any) { this.__nested.value = v }
    }
    const store = new NestedStore()
    // Wrapped object is a Proxy created by wrapObject
    assert.equal(typeof store.nested, 'object')
    assert.equal(store.nested.val, 1)
  })

  it('signal peek returns the raw underlying value', () => {
    const raw = { val: 42 }
    class RawStore extends Store {
      __nested = signal(raw)
      get nested(): any { return wrapSignalValue(this.__nested) }
      set nested(v: any) { this.__nested.value = v }
    }
    const store = new RawStore()
    // peek() bypasses the wrapper and returns the raw object
    assert.equal(store.__nested.peek(), raw)
  })

  it('signal stores track their fields independently', () => {
    class DeepStore extends Store {
      __nested = signal({ deep: { val: 1 } })
      get nested(): any { return wrapSignalValue(this.__nested) }
      set nested(v: any) { this.__nested.value = v }
    }
    const store = new DeepStore()
    assert.equal(store.nested.deep.val, 1)
  })

  it('assigning one field value to another works', () => {
    class SelectStore extends Store {
      __items = signal([{ id: 1 }])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
      __selected = signal<any>(null)
      get selected(): any { return wrapSignalValue(this.__selected) }
      set selected(v: any) { this.__selected.value = v }
    }
    const store = new SelectStore()
    store.selected = store.items[0]
    assert.equal(store.selected.id, 1)
  })
})

// ---------------------------------------------------------------------------
// Store – array full replacement
// ---------------------------------------------------------------------------
describe('Store – array full replacement as append', () => {
  it('replacing array with larger array triggers effect', () => {
    class ItemStore extends Store {
      __items = signal([1, 2])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new ItemStore()
    let callCount = 0
    effect(() => {
      void store.items
      callCount++
    })
    callCount = 0
    store.items = [1, 2, 3, 4]
    assert.equal(callCount, 1)
    assert.deepEqual([...store.items], [1, 2, 3, 4])
  })
})

// ---------------------------------------------------------------------------
// Store – root store reference from signal
// ---------------------------------------------------------------------------
describe('Store – field accessor from store instance', () => {
  it('can access underlying signal from store instance', () => {
    class ObjStore extends Store {
      __obj = signal({ x: 1 })
      get obj(): any { return wrapSignalValue(this.__obj) }
      set obj(v: any) { this.__obj.value = v }
    }
    const store = new ObjStore()
    // In v2, the store instance holds the signal directly —
    // you can reach the store from the field's signal via the class itself
    assert.ok(store.__obj)
    assert.equal(store.__obj.peek().x, 1)
  })
})

// ---------------------------------------------------------------------------
// Store – effect cleanup on dispose
// ---------------------------------------------------------------------------
describe('Store – effect cleanup on dispose', () => {
  it('disposing effect cleans up subscriptions', () => {
    class ABCStore extends Store {
      __a = signal({ b: { c: 1 } })
      get a(): any { return wrapSignalValue(this.__a) }
      set a(v: any) { this.__a.value = v }
    }
    const store = new ABCStore()
    const dispose1 = effect(() => { void store.a })
    dispose1()
    const dispose2 = effect(() => { void store.a })
    dispose2()
    // No error = cleanup works correctly
  })
})

// ---------------------------------------------------------------------------
// Store – derived arrays passed as values
// ---------------------------------------------------------------------------
describe('Store – derived arrays passed as values', () => {
  it('filtered store array is a real array that supports .map()', () => {
    class ActiveStore extends Store {
      __items = signal([
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true },
      ])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new ActiveStore()
    const filtered = store.items.filter((x: any) => x.active)
    assert.ok(Array.isArray(filtered), 'filter result should be a real Array')
    const ids = filtered.map((x: any) => x.id)
    assert.deepEqual(ids, [1, 3])
  })

  it('mapped store array is a real array that supports .filter()', () => {
    class NameStore extends Store {
      __items = signal([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new NameStore()
    const names = store.items.map((x: any) => x.name)
    assert.ok(Array.isArray(names), 'map result should be a real Array')
    assert.deepEqual(names, ['a', 'b'])
    const filtered = names.filter((n: string) => n === 'a')
    assert.deepEqual(filtered, ['a'])
  })

  it('store array supports .map() and .filter()', () => {
    class VStore extends Store {
      __items = signal([
        { id: 1, v: 10 },
        { id: 2, v: 20 },
      ])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }
    }
    const store = new VStore()
    const doubled = store.items.map((x: any) => x.v * 2)
    assert.deepEqual(doubled, [20, 40])
    const big = store.items.filter((x: any) => x.v > 15)
    assert.equal(big.length, 1)
  })
})

// ---------------------------------------------------------------------------
// Store – batch() return value
// ---------------------------------------------------------------------------
describe('Store – batch()', () => {
  it('batch returns the value of the wrapped function', () => {
    class CountStore extends Store {
      __count = signal(0)
      get count() { return this.__count.value }
      set count(v: number) { this.__count.value = v }
    }
    const store = new CountStore()
    const result = batch(() => {
      store.count = 42
      return store.count
    })
    assert.equal(result, 42)
  })

  it('nested batches defer flush until outermost completes', () => {
    class XStore extends Store {
      __x = signal(0)
      get x() { return this.__x.value }
      set x(v: number) { this.__x.value = v }
    }
    const store = new XStore()
    let callCount = 0
    effect(() => {
      void store.x
      callCount++
    })
    callCount = 0
    batch(() => {
      store.x = 1
      batch(() => {
        store.x = 2
      })
      store.x = 3
    })
    // Only one effect run after outermost batch completes
    assert.equal(callCount, 1)
    assert.equal(store.x, 3)
  })

  it('batch-wrapped methods work as expected', () => {
    class TodoStore extends Store {
      __items = signal<{ text: string }[]>([])
      get items(): any { return wrapSignalValue(this.__items) }
      set items(v: any) { this.__items.value = v }

      addItem(text: string) {
        return batch(() => {
          this.items.push({ text })
        })
      }
    }
    const store = new TodoStore()
    let callCount = 0
    effect(() => {
      void store.items
      callCount++
    })
    callCount = 0
    store.addItem('hello')
    assert.equal(store.items.length, 1)
    assert.equal(store.items[0].text, 'hello')
    assert.equal(callCount, 1)
  })

  it('updates values without notifying effects when signal is not read', () => {
    class CountStore extends Store {
      __count = signal(0)
      get count() { return this.__count.value }
      set count(v: number) { this.__count.value = v }
      __name = signal('Alice')
      get name() { return this.__name.value }
      set name(v: string) { this.__name.value = v }
    }
    const store = new CountStore()
    let nameCallCount = 0
    effect(() => {
      void store.name
      nameCallCount++
    })
    nameCallCount = 0

    // Changing count should NOT notify the name effect
    store.count = 42

    assert.equal(store.count, 42, 'value must be updated')
    assert.equal(nameCallCount, 0, 'name observer must not fire')
  })
})

// ---------------------------------------------------------------------------
// Store – signal-level same-value optimization
// ---------------------------------------------------------------------------
describe('Store – signal same-value optimization', () => {
  it('setting same primitive value does not trigger effect', () => {
    class CountStore extends Store {
      __count = signal(5)
      get count() { return this.__count.value }
      set count(v: number) { this.__count.value = v }
    }
    const store = new CountStore()
    let callCount = 0
    effect(() => {
      void store.count
      callCount++
    })
    callCount = 0
    store.count = 5
    assert.equal(callCount, 0)
  })

  it('setting different value then same value triggers effect once', () => {
    class CountStore extends Store {
      __count = signal(0)
      get count() { return this.__count.value }
      set count(v: number) { this.__count.value = v }
    }
    const store = new CountStore()
    let callCount = 0
    effect(() => {
      void store.count
      callCount++
    })
    callCount = 0
    store.count = 1
    assert.equal(callCount, 1)
    store.count = 1
    assert.equal(callCount, 1) // same value, no extra trigger
  })
})

// ---------------------------------------------------------------------------
// Store – effect tracks multiple signals
// ---------------------------------------------------------------------------
describe('Store – effect tracks multiple signals', () => {
  it('effect re-runs when any tracked signal changes', () => {
    class MultiStore extends Store {
      __a = signal(1)
      get a() { return this.__a.value }
      set a(v: number) { this.__a.value = v }
      __b = signal(2)
      get b() { return this.__b.value }
      set b(v: number) { this.__b.value = v }
    }
    const store = new MultiStore()
    const sums: number[] = []
    effect(() => {
      sums.push(store.a + store.b)
    })
    assert.deepEqual(sums, [3])
    store.a = 10
    assert.deepEqual(sums, [3, 12])
    store.b = 20
    assert.deepEqual(sums, [3, 12, 30])
  })
})
