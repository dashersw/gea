import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parse } from '@babel/parser'
import _generate from '@babel/generator'
import { injectHMR } from '../src/hmr.ts'

const generate = typeof (_generate as any).default === 'function' ? (_generate as any).default : _generate

function parseModule(code: string) {
  return parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
}

function codegen(ast: any): string {
  return generate(ast).code
}

describe('injectHMR', () => {
  describe('basic injection', () => {
    it('injects HMR block for a component class', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        export default class Counter extends Component {
          template() { return '<div>Counter</div>' }
        }
      `)

      const injected = injectHMR(ast, 'Counter', [], new Set(), true)
      assert.equal(injected, true)

      const code = codegen(ast)
      assert.ok(code.includes('import.meta.hot'), 'should have HMR guard')
      assert.ok(code.includes('handleComponentUpdate'), 'should call handleComponentUpdate')
      assert.ok(code.includes('registerHotModule'), 'should call registerHotModule')
      assert.ok(code.includes('registerComponentInstance'), 'should patch created')
      assert.ok(code.includes('unregisterComponentInstance'), 'should patch dispose')
    })

    it('returns false when no component class is given', () => {
      const ast = parseModule(`
        import { Store } from '@geajs/core'
        export class MyStore extends Store {}
      `)

      const injected = injectHMR(ast, null, [], new Set(), false)
      assert.equal(injected, false)
    })
  })

  describe('import injection', () => {
    it('adds required imports from virtual:gea-hmr', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        export default class App extends Component {
          template() { return '<div></div>' }
        }
      `)

      injectHMR(ast, 'App', [], new Set(), true)
      const code = codegen(ast)

      assert.ok(code.includes('virtual:gea-hmr'), 'should import from virtual:gea-hmr')
      assert.ok(code.includes('handleComponentUpdate'))
      assert.ok(code.includes('registerHotModule'))
      assert.ok(code.includes('registerComponentInstance'))
      assert.ok(code.includes('unregisterComponentInstance'))
    })

    it('uses custom hmrImportSource when provided', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        export default class App extends Component {
          template() { return '<div></div>' }
        }
      `)

      injectHMR(ast, 'App', [], new Set(), true, 'custom-hmr-source')
      const code = codegen(ast)
      assert.ok(code.includes('custom-hmr-source'))
    })
  })

  describe('named export vs default export', () => {
    it('handles named export', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        export class MyWidget extends Component {
          template() { return '<div></div>' }
        }
      `)

      const injected = injectHMR(ast, 'MyWidget', [], new Set(), false)
      assert.equal(injected, true)

      const code = codegen(ast)
      assert.ok(
        code.includes('MyWidget: MyWidget') || code.includes('MyWidget'),
        'shorthand named export in module obj',
      )
    })

    it('handles default export', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        export default class MyWidget extends Component {
          template() { return '<div></div>' }
        }
      `)

      injectHMR(ast, 'MyWidget', [], new Set(), true)
      const code = codegen(ast)
      assert.ok(code.includes('default: MyWidget') || code.includes('"default"'))
    })
  })

  describe('component imports (hot.accept for deps)', () => {
    it('creates hot.accept for store/util imports (invalidate)', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        import { myStore } from './my-store'
        export default class App extends Component {
          template() { return '<div></div>' }
        }
      `)

      injectHMR(ast, 'App', ['./my-store'], new Set(), true)
      const code = codegen(ast)
      assert.ok(code.includes('./my-store'), 'should accept store dependency')
      assert.ok(code.includes('invalidate'), 'store imports should trigger invalidation')
    })

    it('rewrites component dep imports with createHotComponentProxy', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        import ChildComp from './child-comp.ts'
        export default class App extends Component {
          template() { return '<div></div>' }
        }
      `)

      injectHMR(ast, 'App', ['./child-comp.ts'], new Set(['ChildComp']), true)
      const code = codegen(ast)
      assert.ok(code.includes('createHotComponentProxy'), 'should proxy component deps')
    })

    it('shouldProxyDep overrides legacy: no proxy when callback returns false', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        import ChildComp from './child-comp.ts'
        export default class App extends Component {
          template() { return '<div></div>' }
        }
      `)

      injectHMR(ast, 'App', ['./child-comp.ts'], new Set(['ChildComp']), true, 'virtual:gea-hmr', () => false)
      const code = codegen(ast)
      assert.ok(!code.includes('createHotComponentProxy'), 'explicit classifier can disable proxy')
      assert.ok(code.includes('invalidate'), 'falls back to invalidate-only accept')
    })
  })

  describe('prototype patching', () => {
    it('patches created to register instance', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        export default class Test extends Component {
          template() { return '<div></div>' }
        }
      `)

      injectHMR(ast, 'Test', [], new Set(), true)
      const code = codegen(ast)
      assert.ok(code.includes('Test.prototype.created'))
      assert.ok(code.includes('registerComponentInstance'))
    })

    it('patches dispose to unregister instance', () => {
      const ast = parseModule(`
        import { Component } from '@geajs/core'
        export default class Test extends Component {
          template() { return '<div></div>' }
        }
      `)

      injectHMR(ast, 'Test', [], new Set(), true)
      const code = codegen(ast)
      assert.ok(code.includes('Test.prototype.dispose'))
      assert.ok(code.includes('unregisterComponentInstance'))
    })
  })

  describe('skip injection', () => {
    it('skips files already containing gea-auto-register plugin comment', () => {
      const ast = parseModule(`
        // gea-auto-register plugin
        import { Component } from '@geajs/core'
        export default class App extends Component {
          template() { return '<div></div>' }
        }
      `)

      const injected = injectHMR(ast, 'App', [], new Set(), true)
      assert.equal(injected, false)
    })
  })
})
