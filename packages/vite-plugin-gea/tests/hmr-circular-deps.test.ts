import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { transformSource } from '../src/transform/index.ts'

/**
 * v2 compiler does NOT have HMR circular dependency prevention.
 * These tests verify that transformSource correctly handles files with
 * various import patterns — component files get transformed, non-component
 * files are left alone (return null), and child component references
 * are compiled with mount.
 */

describe('transform with component imports', () => {
  describe('non-component files return null', () => {
    it('returns null for router files that import components but have no JSX', () => {
      const result = transformSource(
        [
          "import { createRouter } from '@geajs/core'",
          "import Home, { About } from './pages'",
          "export const router = createRouter({ '/': Home, '/about': About })",
        ].join('\n'),
        '/virtual/router.ts',
      )

      assert.equal(result, null, 'router file without JSX should not be transformed')
    })

    it('returns null for config files without component classes or JSX', () => {
      const result = transformSource(
        [
          "import { config } from './config'",
          'export const router = config',
        ].join('\n'),
        '/virtual/router.ts',
      )

      assert.equal(result, null, 'plain config file should not be transformed')
    })

    it('returns null for utility files', () => {
      const result = transformSource(
        'export function formatDate(d) { return d.toISOString() }',
        '/virtual/utils.ts',
      )

      assert.equal(result, null, 'utility file should not be transformed')
    })
  })

  describe('component files are transformed', () => {
    it('transforms a component file that is a default export', () => {
      const result = transformSource(
        [
          "import { Component } from '@geajs/core'",
          'export default class Home extends Component {',
          '  template() { return <div>Home</div> }',
          '}',
        ].join('\n'),
        '/virtual/Home.jsx',
      )

      assert.ok(result, 'component file should be transformed')
      assert.ok(result.includes('GEA_CREATE_TEMPLATE'), 'should rename template to GEA_CREATE_TEMPLATE')
      assert.ok(result.includes('@geajs/core/runtime'), 'should add runtime import')
    })

    it('transforms a file with multiple component exports', () => {
      const result = transformSource(
        [
          "import { Component } from '@geajs/core'",
          'export default class Home extends Component {',
          '  template() { return <div>Home</div> }',
          '}',
          'export class About extends Component {',
          '  template() { return <div>About</div> }',
          '}',
        ].join('\n'),
        '/virtual/pages.jsx',
      )

      assert.ok(result, 'multi-component file should be transformed')
      const count = (result.match(/GEA_CREATE_TEMPLATE/g) || []).length
      assert.ok(count >= 2, `should transform both component templates, found ${count}`)
    })

    it('transforms component that imports and uses another component via mount', () => {
      const result = transformSource(
        [
          "import { Component } from '@geajs/core'",
          "import Home from './home'",
          'export default class App extends Component {',
          '  template() { return <div><Home /></div> }',
          '}',
        ].join('\n'),
        '/virtual/App.jsx',
      )

      assert.ok(result, 'should transform component with child component')
      assert.ok(result.includes('mount'), 'should use mount for child component references')
      assert.ok(result.includes('Home'), 'should reference Home component')
    })

    it('transforms component that imports a store and reads its state', () => {
      const result = transformSource(
        [
          "import { Component } from '@geajs/core'",
          "import store from './store'",
          'export default class Counter extends Component {',
          '  template() { return <div>{store.count}</div> }',
          '}',
        ].join('\n'),
        '/virtual/Counter.jsx',
      )

      assert.ok(result, 'should transform component with store import')
      assert.ok(result.includes('store.count'), 'should reference store.count')
      assert.ok(
        result.includes('reactiveContent') || result.includes('computation'),
        'should use reactiveContent or computation for dynamic text',
      )
    })
  })

  describe('store files are transformed', () => {
    it('transforms store fields into signals', () => {
      const result = transformSource(
        [
          "import { Store } from '@geajs/core'",
          'export default class AppStore extends Store {',
          '  count = 0',
          "  name = 'test'",
          '}',
        ].join('\n'),
        '/virtual/store.ts',
      )

      assert.ok(result, 'store file should be transformed')
      assert.ok(result.includes('signal'), 'should use signal() for fields')
      assert.ok(result.includes('get count'), 'should generate getter')
      assert.ok(result.includes('set count'), 'should generate setter')
    })
  })
})
