/**
 * Documents compile-time and codegen contracts (children shapes, XSS-related wiring).
 * Closure-compiled emission uses text/attr/patch helpers at runtime;
 * dedicated geaEscapeHtml / geaSanitizeAttr call sites may appear in other pipelines.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { transformFile } from '../../src/closure-codegen/transform.ts'

function compile(src: string) {
  return transformFile(src, '/virtual/Contract.tsx')
}

describe('plugin compiler contracts (closure codegen)', () => {
  it('interpolated text uses scalar text helper in emitted code', () => {
    const { code, changed } = compile(
      `import { Component } from '@geajs/core'
export default class C extends Component {
  name = 'a'
  template() { return <div>{this.name}</div> }
}`,
    )
    assert.equal(changed, true)
    assert.match(code, /reactiveTextValue\(/)
  })

  it('dynamic href uses reactiveAttr on the attribute name "href"', () => {
    const { code, changed } = compile(
      `import { Component } from '@geajs/core'
export default class C extends Component {
  u = 'https://a.com'
  template() { return <a href={this.u}>x</a> }
}`,
    )
    assert.equal(changed, true)
    assert.match(code, /reactiveAttr\(/)
    assert.ok(code.includes('"href"') || code.includes("'href'"))
  })

  it('dynamic src uses reactiveAttr', () => {
    const { code, changed } = compile(
      `import { Component } from '@geajs/core'
export default class C extends Component {
  s = 'x.png'
  template() { return <img src={this.s} alt="" /> }
}`,
    )
    assert.equal(changed, true)
    assert.match(code, /reactiveAttr\(/)
  })

  it('JSX spread: file is still rewritten; spread is not expanded in the template walker (known limitation)', () => {
    const { code, changed } = compile(
      `import { Component } from '@geajs/core'
const extra = { id: 'e' } as any
export default class C extends Component {
  template() { return <div {...extra}>a</div> }
}`,
    )
    assert.equal(changed, true)
    assert.ok(code.includes('reactiveText') || code.includes('_tpl'), 'transform should still emit a template')
  })

  it('function-valued JSX child: transform still emits runnable code (not a hard error today)', () => {
    const { code, changed } = compile(
      `import { Component } from '@geajs/core'
export default class C extends Component {
  template() { return <div>{() => 'x'}</div> }
}`,
    )
    assert.equal(changed, true)
    assert.ok(code.length > 80)
  })
})
