import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import _generate from '@babel/generator'
import { emitSlot } from '../../src/closure-codegen/emit/emit-slot.js'
import { t } from '../../src/utils/babel-interop.js'

const generate = (_generate as any).default ?? _generate

describe('emitSlot - direct props fallback', () => {
  it('uses undefined instead of 0 for missing props', () => {
    const mockContext = {
      bindings: new Map(),
      reactiveRoot: t.identifier('root'),
      importsNeeded: new Set(),
      directFnComponentParams: new Map([['FooButton', { props: ['someProp'] }]]),
    } as any

    const slot = {
      kind: 'direct-fn',
      index: 1,
      payload: {
        tag: 'FooButton',
        attrs: [],
      },
    }

    const stmts: any[] = []
    emitSlot(slot as any, stmts, mockContext)

    const generatedCode = stmts.map((s) => generate(s).code).join('\n')
    assert.ok(!generatedCode.includes('0'))
    assert.ok(generatedCode.includes('undefined'))
  })
})
