import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import {
  createRootScope,
  createCollectionScope,
  resolveRead,
  resolveWriteParts,
} from '../src/scope'

test('absolute path reads from the model root at any depth', () => {
  const s = new Store({ contact: { email: 'a@b.c' }, employees: [{ name: 'Ada' }] })
  const root = createRootScope()
  const row = createCollectionScope(['employees'], 0, (s as any).employees[0], root)
  assert.equal(resolveRead(s, '/contact/email', root), 'a@b.c')
  assert.equal(resolveRead(s, '/contact/email', row), 'a@b.c')
})

test('relative path reads from the current item inside a collection scope', () => {
  const s = new Store({ employees: [{ name: 'Ada' }, { name: 'Grace' }] }) as any
  const root = createRootScope()
  const row1 = createCollectionScope(['employees'], 1, s.employees[1], root)
  assert.equal(resolveRead(s, 'name', row1), 'Grace')
})

test('relative path in root scope is undefined (not legal per spec)', () => {
  const s = new Store({ name: 'nope' })
  assert.equal(resolveRead(s, 'name', createRootScope()), undefined)
})

test('resolveWriteParts maps relative to absolute parts through basePath/index', () => {
  const root = createRootScope()
  const row = createCollectionScope(['employees'], 2, { name: 'X' }, root)
  assert.deepEqual(resolveWriteParts('name', row), ['employees', '2', 'name'])
  assert.deepEqual(resolveWriteParts('/contact/email', row), ['contact', 'email'])
  assert.deepEqual(resolveWriteParts('/a', root), ['a'])
})

test('collection scope index is mutable and reflected in write parts', () => {
  const row = createCollectionScope(['employees'], 0, { name: 'X' }, createRootScope())
  row.index = 3
  assert.deepEqual(resolveWriteParts('name', row), ['employees', '3', 'name'])
})
