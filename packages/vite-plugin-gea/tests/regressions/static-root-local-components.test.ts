/**
 * `vite build` inlines a stateless root component into `main.ts` (#138). When
 * the root's template uses a same-file component the inliner doesn't copy (a
 * function component with children, or a class component), the build must
 * keep `new App().render(…)` and render the same as the dev server.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { ResolvedConfig } from 'vite'
import { flushMicrotasks, installDom } from '../../../../tests/helpers/jsdom-setup'
import { geaPlugin } from '../../src/index.ts'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const GEA_SRC = path.resolve(TEST_DIR, '../../../gea/src')
const HMR_RUNTIME = path.resolve(TEST_DIR, '../helpers/gea-hmr-runtime.ts')

const MAIN = `import App from './App'

new App().render(document.getElementById('app')!)
`

const CASES = [
  {
    name: 'same-file function component with children',
    app: `import { Component } from '@geajs/core'

function Card(props: { children?: any }) {
  return <section class="card">{props.children}</section>
}

export default class App extends Component {
  template() {
    return (
      <div>
        <Card>
          <p>Hello</p>
        </Card>
      </div>
    )
  }
}
`,
    html: '<div><section class="card"><p>Hello</p></section></div>',
  },
  {
    name: 'same-file class component',
    app: `import { Component } from '@geajs/core'

class Badge extends Component {
  template() {
    return <em class="badge">new</em>
  }
}

function Label(props: { text: string }) {
  return <strong>{props.text}</strong>
}

export default class App extends Component {
  template() {
    return (
      <div>
        <Badge />
        <Label text="plain" />
      </div>
    )
  }
}
`,
    html: '<div><em class="badge">new</em><strong>plain</strong></div>',
  },
]

async function compileWithPlugin(
  dir: string,
  files: Record<string, string>,
  command: 'build' | 'serve',
): Promise<Record<string, string>> {
  const plugin = geaPlugin()
  if (command === 'serve' && typeof plugin.configResolved === 'function') {
    plugin.configResolved.call({} as never, { command } as ResolvedConfig)
  }
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler
  const out: Record<string, string> = {}
  for (const [filename, source] of Object.entries(files)) {
    const result = await transform.call({} as never, source, path.join(dir, filename))
    out[filename] = !result ? source : typeof result === 'string' ? result : result.code
  }
  return out
}

/** Writes compiled modules as `.mjs` next to the sources and runs `main`. */
async function runMain(dir: string, compiled: Record<string, string>): Promise<void> {
  const esbuild = await import('esbuild')
  const url = (file: string) => pathToFileURL(file).href
  for (const [filename, code] of Object.entries(compiled)) {
    const js = (await esbuild.transform(code, { loader: 'tsx', jsx: 'automatic', jsxImportSource: '@geajs/core' })).code
    const rewritten = js
      .replace(
        /from\s*['"](?:virtual:gea-compiler-runtime|@geajs\/core\/compiler-runtime)['"]/g,
        `from '${url(path.join(GEA_SRC, 'compiler-runtime.ts'))}'`,
      )
      .replace(/from\s*['"]virtual:gea-hmr['"]/g, `from '${url(HMR_RUNTIME)}'`)
      .replace(/from\s*['"]@geajs\/core\/jsx-runtime['"]/g, `from '${url(path.join(GEA_SRC, 'jsx-runtime.ts'))}'`)
      .replace(/from\s*['"]@geajs\/core['"]/g, `from '${url(path.join(GEA_SRC, 'index.ts'))}'`)
      .replace(/from\s*['"]\.\/(\w+)['"]/g, (_m, name) => `from './${name}.mjs'`)
      .replace(/new URL\((['"])\.\/(\w+)\1/g, (_m, q, name) => `new URL(${q}./${name}.mjs${q}`)
    writeFileSync(path.join(dir, filename.replace(/\.tsx?$/, '.mjs')), rewritten, 'utf8')
  }
  await import(url(path.join(dir, 'main.mjs')))
  await flushMicrotasks()
}

describe('static root mount keeps same-file components it cannot inline (#138)', { concurrency: false }, () => {
  let restoreDom: () => void
  let dir: string

  beforeEach(() => {
    restoreDom = installDom()
    dir = mkdtempSync(path.join(tmpdir(), 'gea-static-root-local-'))
  })

  afterEach(() => {
    restoreDom()
    rmSync(dir, { recursive: true, force: true })
  })

  for (const { name, app, html } of CASES) {
    for (const command of ['build', 'serve'] as const) {
      it(`${name} renders after vite ${command}`, async () => {
        const files = { 'App.tsx': app, 'main.ts': MAIN }
        for (const [filename, source] of Object.entries(files)) writeFileSync(path.join(dir, filename), source, 'utf8')
        const mount = document.createElement('div')
        mount.id = 'app'
        document.body.appendChild(mount)

        await runMain(dir, await compileWithPlugin(dir, files, command))

        assert.equal(mount.innerHTML, html)
      })
    }
  }
})
