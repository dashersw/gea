import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import { mount, createDisposer } from '@geajs/core/compiler-runtime'
import { VERSION } from '../src/index'

test('package resolves core, compiler-runtime, and a DOM', () => {
  assert.equal(typeof document, 'object')
  assert.equal(typeof Store, 'function')
  assert.equal(typeof mount, 'function')
  assert.equal(typeof createDisposer, 'function')
  assert.equal(VERSION, '0.1.0')
})
