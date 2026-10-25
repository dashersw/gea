import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import _generate from '@babel/generator'
import { emitSlot } from '../../src/closure-codegen/emit/emit-slot.js'
import { t } from '../../src/utils/babel-interop.js'

const generate = (_generate as any).default ?? _generate

describe('emitSlot and functional components - missing children & props fallback', () => {
  it('uses void 0 for missing slot attributes', () => {
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
    assert.match(generatedCode, /FooButton\(\s*void 0,\s*d\s*\)/)
  })

  it('renders a blank button when children are omitted, not placeholder 0', () => {
    const mockContext = {
      bindings: new Map(),
      reactiveRoot: t.identifier('root'),
      importsNeeded: new Set(),
      directFnComponentParams: new Map([['FooButton', { props: ['children'] }]]),
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

    // Execute the emitted slot code against a minimal DOM-backed component.
    // An omitted children prop must reach FooButton as undefined, not 0 or d.
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    const anchor1 = dom.window.document.createComment('slot')
    dom.window.document.body.append(anchor1)

    const FooButton = (children: unknown, _disposer: unknown) => {
      const button = dom.window.document.createElement('button')
      if (children != null) button.textContent = String(children)
      return button
    }

    runInNewContext(generatedCode, {
      FooButton,
      d: () => {},
      anchor1,
    })

    assert.equal(dom.window.document.body.innerHTML, '<button></button>')
  })
})
