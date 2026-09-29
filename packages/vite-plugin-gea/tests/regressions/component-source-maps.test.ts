import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { SourceMap } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { build, createServer, type InlineConfig, type ResolvedConfig } from 'vite'
import { geaPlugin } from '../../src/index.ts'

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

// Every `'…-token'` literal must map back to its own line and column. App is
// the #131 repro. The others take the compile steps that print and re-parse
// the code before transformFile runs (arrow → function, function → class), or
// splice in code parsed from a template string (keyed list).
const SOURCES: Record<string, string> = {
  'App.tsx': `import { Component } from '@geajs/core'

export default class App extends Component {
  label = 'hello'

  rename() {
    this.label = 'renamed-token'
  }

  template() {
    return (
      <div>
        <p class="label">{this.label}</p>
        <button click={() => this.rename()}>rename</button>
      </div>
    )
  }

  helper() {
    return 'helper-token'
  }
}
`,
  'Arrow.tsx': `const Arrow = ({ name }: { name: string }) => {


  const greeting = 'arrow-token'
  return <p class="arrow">{greeting} {name}</p>
}

export default Arrow
`,
  'Greeting.tsx': `export default function Greeting() {

  const text = 'function-token'
  return <span class="greeting">{text}</span>
}
`,
  'List.tsx': `import { Component } from '@geajs/core'

export default class List extends Component {
  rows = [{ id: 1, label: 'first' }]

  add() {
    this.rows.push({ id: 2, label: 'list-token' })
  }

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
`,
}

const MAIN = `import App from './App'
import Arrow from './Arrow'
import Greeting from './Greeting'
import List from './List'
console.log(App, Arrow, Greeting, List)
`

interface Position {
  file: string
  line: number
  column: number
}

/** Each token literal in `source`, with its 1-based line and 0-based column. */
function tokensIn(file: string, source: string): Map<string, Position> {
  const tokens = new Map<string, Position>()
  source.split('\n').forEach((text, i) => {
    for (const m of text.matchAll(/'([a-z]+-token)'/g)) tokens.set(m[1], { file, line: i + 1, column: m.index })
  })
  return tokens
}

/** Where the map says the token literal in `code` comes from. */
function originOf(code: string, map: any, token: string): Position {
  const at = code.search(new RegExp(`(['"\`])${token}\\1`))
  assert.ok(at >= 0, `${token} is in the output`)
  const lines = code.slice(0, at).split('\n')
  const entry: any = new SourceMap(map).findEntry(lines.length - 1, lines[lines.length - 1].length)
  assert.ok(entry.originalSource, `${token} is mapped`)
  return { file: path.basename(entry.originalSource), line: entry.originalLine + 1, column: entry.originalColumn }
}

function assertTokensMapBack(code: string, map: any, files: string[]): void {
  for (const file of files) {
    for (const [token, expected] of tokensIn(file, SOURCES[file])) {
      assert.deepEqual(originOf(code, map, token), expected, token)
    }
  }
}

/** Every mapped position must exist in the user's file. */
function assertMappingsInsideSource(code: string, map: any, file: string): void {
  const sourceLines = SOURCES[file].split('\n')
  const sourceMap = new SourceMap(map)
  code.split('\n').forEach((text, line) => {
    for (let column = 0; column < text.length; column++) {
      const entry: any = sourceMap.findEntry(line, column)
      if (entry.generatedLine !== line || entry.generatedColumn !== column || !entry.originalSource) continue
      const where = `${file}:${entry.originalLine + 1}:${entry.originalColumn}, from output ${line + 1}:${column}`
      assert.ok(entry.originalLine < sourceLines.length, `mapped past the end of the file: ${where}`)
      assert.ok(
        entry.originalColumn <= sourceLines[entry.originalLine].length,
        `mapped past the end of a line: ${where}`,
      )
    }
  })
}

