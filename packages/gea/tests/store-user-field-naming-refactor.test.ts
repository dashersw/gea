/**
 * User-defined store fields may use any underscore shape; reactivity tracks them correctly.
 *
 * In v3 the compiler transforms `class S extends Store { foo = init }` into:
 *   __foo = signal(init)
 *   get foo() { return wrapSignalValue(this.__foo) }
 *   set foo(v) { this.__foo.value = v }
 *
 * These tests manually apply the same transformation and verify that fields
 * named with leading/trailing underscores work without collisions.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../src/store/store'
import { signal } from '../src/signals/signal'
import { effect } from '../src/signals/effect'
import { wrapSignalValue } from '../src/reactive/wrap-signal-value'
import { batch } from '../src/signals/batch'

describe('Store – user field names with underscores (signal-based)', () => {
  it('reassigning __stack notifies effect', () => {
    class S extends Store {
      ____stack = signal<number[]>([1, 2, 3])
      get __stack() { return wrapSignalValue(this.____stack) }
      set __stack(v: number[]) { this.____stack.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s.__stack
      calls++
    })
    calls = 0 // reset after initial effect run
    s.__stack = [1, 2]
    assert.equal(calls, 1)
    dispose()
  })

  it('push on __stack notifies effect via wrapped array', () => {
    class S extends Store {
      ____stack = signal<number[]>([1])
      get __stack() { return wrapSignalValue(this.____stack) }
      set __stack(v: number[]) { this.____stack.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s.__stack
      calls++
    })
    calls = 0
    s.__stack.push(2)
    assert.equal(calls, 1)
    dispose()
  })

  it('reassigning _draft notifies effect', () => {
    class S extends Store {
      ___draft = signal('')
      get _draft() { return wrapSignalValue(this.___draft) as string }
      set _draft(v: string) { this.___draft.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s._draft
      calls++
    })
    calls = 0
    s._draft = 'hello'
    assert.equal(calls, 1)
    dispose()
  })

  it('reassigning name_ (trailing underscore) notifies effect', () => {
    class S extends Store {
      __name_ = signal('a')
      get name_() { return wrapSignalValue(this.__name_) as string }
      set name_(v: string) { this.__name_.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s.name_
      calls++
    })
    calls = 0
    s.name_ = 'b'
    assert.equal(calls, 1)
    dispose()
  })

  it('legacy-shaped user fields element_ / rendered_ do not collide with engine internals', () => {
    class S extends Store {
      __element_ = signal('user-root')
      __rendered_ = signal(false)
      get element_() { return wrapSignalValue(this.__element_) as string }
      set element_(v: string) { this.__element_.value = v }
      get rendered_() { return wrapSignalValue(this.__rendered_) as boolean }
      set rendered_(v: boolean) { this.__rendered_.value = v }
    }
    const s = new S()
    let elCalls = 0
    let rdCalls = 0
    const d1 = effect(() => { s.element_; elCalls++ })
    const d2 = effect(() => { s.rendered_; rdCalls++ })
    elCalls = 0
    rdCalls = 0
    s.element_ = 'updated'
    s.rendered_ = true
    assert.equal(elCalls, 1)
    assert.equal(rdCalls, 1)
    assert.equal(s.element_, 'updated')
    assert.equal(s.rendered_, true)
    d1()
    d2()
  })

  it('user field _fooItems is reactive (not reserved for compiler list backing)', () => {
    class S extends Store {
      ___fooItems = signal<number[]>([1, 2])
      get _fooItems() { return wrapSignalValue(this.___fooItems) as number[] }
      set _fooItems(v: number[]) { this.___fooItems.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s._fooItems
      calls++
    })
    calls = 0
    s._fooItems = [3]
    assert.equal(calls, 1)
    assert.deepEqual(s._fooItems, [3])
    dispose()
  })

  it('nested __data replacement notifies effect', () => {
    class S extends Store {
      ____data = signal<{ foo: number }>({ foo: 1 })
      get __data() { return wrapSignalValue(this.____data) as { foo: number } }
      set __data(v: { foo: number }) { this.____data.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s.__data
      calls++
    })
    calls = 0
    s.__data = { foo: 2 }
    assert.equal(calls, 1)
    dispose()
  })

  it('nested __data.foo mutation notifies effect via wrapped object', () => {
    class S extends Store {
      ____data = signal<{ foo: number }>({ foo: 1 })
      get __data() { return wrapSignalValue(this.____data) as { foo: number } }
      set __data(v: { foo: number }) { this.____data.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s.__data
      calls++
    })
    calls = 0
    s.__data.foo = 99
    assert.equal(calls, 1)
    dispose()
  })

  it('effect fires when __stack is reassigned (tracks via getter)', () => {
    class S extends Store {
      ____stack = signal<string[]>(['a'])
      get __stack() { return wrapSignalValue(this.____stack) as string[] }
      set __stack(v: string[]) { this.____stack.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s.__stack
      calls++
    })
    calls = 0
    s.__stack = []
    assert.equal(calls, 1)
    dispose()
  })
})

describe('Store – plain data fields named props / handlers are reactive', () => {
  it('props assignment notifies effect', () => {
    class S extends Store {
      __props = signal<{ x: number }>({ x: 1 })
      get props() { return wrapSignalValue(this.__props) as { x: number } }
      set props(v: { x: number }) { this.__props.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s.props
      calls++
    })
    calls = 0
    s.props = { x: 2 }
    assert.equal(calls, 1)
    dispose()
  })

  it('handlers assignment notifies effect', () => {
    class S extends Store {
      __handlers = signal<Record<string, Function>>({})
      get handlers() { return wrapSignalValue(this.__handlers) as Record<string, Function> }
      set handlers(v: Record<string, Function>) { this.__handlers.value = v }
    }
    const s = new S()
    let calls = 0
    const dispose = effect(() => {
      s.handlers
      calls++
    })
    calls = 0
    s.handlers = { run: () => {} }
    assert.equal(calls, 1)
    dispose()
  })
})

describe('Store – underscore user fields alongside other keys', () => {
  it('__stack and props can both be observed independently', () => {
    class S extends Store {
      ____stack = signal<string[]>(['x'])
      __props = signal<{ only: string }>({ only: 'component' })
      get __stack() { return wrapSignalValue(this.____stack) as string[] }
      set __stack(v: string[]) { this.____stack.value = v }
      get props() { return wrapSignalValue(this.__props) as { only: string } }
      set props(v: { only: string }) { this.__props.value = v }
    }
    const s = new S()
    let stackCalls = 0
    let propsCalls = 0
    const d1 = effect(() => { s.__stack; stackCalls++ })
    const d2 = effect(() => { s.props; propsCalls++ })
    stackCalls = 0
    propsCalls = 0

    s.__stack = []
    assert.equal(stackCalls, 1)
    assert.equal(propsCalls, 0)

    s.props = { only: 'y' }
    assert.equal(propsCalls, 1)
    d1()
    d2()
  })
})
