import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { geaPlugin } from '../../src/index.ts'

describe('geaPlugin transform — jsx/tsx entry files', () => {
  it('transforms a .jsx component file', () => {
    const plugin = geaPlugin() as { transform: (c: string, id: string) => { code: string } | null }
    const code = `import { Component } from '@geajs/core'
export default class A extends Component {
  template() { return <div class="x">jsx</div> }
}
`
    const out = plugin.transform?.call(
      { environment: { name: 'client' } } as { environment: { name: string } },
      code,
      '/src/App.jsx',
    ) as { code: string } | null
    assert.ok(out && out.code, 'transform should return code for .jsx')
    assert.ok(
      out!.code.includes('GEA_CREATE_TEMPLATE') ||
        out!.code.includes('GEA_STATIC_TEMPLATE') ||
        out!.code.includes('gea.component.createTemplate'),
      'output should be closure-compiled',
    )
  })

  it('transforms a .tsx component file', () => {
    const plugin = geaPlugin() as { transform: (c: string, id: string) => { code: string } | null }
    const code = `import { Component } from '@geajs/core'
export default class T extends Component {
  template() { return <div>ts</div> }
}
`
    const out = plugin.transform?.call(
      { environment: { name: 'client' } } as { environment: { name: string } },
      code,
      '/src/Widget.tsx',
    ) as { code: string } | null
    assert.ok(out && out.code)
  })
})
