/**
 * Class components with decorators (#130) must compile and render in
 * `vite build`, the dev server and the playground, with their decorators
 * still applied. Every pass that parses user source uses the same Babel
 * plugins, so none of them skips a decorated file.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { build, createServer, type InlineConfig, type ResolvedConfig } from 'vite'
import { flushMicrotasks, installDom } from '../../../../tests/helpers/jsdom-setup'
import { compileForBrowser } from '../../src/browser.ts'
import { transformFile } from '../../src/closure-codegen/transform.ts'
import { geaPlugin } from '../../src/index.ts'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const GEA_SRC = path.resolve(TEST_DIR, '../../../gea/src')
const HMR_RUNTIME = path.resolve(TEST_DIR, '../helpers/gea-hmr-runtime.ts')

// The #130 repro. `logged` records its calls where the test can read them.
const APP = `import { Component } from '@geajs/core'

function logged(_target: any, key: string, desc: PropertyDescriptor) {
  const fn = desc.value
  desc.value = function (this: any, ...args: any[]) {
    ;((globalThis as any).decoratorCalls ??= []).push(key)
    return fn.apply(this, args)
  }
  return desc
}

export default class App extends Component {
  label = 'hello'

  @logged
  rename() {
    this.label = 'renamed'
  }

  template() {
    return <p class="label">{this.label}</p>
  }
}
`

const MAIN = `import App from './App'
const app = new App()
app.render(document.getElementById('app')!)
;(globalThis as any).app = app
`

// The create-gea tsconfig, plus the flag Vite's own transform needs for this syntax.
const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: false,
    jsx: 'react-jsx',
    jsxImportSource: '@geajs/core',
    experimentalDecorators: true,
  },
  include: ['src/**/*.ts', 'src/**/*.tsx'],
})

