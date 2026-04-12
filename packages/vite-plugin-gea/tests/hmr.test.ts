import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { transformSource } from '../src/transform/index.ts'

/**
 * v2 compiler does NOT have a separate HMR postprocess module.
 * These tests verify that transformSource correctly transforms component
 * classes, named/default exports, multi-component files, and various
 * import patterns — the core compilation behaviors that were previously
 * bundled with HMR injection tests.
 */

describe('transformSource – component class transforms', () => {
  describe('basic transformation', () => {
    it('transforms a component class with a template', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        export default class Counter extends Component {
          template() { return <div>Counter</div> }
        }
      `, '/virtual/Counter.jsx')

      assert.ok(code, 'should return transformed code')
      assert.ok(code.includes('GEA_CREATE_TEMPLATE'), 'should rename template to GEA_CREATE_TEMPLATE')
      assert.ok(code.includes('template('), 'should have template() call from runtime')
      assert.ok(code.includes('@geajs/core/runtime'), 'should import from runtime')
    })

    it('returns null when no component classes are present', () => {
      const code = transformSource(`
        export const config = { foo: 'bar' }
      `, '/virtual/config.ts')

      assert.equal(code, null, 'should return null for non-component files')
    })
  })

  describe('import injection', () => {
    it('adds runtime imports for used helpers', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        export default class App extends Component {
          template() { return <div></div> }
        }
      `, '/virtual/App.jsx')

      assert.ok(code)
      assert.ok(code.includes('@geajs/core/runtime'), 'should import from @geajs/core/runtime')
      assert.ok(code.includes('template'), 'should import template helper')
    })

    it('includes reactiveContent when template has dynamic text', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        export default class App extends Component {
          template(props) { return <div>{props.name}</div> }
        }
      `, '/virtual/App.jsx')

      assert.ok(code)
      assert.ok(code.includes('reactiveContent'), 'should import reactiveContent for dynamic text')
    })
  })

  describe('named export vs default export', () => {
    it('handles named export', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        export class MyWidget extends Component {
          template() { return <div></div> }
        }
      `, '/virtual/MyWidget.jsx')

      assert.ok(code)
      assert.ok(code.includes('export class MyWidget'), 'should preserve named export')
      assert.ok(code.includes('GEA_CREATE_TEMPLATE'), 'should transform template method')
    })

    it('handles default export', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        export default class MyWidget extends Component {
          template() { return <div></div> }
        }
      `, '/virtual/MyWidget.jsx')

      assert.ok(code)
      assert.ok(code.includes('export default class MyWidget'), 'should preserve default export')
      assert.ok(code.includes('GEA_CREATE_TEMPLATE'), 'should transform template method')
    })
  })

  describe('component with store imports', () => {
    it('preserves store imports in transformed output', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        import { myStore } from './my-store'
        export default class App extends Component {
          template() { return <div>{myStore.count}</div> }
        }
      `, '/virtual/App.jsx')

      assert.ok(code)
      assert.ok(code.includes('./my-store'), 'should preserve store import')
      assert.ok(code.includes('myStore.count'), 'should reference store in template')
    })

    it('handles child component imports with mount', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        import ChildComp from './child-comp.ts'
        export default class App extends Component {
          template() { return <div><ChildComp name="test" /></div> }
        }
      `, '/virtual/App.jsx')

      assert.ok(code)
      assert.ok(code.includes('mount'), 'should use mount for child components')
      assert.ok(code.includes('ChildComp'), 'should reference ChildComp')
    })
  })

  describe('template transformation details', () => {
    it('generates template literal for static HTML', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        export default class Test extends Component {
          template() { return <div id="test" class="foo">hello</div> }
        }
      `, '/virtual/Test.jsx')

      assert.ok(code)
      assert.ok(code.includes("template("), 'should use template() helper')
      assert.ok(code.includes('GEA_CREATE_TEMPLATE'), 'should rename template to GEA_CREATE_TEMPLATE')
    })

    it('generates reactiveAttr for dynamic attributes', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        export default class Test extends Component {
          template(props) { return <div class={props.active ? 'on' : 'off'}>test</div> }
        }
      `, '/virtual/Test.jsx')

      assert.ok(code)
      assert.ok(code.includes('reactiveAttr'), 'should use reactiveAttr for dynamic class')
    })

    it('transforms all classes in a multi-component file', () => {
      const code = transformSource(`
        import { Component } from '@geajs/core'
        export default class Home extends Component {
          template() { return <div>Home</div> }
        }
        export class About extends Component {
          template() { return <div>About</div> }
        }
        export class NotFound extends Component {
          template() { return <div>404</div> }
        }
      `, '/virtual/pages.jsx')

      assert.ok(code)
      // All three classes should have GEA_CREATE_TEMPLATE
      const createTemplateCount = (code.match(/GEA_CREATE_TEMPLATE/g) || []).length
      assert.ok(
        createTemplateCount >= 3,
        `should transform all 3 component templates, found ${createTemplateCount} GEA_CREATE_TEMPLATE occurrences`,
      )
      assert.ok(code.includes('export default class Home'), 'should preserve Home default export')
      assert.ok(code.includes('export class About'), 'should preserve About named export')
      assert.ok(code.includes('export class NotFound'), 'should preserve NotFound named export')
    })
  })

  describe('skip transformation', () => {
    it('returns null for files without JSX or gea imports', () => {
      const code = transformSource(`
        export function helper() { return 42 }
      `, '/virtual/helper.ts')

      assert.equal(code, null)
    })

    it('transforms Store classes (fields to signals)', () => {
      const code = transformSource(`
        import { Store } from '@geajs/core'
        export class MyStore extends Store {
          count = 0
          name = 'test'
        }
      `, '/virtual/store.ts')

      assert.ok(code)
      assert.ok(code.includes('signal'), 'should transform fields to signals')
      assert.ok(code.includes('get count'), 'should generate getter for count')
      assert.ok(code.includes('set count'), 'should generate setter for count')
    })
  })
})
