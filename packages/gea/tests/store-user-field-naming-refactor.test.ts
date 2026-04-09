/**
 * User-defined store fields may use any underscore shape; reactivity tracks them like other keys.
 * Framework-only state belongs in `#` private fields (not visible to Object.keys / the root proxy).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../src/lib/store'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('Store – user field names with underscores', () => {
  it('reassigning __stack notifies observe("__stack")', async () => {
    class S extends Store {
      __stack: number[] = [1, 2, 3]
    }
    const s = new S()
    let calls = 0
    s.observe('__stack', () => calls++)
    s.__stack = [1, 2]
    await flush()
    assert.equal(calls, 1)
  })

  it('push on __stack notifies observe("__stack")', async () => {
    class S extends Store {
      __stack: number[] = [1]
    }
    const s = new S()
    let calls = 0
    s.observe('__stack', () => calls++)
    s.__stack.push(2)
    await flush()
    assert.equal(calls, 1)
  })

  it('reassigning _draft notifies observe("_draft")', async () => {
    class S extends Store {
      _draft = ''
    }
    const s = new S()
    let calls = 0
    s.observe('_draft', () => calls++)
    s._draft = 'hello'
    await flush()
    assert.equal(calls, 1)
  })

  it('reassigning name_ (trailing underscore) notifies observe("name_")', async () => {
    class S extends Store {
      name_ = 'a'
    }
    const s = new S()
    let calls = 0
    s.observe('name_', () => calls++)
    s.name_ = 'b'
    await flush()
    assert.equal(calls, 1)
  })

  it('legacy-shaped user fields element_ / rendered_ do not collide with engine symbols', async () => {
    class S extends Store {
      element_ = 'user-root'
      rendered_ = false
    }
    const s = new S()
    let elCalls = 0
    let rdCalls = 0
    s.observe('element_', () => elCalls++)
    s.observe('rendered_', () => rdCalls++)
    s.element_ = 'updated'
    s.rendered_ = true
    await flush()
    assert.equal(elCalls, 1)
    assert.equal(rdCalls, 1)
    assert.equal(s.element_, 'updated')
    assert.equal(s.rendered_, true)
  })

  it('user field _fooItems is reactive (not reserved for compiler list backing)', async () => {
    class S extends Store {
      _fooItems = [1, 2]
    }
    const s = new S()
    let calls = 0
    s.observe('_fooItems', () => calls++)
    s._fooItems = [3]
    await flush()
    assert.equal(calls, 1)
    assert.deepEqual(s._fooItems, [3])
  })

  it('nested __data.foo notifies observe("__data")', async () => {
    class S extends Store {
      __data = { foo: 1 }
    }
    const s = new S()
    let calls = 0
    s.observe('__data', () => calls++)
    s.__data = { foo: 2 }
    await flush()
    assert.equal(calls, 1)
  })

  it('nested __data.foo mutation notifies observe("__data.foo")', async () => {
    class S extends Store {
      __data = { foo: 1 }
    }
    const s = new S()
    let calls = 0
    s.observe('__data.foo', () => calls++)
    s.__data.foo = 99
    await flush()
    assert.equal(calls, 1)
  })

  it('root observe([]) fires when __stack is reassigned', async () => {
    class S extends Store {
      __stack: string[] = ['a']
    }
    const s = new S()
    let calls = 0
    s.observe([], () => calls++)
    s.__stack = []
    await flush()
    assert.equal(calls, 1)
  })
})

describe('Store – plain data fields named props / handlers are reactive', () => {
  it('props assignment notifies observe("props")', async () => {
    class S extends Store {
      props = { x: 1 }
    }
    const s = new S()
    let calls = 0
    s.observe('props', () => calls++)
    s.props = { x: 2 }
    await flush()
    assert.equal(calls, 1)
  })

  it('handlers assignment notifies observe("handlers")', async () => {
    class S extends Store {
      handlers = {}
    }
    const s = new S()
    let calls = 0
    s.observe('handlers', () => calls++)
    s.handlers = { run: () => {} }
    await flush()
    assert.equal(calls, 1)
  })
})

describe('Store – underscore user fields alongside other keys', () => {
  it('__stack and props can both be observed independently', async () => {
    class S extends Store {
      __stack: string[] = ['x']
      props = { only: 'component' }
    }
    const s = new S()
    // Drain field-initializer flushes before registering observers (otherwise the first
    // microtask flush can deliver constructor-time changes after observe() runs).
    await flush()
    await flush()
    let stackCalls = 0
    let propsCalls = 0
    s.observe('__stack', () => stackCalls++)
    s.observe('props', () => propsCalls++)

    s.__stack = []
    await flush()
    assert.equal(stackCalls, 1)
    assert.equal(propsCalls, 0)

    s.props = { only: 'y' }
    await flush()
    assert.equal(propsCalls, 1)
  })
})
