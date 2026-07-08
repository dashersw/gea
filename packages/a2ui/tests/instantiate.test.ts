import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import { createDisposer } from '@geajs/core/compiler-runtime'
import { BUILTIN_FUNCTIONS } from '../src/functions'
import { createRootScope } from '../src/scope'
import { createBasicCatalog } from '../src/catalog'
import { instantiateNode } from '../src/instantiate'
import type { ComponentDefinition } from '../src/types'

function build(defs: ComponentDefinition[], data: Record<string, unknown> = {}) {
  const definitions = new Map(defs.map((d) => [d.id, d]))
  const store = new Store(data) as any
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
  }
  instantiateNode('root', ictx, host, createRootScope())
  return { host, store }
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