describe('component source maps point at the user file (#131)', () => {
  for (const command of ['build', 'serve'] as const) {
    it(`plugin transform result, ${command}`, async () => {
      const plugin = geaPlugin()
      const configResolved = plugin.configResolved as (config: ResolvedConfig) => void
      configResolved.call({} as never, { command } as ResolvedConfig)
      const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler
      for (const file of Object.keys(SOURCES)) {
        const result: any = await transform.call({} as never, SOURCES[file], `/src/${file}`)
        assert.ok(result?.map, `${file} is compiled with a map`)
        assert.deepEqual(
          result.map.sources.map((s: string) => path.basename(s)),
          [file],
        )
        assert.deepEqual(result.map.sourcesContent, [SOURCES[file]])
        assertTokensMapBack(result.code, result.map, [file])
        assertMappingsInsideSource(result.code, result.map, file)
      }
    })
  }

  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function project(extra: Record<string, string> = {}): InlineConfig {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'gea-source-maps-')))
    dirs.push(root)
    const all: Record<string, string> = {
      'index.html': '<!doctype html><div id="app"></div><script type="module" src="/src/main.ts"></script>',
      'src/main.ts': MAIN,
      ...extra,
    }
    for (const [file, source] of Object.entries(SOURCES)) all[`src/${file}`] = source
    for (const [name, source] of Object.entries(all)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
      writeFileSync(path.join(root, name), source)
    }
    return {
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [geaPlugin()],
      resolve: { alias: [{ find: '@geajs/core', replacement: path.join(packagesDir, 'gea/src') }] },
      build: { write: false, sourcemap: true },
      // No watcher: it can report the files just written as changed, which
      // invalidates the modules and drops the maps the SSR test reads.
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    }
  }

  it('the dev server serves maps that point at the user file, client and SSR', async () => {
    const server = await createServer(project())
    try {
      for (const file of Object.keys(SOURCES)) {
        for (const environment of [server.environments.client, server.environments.ssr]) {
          const result = await environment.transformRequest(`/src/${file}`)
          assert.ok(result?.map, `${file} is served with a map (${environment.name})`)
          assertTokensMapBack(result.code, result.map, [file])
        }
      }
    } finally {
      await server.close()
    }
  })

  it('SSR stack traces point at the line that threw', async () => {
    const server = await createServer(
      project({
        'src/Thrower.tsx': `import { Component } from '@geajs/core'

export default class Thrower extends Component {
  template() {
    return <p class="thrower">{this.props.label}</p>
  }

  fail() {
    throw new Error('thrown on line 9')
  }
}
`,
      }),
    )
    // tsx turns on Node's own source maps, which may already map the frame
    // through the module's inline map; Vite would then map it a second time.
    // With them off, only Vite maps the frame. ssrRewriteStacktrace is what
    // ssrFixStacktrace applies, without relying on overwriting `error.stack`,
    // which doesn't stick on some Node versions.
    const sourceMapsEnabled = process.sourceMapsEnabled
    process.setSourceMapsEnabled(false)
    try {
      const mod = await server.ssrLoadModule('/src/Thrower.tsx')
      assert.throws(
        () => mod.default.prototype.fail.call({}),
        (error: Error) => {
          const stack = server.ssrRewriteStacktrace(error.stack!)
          assert.match(stack, /\bat .*fail \(.*[/\\]src[/\\]Thrower\.tsx:9:11\)/, stack)
          return true
        },
      )
    } finally {
      process.setSourceMapsEnabled(sourceMapsEnabled)
      await server.close()
    }
  })

  it('vite build with sourcemap maps the bundle back to the user files', async () => {
    const output: any = await build(project())
    const chunk = (Array.isArray(output) ? output[0] : output).output.find((o: any) => o.type === 'chunk' && o.isEntry)
    assert.ok(chunk?.map, 'the entry chunk has a map')
    assertTokensMapBack(chunk.code, chunk.map, Object.keys(SOURCES))
  })
})
