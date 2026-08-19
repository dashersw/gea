import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDataBinding, isFunctionCall, isTemplateChildList } from '../src/types'

test('isDataBinding requires exactly one key named path', () => {
  assert.equal(isDataBinding({ path: '/a' }), true)
  assert.equal(isDataBinding({ path: '/a', extra: 1 }), false) // additionalProperties: false
  assert.equal(isDataBinding({ call: 'email' }), false)
  assert.equal(isDataBinding('/a'), false)
  assert.equal(isDataBinding(null), false)
  assert.equal(isDataBinding([{ path: '/a' }]), false)
})

test('isFunctionCall requires call; args is optional', () => {
  assert.equal(isFunctionCall({ call: 'required' }), true) // args optional per schema
  assert.equal(isFunctionCall({ call: 'email', args: { value: '/a' } }), true)
  assert.equal(isFunctionCall({ args: {} }), false)
  assert.equal(isFunctionCall({ path: '/a' }), false)
})

test('isTemplateChildList distinguishes template object from static array', () => {
  assert.equal(isTemplateChildList({ componentId: 'row', path: '/items' }), true)
  assert.equal(isTemplateChildList(['a', 'b']), false)
  assert.equal(isTemplateChildList({ componentId: 'row' }), false) // path required
})
