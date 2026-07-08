import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GEA_DOM_COMPONENT, Store } from '@geajs/core'
import { createDisposer } from '@geajs/core/compiler-runtime'
import { flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { BUILTIN_FUNCTIONS } from '../src/functions'
import { createRootScope } from '../src/scope'
import { createBasicCatalog } from '../src/catalog'
import { instantiateNode } from '../src/instantiate'
import type { ClientAction, ComponentDefinition } from '../src/types'

function build(defs: ComponentDefinition[], data: Record<string, unknown> = {}) {
  const definitions = new Map(defs.map((d) => [d.id, d]))
  const store = new Store(data) as any
  const sent: ClientAction[] = []
  const host = document.createElement('div')
  // Gea delegates events at the document root, so a detached host never sees
  // them. Every DOM test mounts into the live document.
  document.body.appendChild(host)
  const ictx = {
    definitions,
    catalog: createBasicCatalog(),
    store,
    functions: BUILTIN_FUNCTIONS,
    disposer: createDisposer(),
    surfaceId: 's1',
    transport: { sendAction: (a: ClientAction) => sent.push(a) },
    now: () => '2026-07-09T00:00:00.000Z',
  }
  instantiateNode('root', ictx, host, createRootScope())
  return { host, store, sent }
}

test('instantiates a single leaf and returns its element', () => {
  const { host } = build([{ id: 'root', component: 'Text', text: 'Hello' }])
  assert.match(host.textContent ?? '', /Hello/)
})

test('resolves `child` into the parent element', () => {
  const { host } = build([
    { id: 'root', component: 'Column', child: 'label' },
    { id: 'label', component: 'Text', text: 'Inside' },
  ])
  const column = host.querySelector('.a2ui-column')
  assert.ok(column, 'column rendered')
  assert.match(column!.textContent ?? '', /Inside/)
})

test('resolves `children` array in order', () => {
  const { host } = build([
    { id: 'root', component: 'Column', children: ['a', 'b'] },
    { id: 'a', component: 'Text', text: 'First' },
    { id: 'b', component: 'Text', text: 'Second' },
  ])
  const text = host.querySelector('.a2ui-column')!.textContent ?? ''
  assert.ok(text.indexOf('First') < text.indexOf('Second'), `order wrong: ${text}`)
})

test('nested containers compose depth-first', () => {
  const { host } = build([
    { id: 'root', component: 'Column', children: ['inner'] },
    { id: 'inner', component: 'Row', children: ['leaf'] },
    { id: 'leaf', component: 'Text', text: 'Deep' },
  ])
  assert.match(host.querySelector('.a2ui-column .a2ui-row')!.textContent ?? '', /Deep/)
})

test('a bound prop renders the store value', () => {
  const { host } = build([{ id: 'root', component: 'Text', text: { path: '/greeting' } }], {
    greeting: 'Bound',
  })
  assert.match(host.textContent ?? '', /Bound/)
})

test('containers render no stray text node from the children slot', () => {
  const { host } = build([
    { id: 'root', component: 'Column', children: ['a'] },
    { id: 'a', component: 'Text', text: 'Only' },
  ])
  assert.equal(host.querySelector('.a2ui-column')!.textContent, 'Only')
})

test('an unknown component type is rejected by name', () => {
  assert.throws(
    () => build([{ id: 'root', component: 'Hologram' }]),
    /component type "Hologram" is not in the catalog/,
  )
})

test('a dangling child id is rejected by name', () => {
  assert.throws(
    () => build([{ id: 'root', component: 'Column', child: 'ghost' }]),
    /no component definition for id "ghost"/,
  )
})

test('TextField input writes back to the bound store path immediately', () => {
  const { host, store, sent } = build(
    [{ id: 'root', component: 'TextField', label: 'Email', value: { path: '/contact/email' } }],
    { contact: { email: '' } },
  )
  const input = host.querySelector('input')!
  input.value = 'typed@example.com'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(store.contact.email, 'typed@example.com')
  assert.equal(sent.length, 0, 'typing must not hit the transport')
})

test('CheckBox toggle writes the checked state, not the form-value string', async () => {
  const { host, store } = build(
    [{ id: 'root', component: 'CheckBox', label: 'Sub', value: { path: '/contact/subscribe' } }],
    { contact: { subscribe: false } },
  )
  // Zag components are not clickable under jsdom; gea-ui's own tests drive the
  // machine API instead (see gea-ui/tests/zag-bindings.test.ts). This still
  // exercises the real Zag -> onCheckedChange -> writePointer path.
  const root = host.querySelector('[data-part="root"]')!
  const checkbox = (root as any)[GEA_DOM_COMPONENT]
  checkbox._api.setChecked(true)
  await flushMicrotasks()
  assert.equal(store.contact.subscribe, true)
})

test('a Button action dispatches through the transport with resolved context', () => {
  const { host, sent } = build(
    [
      {
        id: 'root',
        component: 'Button',
        action: {
          event: {
            name: 'submitContactForm',
            context: { isNewsletterSubscribed: { path: '/contact/subscribe' } },
          },
        },
      },
    ],
    { contact: { subscribe: true } },
  )
  host.querySelector('button')!.click()
  assert.deepEqual(sent, [
    {
      name: 'submitContactForm',
      surfaceId: 's1',
      sourceComponentId: 'root',
      timestamp: '2026-07-09T00:00:00.000Z',
      context: { isNewsletterSubscribed: true },
    },
  ])
})

test('a write inside a collection scope lands on the indexed store path', () => {
  const { host, store } = build(
    [
      { id: 'root', component: 'Column', child: 'field' },
      { id: 'field', component: 'TextField', value: { path: '/employees/0/name' } },
    ],
    { employees: [{ name: 'Ada' }] },
  )
  const input = host.querySelector('input')!
  input.value = 'Grace'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(store.employees[0].name, 'Grace')
})
