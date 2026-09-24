import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { geaPlugin } from '../src/index.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
  roots.length = 0
})

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gea-dev-semantic-transforms-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source, 'utf8')
  return root
}

function createPlugin(command: 'serve' | 'build' = 'serve') {
  const plugin = geaPlugin() as any
  plugin.configResolved({ command, build: {} })
  return plugin
}

describe('geaPlugin dev semantic transforms', () => {
  it('compiles Store classes during vite dev', () => {
    const plugin = createPlugin()
    const source = `import { Store } from '@geajs/core'
class CounterStore extends Store {
  count = 0
  inc() {
    this.count++
  }
}
export default new CounterStore()
`

    const result = plugin.transform.call({ environment: { name: 'client' } }, source, '/src/counter-store.ts')

    assert.ok(result?.code)
    assert.match(result.code, /Compiled(?:Lean)?Store/)
    assert.match(result.code, /extends Compiled(?:Lean)?Store/)
    assert.doesNotMatch(result.code, /extends Store/)
  })

  it('rewrites dotted observe paths during vite dev', () => {
    const plugin = createPlugin()
    const source = `import store from './store'
store.observe('user.profile.name', () => {})
`

    const result = plugin.transform.call({ environment: { name: 'client' } }, source, '/src/observer.ts')

    assert.ok(result?.code)
    assert.match(result.code, /store\.observe\(\["user", "profile", "name"\]/)
  })

  for (const command of ['serve', 'build'] as const) {
    it(
      command === 'serve'
        ? 'preserves root component boundaries and HMR registration during vite dev'
        : 'inlines static root mounts and watches their sources during production builds',
      () => {
        const root = fixture({
          'App.tsx': `import { Component } from '@geajs/core'
export default class App extends Component {
  template() { return <div>Hello Dev</div> }
}`,
          'main.ts': `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
        })
        const watched: string[] = []
        const plugin = createPlugin(command)
        const mainPath = join(root, 'main.ts')
        const appPath = join(root, 'App.tsx')

        const result = plugin.transform.call(
          {
            environment: { name: 'client' },
            addWatchFile(file: string) {
              watched.push(file)
            },
          },
          `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
          mainPath,
        )

        assert.ok(result?.code)
        if (command === 'serve') {
          assert.match(result.code, /import App/)
          assert.match(result.code, /new App\(\)\.render\(root\)/)
          assert.doesNotMatch(result.code, /__gea_root0_create/)
          assert.deepEqual(watched, [], 'Vite tracks the component through its retained import')

          const component = plugin.transform.call(
            { environment: { name: 'client' } },
            readFileSync(appPath, 'utf8'),
            appPath,
          )
          assert.ok(component?.code)
          assert.match(component.code, /registerComponentInstance/)
          assert.match(component.code, /handleComponentUpdate/)
          assert.match(component.code, /import\.meta\.hot\.accept/)
        } else {
          assert.doesNotMatch(result.code, /import App/)
          assert.doesNotMatch(result.code, /new App/)
          assert.match(result.code, /root\.appendChild\(__gea_root0_create\(\)\)/)
          assert.deepEqual(
            watched.filter((file) => file === appPath),
            [appPath],
          )
          assert.doesNotMatch(result.code, /import\.meta\.hot/)
        }
      },
    )
  }
})
