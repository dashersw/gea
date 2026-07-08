import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_FUNCTIONS } from '../src/functions'

test('required rejects empty, null, undefined; accepts 0 and false', () => {
  const f = BUILTIN_FUNCTIONS.required
  assert.equal(f({ value: 'x' }), true)
  assert.equal(f({ value: '' }), false)
  assert.equal(f({ value: null }), false)
  assert.equal(f({ value: undefined }), false)
  assert.equal(f({ value: 0 }), true)
  assert.equal(f({ value: false }), true)
})

test('email validates the bound value', () => {
  const f = BUILTIN_FUNCTIONS.email
  assert.equal(f({ value: 'john.doe@example.com' }), true)
  assert.equal(f({ value: 'nope' }), false)
  assert.equal(f({ value: '' }), false)
  assert.equal(f({ value: undefined }), false)
})

test('regex matches value against pattern', () => {
  const f = BUILTIN_FUNCTIONS.regex
  assert.equal(f({ value: 'abc123', pattern: '^[a-z]+\\d+$' }), true)
  assert.equal(f({ value: 'ABC', pattern: '^[a-z]+$' }), false)
  assert.equal(f({ value: undefined, pattern: '^a$' }), false)
})

test('formatString substitutes {name} placeholders', () => {
  const f = BUILTIN_FUNCTIONS.formatString
  assert.equal(f({ template: 'Hi {name}!', name: 'Ada' }), 'Hi Ada!')
  assert.equal(f({ template: 'a{x}b{x}', x: '-' }), 'a-b-')
  assert.equal(f({ template: 'Hi {missing}' }), 'Hi ')
})

test('formatDate renders an ISO date deterministically in UTC', () => {
  const f = BUILTIN_FUNCTIONS.formatDate
  assert.equal(f({ value: '2026-07-09T12:00:00Z' }), '2026-07-09')
  assert.equal(f({ value: 'not-a-date' }), '')
})

test('unknown function is not reachable — the map has exactly five entries', () => {
  assert.deepEqual(Object.keys(BUILTIN_FUNCTIONS).sort(), [
    'email',
    'formatDate',
    'formatString',
    'regex',
    'required',
  ])
})
