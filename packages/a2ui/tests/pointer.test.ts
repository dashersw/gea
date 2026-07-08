import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import { parsePointer, readPointer, writePointer, deletePointer } from '../src/pointer'

test('parsePointer handles root, escapes, and segments', () => {
  assert.deepEqual(parsePointer(''), [])
  assert.deepEqual(parsePointer('/'), []) // A2UI root convention, not strict RFC 6901
  assert.deepEqual(parsePointer('/contact/email'), ['contact', 'email'])
  assert.deepEqual(parsePointer('/a~1b'), ['a/b']) // ~1 -> /
  assert.deepEqual(parsePointer('/a~0b'), ['a~b']) // ~0 -> ~
  assert.deepEqual(parsePointer('/m~01'), ['m~1']) // ~0 first, then ~1
  assert.deepEqual(parsePointer('/items/0/name'), ['items', '0', 'name'])
})

test('readPointer walks objects and arrays, undefined on holes', () => {
  const s = new Store({ contact: { email: 'a@b.c' }, items: [{ name: 'x' }] })
  assert.equal(readPointer(s, ['contact', 'email']), 'a@b.c')
  assert.equal(readPointer(s, ['items', '0', 'name']), 'x')
  assert.equal(readPointer(s, ['nope', 'deep']), undefined)
  assert.equal(readPointer(s, []), s)
})

test('writePointer creates intermediates and writes through the proxy', () => {
  const s = new Store({}) as any
  writePointer(s, ['contact', 'email'], 'j@d.com')
  assert.equal(s.contact.email, 'j@d.com')
  writePointer(s, ['contact'], { email: 'k@d.com' })
  assert.equal(s.contact.email, 'k@d.com')
})

test('writePointer with empty parts replaces the whole model in place', () => {
  const s = new Store({ a: 1, b: 2 }) as any
  writePointer(s, [], { c: 3 })
  assert.equal(s.a, undefined)
  assert.equal(s.b, undefined)
  assert.equal(s.c, 3)
})

test('deletePointer removes a key; empty parts clears the model', () => {
  const s = new Store({ contact: { email: 'x', name: 'y' } }) as any
  deletePointer(s, ['contact', 'email'])
  assert.equal(s.contact.email, undefined)
  assert.equal(s.contact.name, 'y')
  deletePointer(s, [])
  assert.equal(s.contact, undefined)
})
