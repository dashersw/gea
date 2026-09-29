/**
 * Function components that pick their root with a condition (#124):
 * `return c ? <A/> : <B/>`, `return c && <A/>`, and `if (c) return <A/>`
 * guards before the final `return`. Each must render the branch that matches
 * its props and swap when the prop changes, in the Vite plugin (dev and
 * build) and in the playground compiler.
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
import { compileForBrowser } from '../../src/browser.ts'
import { transformGeaSourceToEvalBody } from '../helpers/compile'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const GEA_SRC = path.resolve(TEST_DIR, '../../../gea/src')
const HMR_RUNTIME = path.resolve(TEST_DIR, '../helpers/gea-hmr-runtime.ts')

const FILES: Record<string, string> = {
  'CondReturn.tsx': `export function CondReturn(props: { on: boolean }) {
  return props.on ? <p class="cond-on">on</p> : <p class="cond-off">off</p>
}
`,
  'Guard.tsx': `export function Guard(props: { on: boolean }) {
  if (!props.on) return <p class="guard-off">off</p>
  return <p class="guard-on">on</p>
}
`,
  'AndReturn.tsx': `export function AndReturn(props: { on: boolean }) {
  return props.on && <p class="and-on">on</p>
}
`,
  'ArrowCond.tsx': `export const ArrowCond = (props: { on: boolean }) =>
  props.on ? <p class="arrow-on">on</p> : <p class="arrow-off">off</p>
`,
  'UserName.tsx': `export function UserName(props: { user: { name: string } | null }) {
  if (!props.user) return <p class="user-none">nobody</p>
  const name = props.user.name.toUpperCase()
  return <p class="user-name">{name}</p>
}
`,
  'App.tsx': `import { Component } from '@geajs/core'
import { CondReturn } from './CondReturn'
import { Guard } from './Guard'
import { AndReturn } from './AndReturn'
import { ArrowCond } from './ArrowCond'
import { UserName } from './UserName'

function LocalGuard(props: { on: boolean }) {
  if (props.on) return <p class="local-on">on</p>
  if (props.on === false) return <p class="local-off">off</p>
  return <p class="local-unset">unset</p>
}

function LiteralGuard({ on }: { on: boolean }) {
  if (on) return <p class="literal-on">on</p>
  return <p class="literal-off">off</p>
}

export default class App extends Component {
  on = true
  user: { name: string } | null = { name: 'ada' }
  template() {
    return (
      <div>
        <CondReturn on={true} />
        <CondReturn on={false} />
        <Guard on={true} />
        <Guard on={false} />
        <CondReturn on={this.on} />
        <Guard on={this.on} />
        <AndReturn on={this.on} />
        <ArrowCond on={this.on} />
        <LocalGuard on={this.on} />
        <LiteralGuard on={false} />
        <UserName user={this.user} />
      </div>
    )
  }
}
`,
  // A build inlines a static root component into the entry that renders it,
  // along with the function components it uses.
  'DestructuredGuard.tsx': `export function DestructuredGuard({ on }: { on: boolean }) {
  if (on) return <p class="destructured-on">on</p>
  return <p class="destructured-off">off</p>
}
`,
  'StaticApp.tsx': `import { Component } from '@geajs/core'
import { CondReturn } from './CondReturn'
import { Guard } from './Guard'
import { DestructuredGuard } from './DestructuredGuard'

export default class StaticApp extends Component {
  template() {
    return (
      <div class="static-app">
        <CondReturn on={false} />
        <Guard on={false} />
        <DestructuredGuard on={true} />
      </div>
    )
  }
}
`,
  'LocalStaticApp.tsx': `import { Component } from '@geajs/core'

function LocalGuard({ on }: { on: boolean }) {
  if (on) return <p class="local-on">on</p>
  return <p class="local-off">off</p>
}

export default class LocalStaticApp extends Component {
  template() {
    return (
      <div class="local-static-app">
        <LocalGuard on={true} />
        <LocalGuard on={false} />
      </div>
    )
  }
}
`,
  'main.ts': `import StaticApp from './StaticApp'
new StaticApp().render(document.body)
`,
  'mainLocal.ts': `import LocalStaticApp from './LocalStaticApp'
new LocalStaticApp().render(document.body)
`,
}

// The issue's four components first, then the ones whose props flip.
const FIXED = ['cond-on:on', 'cond-off:off', 'guard-on:on', 'guard-off:off']
const ON = [
  ...FIXED,
  'cond-on:on',
  'guard-on:on',
  'and-on:on',
  'arrow-on:on',
  'local-on:on',
  'literal-off:off',
  'user-name:ADA',
]
const OFF = [
  ...FIXED,
  'cond-off:off',
  'guard-off:off',
  'arrow-off:off',
  'local-off:off',
  'literal-off:off',
  'user-none:nobody',
]

async function compileWithPlugin(dir: string, command: 'build' | 'serve'): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [filename, source] of Object.entries(FILES)) {
    const plugin = geaPlugin()
    if (command === 'serve' && typeof plugin.configResolved === 'function') {
      plugin.configResolved.call({} as never, { command } as ResolvedConfig)
    }
    const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler
    const result = await transform.call({} as never, source, path.join(dir, filename))
    out[filename] = !result ? source : typeof result === 'string' ? result : result.code
  }
  return out
}

/** Writes the compiled modules as `.mjs` next to the sources and imports `App`. */
async function loadApp(dir: string, compiled: Record<string, string>) {
  const esbuild = await import('esbuild')
  const url = (file: string) => pathToFileURL(file).href
  for (const [filename, code] of Object.entries(compiled)) {
    const js = (
      await esbuild.transform(code, {
        loader: 'tsx',
        jsx: 'automatic',
        jsxImportSource: '@geajs/core',
        target: 'esnext',
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
      .replace(/from\s*['"]\.\/(\w+)(?:\.tsx?)?['"]/g, (_m, name) => `from './${name}.mjs'`)
      .replace(/new URL\((['"])\.\/(\w+)\1/g, (_m, q, name) => `new URL(${q}./${name}.mjs${q}`)
    writeFileSync(path.join(dir, filename.replace(/\.tsx?$/, '.mjs')), rewritten, 'utf8')
  }
  return (await import(url(path.join(dir, 'App.mjs')))).default
}

/** Runs the two entry modules, which render their static root into `document.body`. */
async function assertStaticEntries(dir: string): Promise<void> {
  for (const entry of ['main', 'mainLocal']) await import(pathToFileURL(path.join(dir, `${entry}.mjs`)).href)
  await flushMicrotasks()
  const rendered = (selector: string) =>
    Array.from(document.querySelectorAll(`${selector} p`), (p) => `${p.className}:${p.textContent}`)
  assert.deepEqual(rendered('.static-app'), ['cond-off:off', 'guard-off:off', 'destructured-on:on'])
  assert.deepEqual(rendered('.local-static-app'), ['local-on:on', 'local-off:off'])
}

async function assertRendersAndFlips(App: any): Promise<void> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  const rendered = () => Array.from(root.querySelectorAll('p'), (p) => `${p.className}:${p.textContent}`)
  try {
    app.render(root)
    await flushMicrotasks()
    assert.deepEqual(rendered(), ON)

    app.on = false
    app.user = null
    await flushMicrotasks()
    assert.deepEqual(rendered(), OFF)

    app.on = true
    app.user = { name: 'grace' }
    await flushMicrotasks()
    assert.deepEqual(
      rendered(),
      ON.map((p) => (p === 'user-name:ADA' ? 'user-name:GRACE' : p)),
    )
  } finally {
    app.dispose()
    root.remove()
  }
}

describe('function components with a conditional return (#124)', { concurrency: false }, () => {
  let restoreDom: () => void
  let dir: string

  beforeEach(() => {
    restoreDom = installDom()
    dir = mkdtempSync(path.join(tmpdir(), 'gea-fn-conditional-return-'))
    for (const [filename, source] of Object.entries(FILES)) writeFileSync(path.join(dir, filename), source, 'utf8')
  })

  afterEach(() => {
    restoreDom()
    rmSync(dir, { recursive: true, force: true })
  })

  it('vite build', async () => {
    const compiled = await compileWithPlugin(dir, 'build')
    assert.doesNotMatch(compiled['main.ts'], /\.render\(/, 'the build inlines StaticApp into main.ts')
    await assertRendersAndFlips(await loadApp(dir, compiled))
    await assertStaticEntries(dir)
  })

  it('vite dev server', async () => {
    await assertRendersAndFlips(await loadApp(dir, await compileWithPlugin(dir, 'serve')))
    await assertStaticEntries(dir)
  })

  it('playground compiler', async () => {
    const { compiledModules, errors } = compileForBrowser(FILES)
    assert.deepEqual(errors, [])
    await assertRendersAndFlips(await loadApp(dir, compiledModules))
    await assertStaticEntries(dir)
  })

  it('fails the build for a per-instance local declared after an early return', async () => {
    await assert.rejects(
      transformGeaSourceToEvalBody(
        `
        import { Store } from '@geajs/core'
        class CounterStore extends Store { count = 0 }
        export default function Counter(props) {
          if (props.hidden) return <p>hidden</p>
          const store = new CounterStore()
          return <button onClick={() => store.count++}>{store.count}</button>
        }
      `,
        '/virtual/GuardedCounter.tsx',
      ),
      (error: any) => {
        assert.equal(error.__geaCompileError, true)
        assert.match(error.message, /Counter/)
        assert.match(error.message, /`store`/)
        assert.equal(error.loc?.line, 6)
        return true
      },
    )
  })

  it('fails the build for an early return of JSX it cannot compile', async () => {
    await assert.rejects(
      transformGeaSourceToEvalBody(
        `
        export default function Panel(props) {
          if (props.hidden) {
            console.log('hidden')
            return <p>hidden</p>
          }
          return <p>shown</p>
        }
      `,
        '/virtual/Panel.tsx',
      ),
      (error: any) => {
        assert.equal(error.__geaCompileError, true)
        assert.match(error.message, /Panel/)
        assert.equal(error.loc?.line, 5)
        return true
      },
    )
  })
})
