import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { build, createServer, type InlineConfig } from 'vite'
import { geaPlugin } from '../../src/index.ts'

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

// The #104 repro. The injected GEA_PROXY_RAW import clashes with the file's
// own, so the compiled output doesn't parse. If that clash gets fixed, swap in
// another way to make the emitted code invalid.
const CLASHING_IMPORT_APP = `import { Component, GEA_PROXY_RAW } from '@geajs/core'

export default class App extends Component {
  rows = [{ id: 1, label: 'first row' }]

  template() {
    return (
      <ul class="list">
        {this.rows.map((row) => (
          <li key={row.id}>{row.label}</li>
        ))}
      </ul>
    )
  }
}

export const raw = GEA_PROXY_RAW
`

const MEMBER_TAG_APP = `import { Component } from '@geajs/core'
import * as ui from './ui'

export default class App extends Component {
  template() {
    return (
      <div>
        <ui.Button />
      </div>
    )
  }
}
`

describe('compile errors fail the build and reach the dev overlay (#104)', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function project(files: Record<string, string>): { root: string; config: InlineConfig } {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'gea-compile-errors-')))
    dirs.push(root)
    const all: Record<string, string> = {
      'index.html': '<!doctype html><div id="app"></div><script type="module" src="/src/main.ts"></script>',
      'src/main.ts': `import App from './App'\nnew App().render(document.getElementById('app')!)\n`,
      ...files,
    }
    for (const [name, source] of Object.entries(all)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
      writeFileSync(path.join(root, name), source)
    }
    const config: InlineConfig = {
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [geaPlugin()],
      resolve: { alias: [{ find: '@geajs/core', replacement: path.join(packagesDir, 'gea/src') }] },
      build: { write: false },
      server: { middlewareMode: true, hmr: false, ws: false },
    }
    return { root, config }
  }

  async function buildError(config: InlineConfig): Promise<any> {
    try {
      await build(config)
    } catch (error: any) {
      return error.errors?.[0] ?? error
    }
    assert.fail('vite build should fail')
  }

  it('vite build fails when the compiled output is invalid, pointing at the source', async () => {
    const { root, config } = project({ 'src/App.tsx': CLASHING_IMPORT_APP })
    const err = await buildError(config)
    const file = path.join(root, 'src/App.tsx')

    assert.match(err.message, /\[gea\] The compiled output is invalid JavaScript/)
    assert.match(err.message, /Identifier 'GEA_PROXY_RAW' has already been declared/)
    assert.ok(err.message.includes(`${file}:1:20`), err.message)
    assert.equal(err.plugin, 'gea-plugin')
    // 1:20 is GEA_PROXY_RAW in the user's own import, not a position in the compiled code.
    assert.deepEqual({ ...err.loc }, { file, line: 1, column: 20 })
  })

  it('the dev server rejects the module with a code frame on the source', async () => {
    const { root, config } = project({ 'src/App.tsx': CLASHING_IMPORT_APP })
    const server = await createServer(config)
    try {
      await assert.rejects(server.transformRequest('/src/App.tsx'), (err: any) => {
        assert.match(err.message, /\[gea\] The compiled output is invalid JavaScript/)
        assert.equal(err.plugin, 'gea-plugin')
        assert.deepEqual({ ...err.loc }, { file: path.join(root, 'src/App.tsx'), line: 1, column: 20 })
        assert.match(err.frame, /1 {2}\| {2}import \{ Component, GEA_PROXY_RAW \} from '@geajs\/core'\n {3}\| {22}\^/)
        return true
      })
    } finally {
      await server.close()
    }
  })

  it('vite build fails on a deliberate compiler error, with its hint', async () => {
    const { root, config } = project({
      'src/App.tsx': MEMBER_TAG_APP,
      'src/ui.ts': `export class Button {}\n`,
    })
    const err = await buildError(config)
    const file = path.join(root, 'src/App.tsx')

    assert.match(err.message, /\[gea\] Member-expression JSX tags like <ui\.Button> are not supported\./)
    assert.match(err.message, /Import the component and use it by name/)
    assert.ok(err.message.includes(`${file}:8:9`), err.message)
    assert.deepEqual({ ...err.loc }, { file, line: 8, column: 9 })
  })

  it('still leaves files Babel cannot parse to Vite', async () => {
    // `<T>value` is valid TypeScript in a .ts file, but Babel's jsx+typescript
    // parser rejects it. That is the one failure that stays soft.
    const { config } = project({
      'src/App.tsx': `import { Component } from '@geajs/core'
import { width } from './size'
export default class App extends Component {
  template() { return <div>{width}</div> }
}
`,
      'src/size.ts': `const raw: unknown = 3\nexport const width = <number>raw > 2 ? 'wide' : 'narrow'\n`,
    })
    await build(config)
  })
})
