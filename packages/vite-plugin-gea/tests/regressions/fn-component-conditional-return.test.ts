/**
 * Function components that pick their root with a condition (#124):
 * `return c ? <A/> : <B/>`, `return c && <A/>`, and `if (c) return <A/>`
 * guards before the final `return`. Each must render the branch that matches
 * its props and swap when the prop changes, in the Vite plugin (dev and
 * build) and in the playground compiler.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { ResolvedConfig } from 'vite'
import { flushMicrotasks, installDom } from '../../../../tests/helpers/jsdom-setup'
import { geaPlugin } from '../../src/index.ts'
import { compileForBrowser } from '../../src/browser.ts'

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

// Locals declared after a guard land in the guard's other branch. They must
// bind like they do without a guard, and the guards must flip both ways.
const GUARD_LOCAL_FILES: Record<string, string> = {
  'GuardRest.tsx': `export function GuardRest(props: { hidden: boolean; label: string; title: string }) {
  if (props.hidden) return <p class="rest-hidden">hidden</p>
  const { label, ...rest } = props
  return <i class="rest" title={rest.title}>{label}</i>
}
`,
  'GuardNested.tsx': `export function GuardNested(props: { user: { first: string } | null }) {
  if (!props.user) return <p class="nested-none">none</p>
  const {
    user: { first },
  } = props
  return <i class="nested">{first}</i>
}
`,
  'GuardDefault.tsx': `export function GuardDefault(props: { hidden: boolean; label?: string }) {
  if (props.hidden) return <p class="default-hidden">hidden</p>
  const { label = 'new' } = props
  return <i class="default">{label}</i>
}
`,
  // A guard before the destructure and one after it that reads it.
  'GuardBoth.tsx': `export function GuardBoth(props: { hidden: boolean; label: string; title: string }) {
  if (props.hidden) return <p class="both-hidden">hidden</p>
  const { label, ...rest } = props
  if (!label) return <p class="both-empty">{rest.title}</p>
  return <i class="both" title={rest.title}>{label}</i>
}
`,
  'DestructureFirst.tsx': `export function DestructureFirst(props: { hidden: boolean; label: string; title: string }) {
  const { label, ...rest } = props
  if (props.hidden) return <p class="first-hidden">{rest.title}</p>
  return <i class="first">{label}</i>
}
`,
  'GuardTernary.tsx': `export function GuardTernary(props: { hidden: boolean; strict: boolean; on: boolean; label: string; title: string }) {
  if (props.hidden && props.strict) return <p class="ternary-hidden">hidden</p>
  const { label, ...rest } = props
  return props.on ? <i class="ternary-on" title={rest.title}>{label}</i> : <b class="ternary-off">{rest.title}</b>
}
`,
  'GuardAnd.tsx': `export function GuardAnd(props: { hidden: boolean; label: string; title: string }) {
  if (props.hidden) return props.title && <p class="and-hidden">{props.title}</p>
  const { label = 'new', ...rest } = props
  return label && <i class="and" title={rest.title}>{label}</i>
}
`,
  'GuardStore.tsx': `import { Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0
}

export function GuardStore(props: { hidden: boolean }) {
  if (props.hidden) return <p class="store-hidden">hidden</p>
  const store = new CounterStore()
  return <button class="store" onClick={() => store.count++}>{store.count}</button>
}
`,
  'GuardBlock.tsx': `export function GuardBlock(props: { hidden: boolean; reason: string }) {
  if (props.hidden) {
    const why = props.reason.toUpperCase()
    return <p class="block-hidden">{why}</p>
  }
  const { reason, ...rest } = props
  return <i class="block">{reason === 'gone' && !rest.hidden ? 'shown' : 'wrong'}</i>
}
`,
  'GuardChain.tsx': `export function GuardChain(props: { user: { name: string } | null }) {
  if (!props.user) return <p class="chain-none">nobody</p>
  const name = props.user.name
  if (!name) return <p class="chain-anon">anonymous</p>
  return <i class="chain">{name}</i>
}
`,
  // A nested early return can't be folded. It compiles as it did before #124
  // was fixed instead of failing the build.
  'NestedIf.tsx': `export function NestedIf(props: { a: boolean; b: boolean }) {
  if (props.a) {
    if (props.b) return <p class="nested-if-b">b</p>
  }
  return <i class="nested-if">shown</i>
}
`,
  'App.tsx': `import { Component } from '@geajs/core'
import { GuardRest } from './GuardRest'
import { GuardNested } from './GuardNested'
import { GuardDefault } from './GuardDefault'
import { GuardBoth } from './GuardBoth'
import { DestructureFirst } from './DestructureFirst'
import { GuardTernary } from './GuardTernary'
import { GuardAnd } from './GuardAnd'
import { GuardStore } from './GuardStore'
import { GuardBlock } from './GuardBlock'
import { GuardChain } from './GuardChain'
import { NestedIf } from './NestedIf'

export default class App extends Component {
  hidden = false
  on = true
  label = 'hot'
  title = 'Badge'
  optLabel: string | undefined = undefined
  user: { first: string; name: string } | null = { first: 'Ada', name: 'ada' }
  template() {
    return (
      <div>
        <GuardRest hidden={this.hidden} label={this.label} title={this.title} />
        <GuardNested user={this.user} />
        <GuardDefault hidden={this.hidden} label={this.optLabel} />
        <GuardBoth hidden={this.hidden} label={this.label} title={this.title} />
        <DestructureFirst hidden={this.hidden} label={this.label} title={this.title} />
        <GuardTernary hidden={this.hidden} strict={true} on={this.on} label={this.label} title={this.title} />
        <GuardAnd hidden={this.hidden} label={this.label} title={this.title} />
        <GuardStore hidden={this.hidden} />
        <GuardBlock hidden={this.hidden} reason="gone" />
        <GuardChain user={this.user} />
        <NestedIf a={this.hidden} b={false} />
      </div>
    )
  }
}
`,
}

async function assertGuardLocalsBindAndFlip(App: any): Promise<void> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  const rendered = () =>
    Array.from(root.querySelectorAll('[class]'), (el) => {
      const title = el.getAttribute('title')
      return `${el.className}:${el.textContent}${title ? `@${title}` : ''}`
    })
  const clickStore = () => (root.querySelector('button.store') as HTMLElement).click()
  try {
    app.render(root)
    await flushMicrotasks()
    const shown = (store: number) => [
      'rest:hot@Badge',
      'nested:Ada',
      'default:new',
      'both:hot@Badge',
      'first:hot',
      'ternary-on:hot@Badge',
      'and:hot@Badge',
      `store:${store}`,
      'block:shown',
      'chain:ada',
      'nested-if:shown',
    ]
    assert.deepEqual(rendered(), shown(0))

    clickStore()
    clickStore()
    await flushMicrotasks()
    assert.deepEqual(rendered(), shown(2), 'a store created after a guard is created once')

    app.hidden = true
    app.user = null
    await flushMicrotasks()
    assert.deepEqual(rendered(), [
      'rest-hidden:hidden',
      'nested-none:none',
      'default-hidden:hidden',
      'both-hidden:hidden',
      'first-hidden:Badge',
      'ternary-hidden:hidden',
      'and-hidden:Badge',
      'store-hidden:hidden',
      'block-hidden:GONE',
      'chain-none:nobody',
      'nested-if:shown',
    ])

    app.hidden = false
    app.on = false
    app.label = ''
    app.title = 'Cap'
    app.optLabel = 'set'
    app.user = { first: 'Grace', name: '' }
    await flushMicrotasks()
    assert.deepEqual(rendered(), [
      'rest:@Cap',
      'nested:Grace',
      'default:set',
      'both-empty:Cap',
      'first:',
      'ternary-off:Cap',
      'store:0',
      'block:shown',
      'chain-anon:anonymous',
      'nested-if:shown',
    ])

    app.label = 'cool'
    app.on = true
    app.user = { first: 'Grace', name: 'grace' }
    await flushMicrotasks()
    assert.deepEqual(rendered(), [
      'rest:cool@Cap',
      'nested:Grace',
      'default:set',
      'both:cool@Cap',
      'first:cool',
      'ternary-on:cool@Cap',
      'and:cool@Cap',
      'store:0',
      'block:shown',
      'chain:grace',
      'nested-if:shown',
    ])
  } finally {
    app.dispose()
    root.remove()
  }
}

async function compileWithPlugin(
  dir: string,
  command: 'build' | 'serve',
  files: Record<string, string> = FILES,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [filename, source] of Object.entries(files)) {
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

  describe('locals declared after a guard', () => {
    let guardDir: string
    beforeEach(() => {
      guardDir = path.join(dir, 'guards')
      mkdirSync(guardDir)
      for (const [filename, source] of Object.entries(GUARD_LOCAL_FILES)) {
        writeFileSync(path.join(guardDir, filename), source, 'utf8')
      }
    })

    it('vite build', async () => {
      const compiled = await compileWithPlugin(guardDir, 'build', GUARD_LOCAL_FILES)
      await assertGuardLocalsBindAndFlip(await loadApp(guardDir, compiled))
    })

    it('vite dev server', async () => {
      const compiled = await compileWithPlugin(guardDir, 'serve', GUARD_LOCAL_FILES)
      await assertGuardLocalsBindAndFlip(await loadApp(guardDir, compiled))
    })

    it('playground compiler', async () => {
      const { compiledModules, errors } = compileForBrowser(GUARD_LOCAL_FILES)
      assert.deepEqual(errors, [])
      await assertGuardLocalsBindAndFlip(await loadApp(guardDir, compiledModules))
    })
  })
})
