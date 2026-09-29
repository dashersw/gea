/**
 * A same-file function component used with only static props compiles as a
 * one-shot "direct" factory: every slot is written once. That is only right
 * when the body reads nothing but its props. One that reads a store (or any
 * other module binding) must go through `mount` and stay reactive, in dev and
 * after `vite build` (#137).
 */
import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { ResolvedConfig } from 'vite'
import { flushMicrotasks, installDom } from '../../../../tests/helpers/jsdom-setup'
import { collectDirectFnComponents } from '../../src/closure-codegen/transform.ts'
import { geaPlugin } from '../../src/index.ts'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const GEA_SRC = path.resolve(TEST_DIR, '../../../gea/src')
const HMR_RUNTIME = path.resolve(TEST_DIR, '../helpers/gea-hmr-runtime.ts')

const MAIN = `import App from './App'

new App().render(document.getElementById('app')!)
`

const COUNTER = `import { Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0
}

export const counter = new CounterStore()
`

const IMPORTED_COUNT = `import { counter } from './counter'

export default function ImportedCount() {
  return <span class="imported">Imported: {counter.count}</span>
}
`

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
      .replace(/from\s*['"]\.\/(\w+)(?:\.tsx?)?['"]/g, (_m, name) => `from './${name}.mjs'`)
      .replace(/new URL\((['"])\.\/(\w+)\1/g, (_m, q, name) => `new URL(${q}./${name}.mjs${q}`)
    writeFileSync(path.join(dir, filename.replace(/\.tsx?$/, '.mjs')), rewritten, 'utf8')
  }
  await import(url(path.join(dir, 'main.mjs')))
  await flushMicrotasks()
}

describe('same-file function components that read a store (#137)', { concurrency: false }, () => {
  let restoreDom: () => void
  let dir: string
  let mount: HTMLElement

  beforeEach(() => {
    restoreDom = installDom()
    dir = mkdtempSync(path.join(tmpdir(), 'gea-same-file-fn-store-'))
    mount = document.createElement('div')
    mount.id = 'app'
    document.body.appendChild(mount)
  })

  afterEach(() => {
    restoreDom()
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(files: Record<string, string>, command: 'build' | 'serve'): Promise<void> {
    for (const [filename, source] of Object.entries(files)) writeFileSync(path.join(dir, filename), source, 'utf8')
    await runMain(dir, await compileWithPlugin(dir, files, command))
  }

  async function click(selector: string): Promise<void> {
    ;(mount.querySelector(selector) as HTMLElement).click()
    await flushMicrotasks()
  }

  for (const command of ['build', 'serve'] as const) {
    it(`updates text and attribute slots that read an imported store after vite ${command}`, async () => {
      await run(
        {
          'counter.ts': COUNTER,
          'ImportedCount.tsx': IMPORTED_COUNT,
          'App.tsx': `import { Component } from '@geajs/core'
import { counter } from './counter'
import ImportedCount from './ImportedCount'

function LocalCount() {
  return <span class="local" title={\`count \${counter.count}\`}>Local: {counter.count}</span>
}

function LocalDerived() {
  const doubled = counter.count * 2
  return <b class="derived">{doubled}</b>
}

export default class App extends Component {
  template() {
    return (
      <div>
        <LocalCount />
        <LocalDerived />
        <ImportedCount />
        <button id="go" onClick={() => counter.count++}>
          +1
        </button>
      </div>
    )
  }
}
`,
          'main.ts': MAIN,
        },
        command,
      )

      await click('#go')
      await click('#go')

      const local = mount.querySelector('.local')!
      assert.equal(local.textContent, 'Local: 2')
      assert.equal(local.getAttribute('title'), 'count 2')
      assert.equal(mount.querySelector('.derived')!.textContent, '4')
      assert.equal(mount.querySelector('.imported')!.textContent, 'Imported: 2')
    })

    it(`updates a slot that reads a same-file module store after vite ${command}`, async () => {
      await run(
        {
          'App.tsx': `import { Component, Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0
}

const counter = new CounterStore()

function LocalCount() {
  return <span class="local">Local: {counter.count}</span>
}

export default class App extends Component {
  template() {
    return (
      <div>
        <LocalCount />
        <button id="go" onClick={() => counter.count++}>
          +1
        </button>
      </div>
    )
  }
}
`,
          'main.ts': MAIN,
        },
        command,
      )

      await click('#go')

      assert.equal(mount.querySelector('.local')!.textContent, 'Local: 1')
    })

    // Found while fixing #138: the build copied these functions into main.ts
    // without the bindings they read and threw a ReferenceError.
    it(`renders a same-file function that reads a module constant after vite ${command}`, async () => {
      await run(
        {
          'App.tsx': `import { Component } from '@geajs/core'

const LABEL = 'hi'

function Hello() {
  return <p>{LABEL}</p>
}

export default class App extends Component {
  template() {
    return (
      <div>
        <Hello />
      </div>
    )
  }
}
`,
          'main.ts': MAIN,
        },
        command,
      )

      assert.equal(mount.innerHTML, '<div><p>hi</p></div>')
    })

    it(`renders a same-file function that renders a component with children after vite ${command}`, async () => {
      await run(
        {
          'App.tsx': `import { Component } from '@geajs/core'

function Card(props: { children?: any }) {
  return <section class="card">{props.children}</section>
}

function Panel() {
  return (
    <main>
      <Card>
        <p>Hello</p>
      </Card>
    </main>
  )
}

export default class App extends Component {
  template() {
    return (
      <div>
        <Panel />
      </div>
    )
  }
}
`,
          'main.ts': MAIN,
        },
        command,
      )

      assert.equal(mount.innerHTML, '<div><main><section class="card"><p>Hello</p></section></main></div>')
    })
  }
})

describe('direct function components and module reads (#137)', () => {
  function directSet(body: string, uses: string): string[] {
    const source = `import { counter } from './counter'
import { Icon, type Theme, Props } from './ui'
const LABEL = 'hi'
function format(n: number) {
  return String(n)
}
${body}
export default class App extends Component {
  template() {
    return <div>${uses}</div>
  }
}`
    const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
    return [...collectDirectFnComponents(ast as any)].sort()
  }

  for (const [label, body] of [
    ['an imported store', 'function Row() { return <li>{counter.count}</li> }'],
    ['an imported store in an attribute', 'function Row() { return <li title={counter.label}>x</li> }'],
    ['a local derived from an import', 'function Row() { const n = counter.count; return <li>{n}</li> }'],
    ['a module constant', 'function Row() { return <li>{LABEL}</li> }'],
    ['a module helper function', 'function Row({ n }) { return <li>{format(n)}</li> }'],
    [
      'an import inside a render callback',
      'function Row({ ids }) { return <ul>{ids.map((id) => <li>{counter.names[id]}</li>)}</ul> }',
    ],
    ['an import in an event handler', 'function Row() { return <button onClick={() => counter.count++}>+</button> }'],
    ['a module constant in a parameter default', 'function Row({ text = LABEL }) { return <li>{text}</li> }'],
  ] as const) {
    it(`leaves a function that reads ${label} off the direct path`, () => {
      assert.deepEqual(directSet(body, '<Row />'), [])
    })
  }

  for (const [label, body] of [
    ['only its props', 'function Row({ text }) { return <li>{text}</li> }'],
    ['a component tag', 'function Row() { return <li><Icon /></li> }'],
    [
      'a local that shadows a module name',
      'function Row({ counter }) { const LABEL = counter; return <li>{LABEL}</li> }',
    ],
    [
      'module names in type annotations',
      'function Row({ text }: Props & { theme?: Theme }) { return <li>{text as string}</li> }',
    ],
    ['globals', 'function Row() { return <li>{Math.max(1, 2)}</li> }'],
    ['a member property named like a module binding', 'function Row({ item }) { return <li>{item.counter}</li> }'],
  ] as const) {
    it(`keeps a function that uses ${label} on the direct path`, () => {
      assert.deepEqual(directSet(body, '<Row text="a" />'), ['Row'])
    })
  }
})