describe('decorated class components compile (#130)', { concurrency: false }, () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function project(files: Record<string, string>): { root: string; config: InlineConfig } {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'gea-decorators-')))
    dirs.push(root)
    const all: Record<string, string> = {
      'index.html': '<!doctype html><div id="app"></div><script type="module" src="/src/main.ts"></script>',
      'tsconfig.json': TSCONFIG,
      'src/main.ts': MAIN,
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
      resolve: { alias: [{ find: '@geajs/core', replacement: GEA_SRC }] },
      build: { write: false },
      server: { middlewareMode: true, hmr: false, ws: false },
    }
    return { root, config }
  }

  /** Runs the built bundle in a fresh window and returns that window. */
  async function buildAndRun(files: Record<string, string>): Promise<any> {
    const { config } = project(files)
    const result: any = await build(config)
    const entry = result.output.find((out: any) => out.type === 'chunk' && out.isEntry)
    const dom = new JSDOM('<!doctype html><div id="app"></div>', { runScripts: 'outside-only' })
    dom.window.eval(entry.code)
    await new Promise((resolve) => setTimeout(resolve, 0))
    return dom.window
  }

  it('vite build renders the component and applies the decorator', async () => {
    const win = await buildAndRun({ 'src/App.tsx': APP })
    const app = win.document.getElementById('app')
    assert.equal(app.innerHTML, '<p class="label">hello</p>')

    win.app.rename()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual([...win.decoratorCalls], ['rename'])
    assert.equal(app.innerHTML, '<p class="label">renamed</p>')
  })

  it('vite build keeps the class decorator of a static root component', async () => {
    // A static root component is inlined into the mount call, which would drop
    // the class and its decorator.
    const win = await buildAndRun({
      'src/main.ts': `import App from './App'\nnew App().render(document.getElementById('app')!)\n`,
      'src/App.tsx': `import { Component } from '@geajs/core'

function register(cls: any) {
  ;((globalThis as any).registered ??= []).push(typeof cls)
  return cls
}

@register
export default class App extends Component {
  template() {
    return <p class="static">static</p>
  }
}
`,
    })
    assert.equal(win.document.getElementById('app').innerHTML, '<p class="static">static</p>')
    assert.deepEqual([...win.registered], ['function'])
  })

  it('vite build keeps a decorated store working', async () => {
    const win = await buildAndRun({
      'src/store.ts': `import { Store } from '@geajs/core'

function logged(_target: any, key: string, desc: PropertyDescriptor) {
  const fn = desc.value
  desc.value = function (this: any, ...args: any[]) {
    ;((globalThis as any).decoratorCalls ??= []).push(key)
    return fn.apply(this, args)
  }
  return desc
}

class CounterStore extends Store {
  count = 0

  @logged
  inc() {
    this.count++
  }
}

export default new CounterStore()
`,
      'src/App.tsx': `import { Component } from '@geajs/core'
import store from './store'

export default class App extends Component {
  rename() {
    store.inc()
  }

  template() {
    return <p class="count">{store.count}</p>
  }
}
`,
    })
    const app = win.document.getElementById('app')
    assert.equal(app.innerHTML, '<p class="count">0</p>')

    win.app.rename()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual([...win.decoratorCalls], ['inc'])
    assert.equal(app.innerHTML, '<p class="count">1</p>')
  })

  it('the dev server serves the compiled component with the decorator applied', async () => {
    const { config } = project({ 'src/App.tsx': APP })
    const server = await createServer(config)
    try {
      const result = await server.transformRequest('/src/App.tsx')
      assert.ok(result)
      assert.match(result.code, /GEA_CREATE_TEMPLATE/)
      assert.doesNotMatch(result.code, /jsx-runtime/)
      // Vite lowered the decorator after the plugin compiled the class.
      assert.doesNotMatch(result.code, /@logged/)
      assert.match(result.code, /\(\[logged\], App\.prototype, "rename"/)
    } finally {
      await server.close()
    }
  })

  describe('compiled output runs', { concurrency: false }, () => {
    let restoreDom: (() => void) | undefined

    afterEach(() => {
      restoreDom?.()
      restoreDom = undefined
      delete (globalThis as any).decoratorCalls
    })

    async function renderAndRename(code: string): Promise<[string, string]> {
      const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gea-decorators-run-')))
      dirs.push(dir)
      const App = await loadModule(dir, code)
      restoreDom = installDom()
      const root = document.createElement('div')
      document.body.appendChild(root)
      const app = new App()
      app.render(root)
      await flushMicrotasks()
      const before = root.innerHTML
      app.rename()
      await flushMicrotasks()
      const after = root.innerHTML
      app.dispose()
      return [before, after]
    }

    async function compileWithPlugin(command: 'build' | 'serve'): Promise<string> {
      const plugin = geaPlugin()
      if (command === 'serve' && typeof plugin.configResolved === 'function') {
        plugin.configResolved.call({} as never, { command } as ResolvedConfig)
      }
      const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler
      const result = await transform.call({} as never, APP, path.join(tmpdir(), 'App.tsx'))
      assert.ok(result && typeof result === 'object', 'App.tsx should be compiled')
      return result.code
    }

    for (const command of ['build', 'serve'] as const) {
      it(`plugin output (${command}) renders and applies the decorator`, async () => {
        assert.deepEqual(await renderAndRename(await compileWithPlugin(command)), [
          '<p class="label">hello</p>',
          '<p class="label">renamed</p>',
        ])
        assert.deepEqual((globalThis as any).decoratorCalls, ['rename'])
      })
    }

    it('playground compiler renders and applies the decorator', async () => {
      const { compiledModules, errors } = compileForBrowser({ 'App.tsx': APP })
      assert.deepEqual(errors, [])
      assert.deepEqual(await renderAndRename(compiledModules['App.tsx']), [
        '<p class="label">hello</p>',
        '<p class="label">renamed</p>',
      ])
      assert.deepEqual((globalThis as any).decoratorCalls, ['rename'])
    })
  })

  it('vite build fails on a decorator on template(), which the compiler replaces', async () => {
    const { root, config } = project({
      'src/App.tsx': `import { Component } from '@geajs/core'
import { logged } from './logged'

export default class App extends Component {
  label = 'hello'

  @logged
  template() {
    return <p class="label">{this.label}</p>
  }
}
`,
      'src/logged.ts': `export function logged(_target: any, _key: string, desc: PropertyDescriptor) {\n  return desc\n}\n`,
    })
    let err: any
    try {
      await build(config)
    } catch (error: any) {
      err = error.errors?.[0] ?? error
    }
    assert.ok(err, 'vite build should fail')
    const file = path.join(root, 'src/App.tsx')
    assert.match(err.message, /\[gea\] Decorators on `template\(\)` are not supported\./)
    assert.match(err.message, /Decorate another method instead\./)
    assert.deepEqual({ ...err.loc }, { file, line: 7, column: 2 })
  })

  it('transformFile reports source it cannot parse instead of leaving it uncompiled', () => {
    assert.throws(() => transformFile('export const A = () => <p>{</p>', '/src/A.tsx'), SyntaxError)
  })
})

/**
 * Writes one compiled module as `.mjs` and imports its default export.
 * Decorators are lowered the way Vite does with `experimentalDecorators`.
 */
async function loadModule(dir: string, code: string): Promise<any> {
  const esbuild = await import('esbuild')
  const url = (file: string) => pathToFileURL(file).href
  const js = (
    await esbuild.transform(code, {
      loader: 'tsx',
      jsx: 'automatic',
      jsxImportSource: '@geajs/core',
      target: 'esnext',
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    })
  ).code
  const rewritten = js
    .replace(
      /from\s*['"](?:virtual:gea-compiler-runtime|@geajs\/core\/compiler-runtime)['"]/g,
      `from '${url(path.join(GEA_SRC, 'compiler-runtime.ts'))}'`,
    )
    .replace(/from\s*['"]virtual:gea-hmr['"]/g, `from '${url(HMR_RUNTIME)}'`)
    .replace(/from\s*['"]@geajs\/core\/jsx-runtime['"]/g, `from '${url(path.join(GEA_SRC, 'jsx-runtime.ts'))}'`)
    .replace(/from\s*['"]@geajs\/core['"]/g, `from '${url(path.join(GEA_SRC, 'index.ts'))}'`)
  const file = path.join(dir, 'App.mjs')
  writeFileSync(file, rewritten, 'utf8')
  return (await import(url(file))).default
}
