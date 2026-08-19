import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import { BUILTIN_FUNCTIONS } from '../src/functions'
import { createRootScope, createCollectionScope } from '../src/scope'
import { toThunk, resolveOnce } from '../src/binding'

function ctx(store: any, scope = createRootScope()) {
  return { store, scope, functions: BUILTIN_FUNCTIONS }
}

test('literals pass through as constant thunks', () => {
  const c = ctx(new Store({}))
  assert.equal(toThunk('Email Address', c)(), 'Email Address')
  assert.equal(toThunk(42, c)(), 42)
  assert.equal(toThunk(true, c)(), true)
  assert.deepEqual(toThunk(['a'], c)(), ['a'])
})

test('DataBinding thunk is lazy and re-reads the store on each call', () => {
  const s = new Store({ contact: { email: 'a@b.c' } }) as any
  const thunk = toThunk({ path: '/contact/email' }, ctx(s))
  assert.equal(thunk(), 'a@b.c')
  s.contact.email = 'z@z.z'
  assert.equal(thunk(), 'z@z.z') // lazy: not captured at build time
})

test('DataBinding resolves to undefined before its updateDataModel arrives', () => {
  const s = new Store({}) as any
  assert.equal(toThunk({ path: '/contact/email' }, ctx(s))(), undefined)
})

test('FunctionCall runs a registered function with resolved args', () => {
  const s = new Store({ contact: { email: 'bad' } }) as any
  const c = ctx(s)
  const thunk = toThunk({ call: 'email', args: { value: { path: '/contact/email' } } }, c)
  assert.equal(thunk(), false)
  s.contact.email = 'john.doe@example.com'
  assert.equal(thunk(), true)
})

test('FunctionCall with no args is legal (args optional per schema)', () => {
  const c = ctx(new Store({}))
  assert.equal(toThunk({ call: 'required' }, c)(), false)
})

test('FunctionCall args may nest FunctionCalls', () => {
  const s = new Store({ d: '2026-07-09T12:00:00Z' }) as any
  const thunk = toThunk(
    {
      call: 'formatString',
      args: {
        template: 'On {when}',
        when: { call: 'formatDate', args: { value: { path: '/d' } } },
      },
    },
    ctx(s),
  )
  assert.equal(thunk(), 'On 2026-07-09')
})

test('unknown function name throws rather than evaluating anything', () => {
  const c = ctx(new Store({}))
  assert.throws(() => toThunk({ call: 'rm -rf' }, c)(), /Unknown A2UI function: rm -rf/)
})

test('relative binding reads the collection item', () => {
  const s = new Store({ employees: [{ name: 'Ada' }] }) as any
  const scope = createCollectionScope(['employees'], 0, s.employees[0], createRootScope())
  assert.equal(toThunk({ path: 'name' }, ctx(s, scope))(), 'Ada')
})

test('resolveOnce returns a concrete value, not a thunk', () => {
  const s = new Store({ contact: { subscribe: true } }) as any
  assert.equal(resolveOnce({ path: '/contact/subscribe' }, ctx(s)), true)
})
