import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

function createServePlugin() {
  const plugin = geaPlugin() as any
  plugin.configResolved({ command: 'serve', build: {} })
  return plugin
}

describe('geaPlugin dev semantic transforms', () => {
  it('compiles Store classes during vite dev', () => {
    const plugin = createServePlugin()
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
    const plugin = createServePlugin()
    const source = `import store from './store'
store.observe('user.profile.name', () => {})
`

    const result = plugin.transform.call({ environment: { name: 'client' } }, source, '/src/observer.ts')

    assert.ok(result?.code)
    assert.match(result.code, /store\.observe\(\["user", "profile", "name"\]/)
  })

  it('runs static root mount inlining during vite dev and watches inlined files', () => {
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
    const plugin = createServePlugin()
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
    assert.doesNotMatch(result.code, /import App/)
    assert.doesNotMatch(result.code, /new App/)
    assert.match(result.code, /root\.appendChild\(__gea_root0_create\(\)\)/)
    assert.deepEqual(watched.filter((file) => file === appPath), [appPath])
    assert.equal(existsSync(appPath), true)
  })
})
