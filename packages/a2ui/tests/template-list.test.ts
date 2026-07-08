import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import { createDisposer } from '@geajs/core/compiler-runtime'
import { flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { BUILTIN_FUNCTIONS } from '../src/functions'
import { createRootScope } from '../src/scope'
import { createBasicCatalog } from '../src/catalog'
import { instantiateNode } from '../src/instantiate'
import type { ComponentDefinition } from '../src/types'

function build(defs: ComponentDefinition[], data: Record<string, unknown>) {
  const store = new Store(data) as any
  const host = document.createElement('div')
  document.body.appendChild(host)
  instantiateNode(
    'root',
    {
      definitions: new Map(defs.map((d) => [d.id, d])),
      catalog: createBasicCatalog(),
      store,
      functions: BUILTIN_FUNCTIONS,
      disposer: createDisposer(),
      surfaceId: 's1',
      transport: { sendAction() {} },
      now: () => '2026-07-09T00:00:00.000Z',
    },
    host,
    createRootScope(),
  )
  return { host, store }
}

const DEFS: ComponentDefinition[] = [
  { id: 'root', component: 'Column', children: { componentId: 'row_tpl', path: '/employees' } },
  { id: 'row_tpl', component: 'Text', text: { path: 'name' } },
]

function names(host: Element): string[] {
  return [...host.querySelectorAll('.a2ui-text')].map((n) => n.textContent ?? '')
}

test('template list renders one row per array item using relative paths', () => {
  const { host } = build(DEFS, {
    employees: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ],
  })
  assert.deepEqual(names(host), ['Ada', 'Grace'])
})

test('appending an item adds exactly one row', async () => {
  const { host, store } = build(DEFS, { employees: [{ id: 1, name: 'Ada' }] })
  store.employees.push({ id: 2, name: 'Grace' })
  await flushMicrotasks()
  assert.deepEqual(names(host), ['Ada', 'Grace'])
})

test('removing an item removes its row', async () => {
  const { host, store } = build(DEFS, {
    employees: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ],
  })
  store.employees.splice(0, 1)
  await flushMicrotasks()
  assert.deepEqual(names(host), ['Grace'])
})

test('reordering preserves row element identity (LIS-minimal moves)', async () => {
  const { host, store } = build(DEFS, {
    employees: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ],
  })
  const adaBefore = [...host.querySelectorAll('.a2ui-text')].find((n) => n.textContent === 'Ada')
  store.employees.reverse()
  await flushMicrotasks()
  assert.deepEqual(names(host), ['Grace', 'Ada'])
  const adaAfter = [...host.querySelectorAll('.a2ui-text')].find((n) => n.textContent === 'Ada')
  assert.equal(adaAfter, adaBefore, 'Ada row was moved, not recreated')
})

test('an empty array renders no rows', () => {
  const { host } = build(DEFS, { employees: [] })
  assert.deepEqual(names(host), [])
})
