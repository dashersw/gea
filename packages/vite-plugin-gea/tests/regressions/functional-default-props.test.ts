import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import _generate from '@babel/generator'
import { convertFunctionalToClass } from '../../src/preprocess/functional-to-class.js'

const generate = (_generate as any).default ?? _generate

describe('convertFunctionalToClass - default props', () => {
  it('preserves variable declarations when default values are present', () => {
    const code = `
      export default function MyComponent({ class: cls = "default-class" }) {
        return <div className={cls} />;
      }
    `
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] })
    convertFunctionalToClass(ast, { name: 'MyComponent', kind: 'default' }, new Map())

    const output = generate(ast).code
    assert.match(output, /class MyComponent/)
    assert.match(output, /template\(\s*{\s*class: cls = "default-class"\s*}\s*\)/)
  })
})
