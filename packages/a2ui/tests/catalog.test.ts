import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import { BUILTIN_FUNCTIONS } from '../src/functions'
import { createRootScope } from '../src/scope'
import { resolveProps, createBasicCatalog } from '../src/catalog'

function ctx(store: any) {
  return { store, scope: createRootScope(), functions: BUILTIN_FUNCTIONS }
}

test('resolveProps skips structural keys and thunks the rest', () => {
  const s = new Store({ contact: { email: 'a@b.c' } })
  const props = resolveProps(
    {
      id: 'f',
      component: 'TextField',
      child: 'x',
      children: ['y'],
      label: 'Email',
      value: { path: '/contact/email' },
    },
    ctx(s),
  )
  assert.deepEqual(Object.keys(props).sort(), ['label', 'value'])
  assert.equal(props.label(), 'Email')
  assert.equal(props.value(), 'a@b.c')
})

test('basic catalog registers the contact-form subset', () => {
  const catalog = createBasicCatalog()
  for (const name of ['Card', 'Column', 'Row', 'Text', 'Button', 'TextField', 'CheckBox']) {
    assert.ok(catalog.has(name), `missing ${name}`)
    assert.equal(catalog.get(name)!.typeName, name)
    assert.equal(typeof catalog.get(name)!.mapProps, 'function')
  }
})

test('TextField mapProps translates A2UI props to the Input component props', () => {
  const s = new Store({ contact: { email: 'a@b.c' } })
  const entry = createBasicCatalog().get('TextField')!
  const props = entry.mapProps(
    { id: 'email_field', component: 'TextField', label: 'Email', value: { path: '/contact/email' } },
    ctx(s),
    null,
  )
  assert.equal(props.value(), 'a@b.c')
  assert.equal(props.placeholder(), 'Email') // A2UI `label` -> Input `placeholder`
})

test('TextField attaches write to onInput, reading e.target.value', () => {
  const written: unknown[] = []
  const entry = createBasicCatalog().get('TextField')!
  const props = entry.mapProps(
    { id: 'f', component: 'TextField', value: { path: '/a' } },
    ctx(new Store({})),
    (next) => written.push(next),
  )
  const handler = props.onInput!() as (e: Event) => void
  handler({ target: { value: 'typed' } } as unknown as Event)
  assert.deepEqual(written, ['typed'])
})

test('CheckBox maps A2UI value -> Zag checked, and never leaks value (the form-value string)', () => {
  const s = new Store({ contact: { subscribe: true } })
  const entry = createBasicCatalog().get('CheckBox')!
  const props = entry.mapProps(
    { id: 'cb', component: 'CheckBox', label: 'Sub', value: { path: '/contact/subscribe' } },
    ctx(s),
    null,
  )
  assert.equal(props.checked(), true)
  assert.equal(props.value, undefined, 'A2UI value must not reach Zag `value`')
})

test('CheckBox attaches write to onCheckedChange, reading details.checked', () => {
  const written: unknown[] = []
  const entry = createBasicCatalog().get('CheckBox')!
  const props = entry.mapProps(
    { id: 'cb', component: 'CheckBox', value: { path: '/a' } },
    ctx(new Store({})),
    (next) => written.push(next),
  )
  const handler = props.onCheckedChange!() as (d: { checked: boolean }) => void
  handler({ checked: true })
  assert.deepEqual(written, [true])
})

test('Button maps the A2UI "primary" variant onto a real gea-ui variant', () => {
  const entry = createBasicCatalog().get('Button')!
  const props = entry.mapProps(
    { id: 'b', component: 'Button', variant: 'primary' },
    ctx(new Store({})),
    null,
  )
  assert.equal(props.variant(), 'default')
})
