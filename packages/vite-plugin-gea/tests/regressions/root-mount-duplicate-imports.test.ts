/**
 * #134: `vite build` inlines the root component into the entry and copies the
 * component's imports there. An entry that imports the same module as the root
 * component used to get the binding twice and fail to parse.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { build, type Rollup } from 'vite'
import { flushMicrotasks, installDom } from '../../../../tests/helpers/jsdom-setup'
import { geaPlugin } from '../../src/index.ts'

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const STORE = `import { Store } from '@geajs/core'

class TodoStore extends Store {
  todos: string[] = []
  load() {
    this.todos = ['a', 'b']
  }
}

export default new TodoStore()
`

describe('vite build: entry imports a module the root component imports (#134)', { concurrency: false }, () => {
  const dirs: string[] = []
  let restoreDom: (() => void) | undefined

  afterEach(() => {
    restoreDom?.()
    restoreDom = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  async function buildAndRender(files: Record<string, string>): Promise<string> {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'gea-root-mount-imports-')))
    dirs.push(root)
    const all: Record<string, string> = {
      'index.html': '<!doctype html><div id="app"></div><script type="module" src="/src/main.ts"></script>',
      'src/store.ts': STORE,
      ...files,
    }
    for (const [name, source] of Object.entries(all)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
      writeFileSync(path.join(root, name), source)
    }

    const result = (await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [geaPlugin()],
      resolve: { alias: [{ find: '@geajs/core', replacement: path.join(packagesDir, 'gea/src') }] },
      build: { write: false, modulePreload: { polyfill: false } },
    })) as Rollup.RollupOutput
    const entry = result.output.find((file): file is Rollup.OutputChunk => file.type === 'chunk' && file.isEntry)
    assert.ok(entry, 'the build emits an entry chunk')

    restoreDom = installDom()
    document.body.innerHTML = '<div id="app"></div>'
    const bundle = path.join(root, 'bundle.mjs')
    writeFileSync(bundle, entry.code)
    await import(pathToFileURL(bundle).href)
    await flushMicrotasks()
    return document.getElementById('app')!.innerHTML
  }

  it('builds and renders when the entry imports the same store', async () => {
    const html = await buildAndRender({
      'src/App.tsx': `import { Component } from '@geajs/core'
import store from './store'

export default class App extends Component {
  template() {
    return <main class="count">{store.todos.length}</main>
  }
}
`,
      'src/main.ts': `import App from './App'
import store from './store'

store.load()
new App().render(document.getElementById('app')!)
`,
    })
    assert.equal(html, '<main class="count">2</main>')
  })

  it('builds and renders when the entry imports the same class component', async () => {
    const html = await buildAndRender({
      'src/Home.tsx': `import { Component } from '@geajs/core'

export default class Home extends Component {
  template() {
    return <p class="home">home</p>
  }
}
`,
      'src/App.tsx': `import { Component } from '@geajs/core'
import store from './store'
import Home from './Home'

export default class App extends Component {
  template() {
    return (
      <main class="count">
        {store.todos.length}
        <Home />
      </main>
    )
  }
}
`,
      'src/main.ts': `import App from './App'
import store from './store'
import Home from './Home'

store.load()
;(window as any).Home = Home
new App().render(document.getElementById('app')!)
`,
    })
    assert.equal(html, '<main class="count">2<p class="home">home</p></main>')
  })

  // The root inlines Hello as a local `function Hello`. In a .ts entry, TypeScript
  // import elision would quietly drop the entry's own import instead of failing.
  it('builds and renders when the entry imports a function component the root inlines', async () => {
    const html = await buildAndRender({
      'index.html': '<!doctype html><div id="app"></div><script type="module" src="/src/main.js"></script>',
      'src/Hello.tsx': `export function Hello() {
  return <button onClick={() => console.log('x')}>Hello</button>
}
`,
      'src/App.tsx': `import { Component } from '@geajs/core'
import { Hello } from './Hello'

export default class App extends Component {
  template() {
    return (
      <main class="count">
        <Hello />
      </main>
    )
  }
}
`,
      'src/main.js': `import App from './App'
import { Hello } from './Hello'

window.Hello = Hello
new App().render(document.getElementById('app'))
`,
    })
    assert.equal(html, '<main class="count"><button>Hello</button></main>')
  })
})
