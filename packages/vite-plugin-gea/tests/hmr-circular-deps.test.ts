import assert from 'node:assert/strict'
import { describe, it, afterEach } from 'node:test'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// The functions under test are not exported, so we test them indirectly
// through the plugin's transform hook. Import the plugin factory.
import { geaPlugin } from '../src/index.ts'

const TMP_ROOT = join(tmpdir(), 'gea-hmr-circular-test-' + Date.now())

function createFixture(files: Record<string, string>): string {
  const root = join(TMP_ROOT, String(Math.random()).slice(2, 10))
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

describe('HMR circular dependency prevention', () => {
  afterEach(() => {
    try {
      rmSync(TMP_ROOT, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  })

  describe('store modules get HMR dep-accept for component imports', () => {
    it('injects hot.accept for directory import that resolves to component index file', () => {
      const root = createFixture({
        'src/router.ts': [
          "import { createRouter } from '@geajs/core/router'",
          "import Home, { About } from './pages'",
          "export const router = createRouter({ '/': Home, '/about': About } as const)",
        ].join('\n'),
        'src/pages/index.tsx': [
          "import { Component } from '@geajs/core'",
          'export default class Home extends Component {',
          '  template() { return <div>Home</div> }',
          '}',
          'export class About extends Component {',
          '  template() { return <div>About</div> }',
          '}',
        ].join('\n'),
      })

      const plugin = geaPlugin() as any
      plugin.configResolved({ command: 'serve' })

      const routerPath = join(root, 'src/router.ts')
      const routerCode =
        "import { createRouter } from '@geajs/core/router'\nimport Home, { About } from './pages'\nexport const router = createRouter({ '/': Home, '/about': About } as const)"

      const result = plugin.transform.call({ environment: { name: 'client' } }, routerCode, routerPath)

      assert.ok(result, 'should return transformed code for router.ts')
      assert.ok(result.code.includes('import.meta.hot'), 'should inject HMR block')
      assert.ok(result.code.includes("import.meta.hot.accept('./pages'"), 'should accept updates from ./pages')
    })

    it('injects hot.accept for .tsx file import that resolves to component', () => {
      const root = createFixture({
        'src/router.ts': [
          "import { createRouter } from '@geajs/core/router'",
          "import Home from './home'",
          "export const router = createRouter({ '/': Home } as const)",
        ].join('\n'),
        'src/home.tsx': [
          "import { Component } from '@geajs/core'",
          'export default class Home extends Component {',
          '  template() { return <div>Home</div> }',
          '}',
        ].join('\n'),
      })

      const plugin = geaPlugin() as any
      plugin.configResolved({ command: 'serve' })

      const routerPath = join(root, 'src/router.ts')
      const routerCode =
        "import { createRouter } from '@geajs/core/router'\nimport Home from './home'\nexport const router = createRouter({ '/': Home } as const)"

      const result = plugin.transform.call({ environment: { name: 'client' } }, routerCode, routerPath)

      assert.ok(result, 'should return transformed code')
      assert.ok(result.code.includes("import.meta.hot.accept('./home'"), 'should accept updates from ./home')
    })

    it('does NOT inject HMR for imports that are not component files', () => {
      const root = createFixture({
        'src/router.ts': [
          "import { createRouter } from '@geajs/core/router'",
          "import { config } from './config'",
          'export const router = createRouter(config)',
        ].join('\n'),
        'src/config.ts': ["export const config = { '/': null }"].join('\n'),
      })

      const plugin = geaPlugin() as any
      plugin.configResolved({ command: 'serve' })

      const routerPath = join(root, 'src/router.ts')
      const routerCode =
        "import { createRouter } from '@geajs/core/router'\nimport { config } from './config'\nexport const router = createRouter(config)"

      const result = plugin.transform.call({ environment: { name: 'client' } }, routerCode, routerPath)

      assert.equal(result, null, 'should not transform when no component deps')
    })

    it('does NOT inject HMR in build mode (only serve)', () => {
      const root = createFixture({
        'src/router.ts': [
          "import { createRouter } from '@geajs/core/router'",
          "import Home from './pages'",
          "export const router = createRouter({ '/': Home } as const)",
        ].join('\n'),
        'src/pages/index.tsx': [
          "import { Component } from '@geajs/core'",
          'export default class Home extends Component {',
          '  template() { return <div>Home</div> }',
          '}',
        ].join('\n'),
      })

      const plugin = geaPlugin() as any
      plugin.configResolved({ command: 'build' })

      const routerPath = join(root, 'src/router.ts')
      const routerCode =
        "import { createRouter } from '@geajs/core/router'\nimport Home from './pages'\nexport const router = createRouter({ '/': Home } as const)"

      const result = plugin.transform.call({ environment: { name: 'client' } }, routerCode, routerPath)

      assert.equal(result, null, 'should not inject HMR in build mode')
    })
  })

  describe('directory import resolution', () => {
    it('resolves ./pages to ./pages/index.tsx when directory exists', () => {
      const root = createFixture({
        'src/app.ts': "import Foo from './components'",
        'src/components/index.tsx': [
          "import { Component } from '@geajs/core'",
          'export default class Foo extends Component {',
          '  template() { return <div>Foo</div> }',
          '}',
        ].join('\n'),
      })

      const plugin = geaPlugin() as any
      plugin.configResolved({ command: 'serve' })

      const appPath = join(root, 'src/app.ts')
      const appCode = "import Foo from './components'"

      const result = plugin.transform.call({ environment: { name: 'client' } }, appCode, appPath)

      assert.ok(result, 'should detect component dep through directory/index.tsx')
      assert.ok(
        result.code.includes("import.meta.hot.accept('./components'"),
        'should accept updates from ./components',
      )
    })

    it('resolves ./home to ./home.tsx', () => {
      const root = createFixture({
        'src/app.ts': "import Home from './home'",
        'src/home.tsx': [
          "import { Component } from '@geajs/core'",
          'export default class Home extends Component {',
          '  template() { return <div>Home</div> }',
          '}',
        ].join('\n'),
      })

      const plugin = geaPlugin() as any
      plugin.configResolved({ command: 'serve' })

      const appPath = join(root, 'src/app.ts')
      const appCode = "import Home from './home'"

      const result = plugin.transform.call({ environment: { name: 'client' } }, appCode, appPath)

      assert.ok(result, 'should detect component dep via .tsx extension')
      assert.ok(result.code.includes("import.meta.hot.accept('./home'"))
    })
  })
})
