import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { transformStaticRootMount } from '../../src/closure-codegen/transform/transform-static-root-mount.ts'

let roots: string[] = []

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
  roots = []
})

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gea-static-root-inline-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source, 'utf8')
  return root
}

function resolveImportPath(importer: string, source: string): string | null {
  const base = resolve(dirname(importer), source)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

describe('static root mount inlining', () => {
  it('inlines a proven static root component mount', () => {
    const root = fixture({
      'App.tsx': `import { Component } from '@geajs/core'
export default class App extends Component {
  template() { return <div>Hello World</div> }
}`,
      'main.ts': `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
const app = new App()
app.render(root)
`,
    })

    const mainPath = join(root, 'main.ts')
    const result = transformStaticRootMount(
      `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
const app = new App()
app.render(root)
`,
      mainPath,
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.doesNotMatch(result.code, /import App/)
    assert.doesNotMatch(result.code, /new App/)
    assert.doesNotMatch(result.code, /\.render\(/)
    assert.match(result.code, /function __gea_root0_create\(\)/)
    assert.match(result.code, /document\.createElement\("div"\)/)
    assert.match(result.code, /e\.textContent = "Hello World"/)
    assert.match(result.code, /root\.appendChild\(__gea_root0_create\(\)\)/)
  })

  it('inlines static local direct function children', () => {
    const root = fixture({
      'App.tsx': `import { Component } from '@geajs/core'
function Hello() {
  return <div>Hello</div>
}
function World() {
  return <div>World</div>
}
export default class App extends Component {
  template() {
    return (
      <div>
        <Hello />
        <World />
      </div>
    )
  }
}`,
      'main.ts': `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.doesNotMatch(result.code, /import App/)
    assert.doesNotMatch(result.code, /new App/)
    assert.doesNotMatch(result.code, /\.render\(/)
    assert.doesNotMatch(result.code, /Component/)
    assert.doesNotMatch(result.code, /Compiled/)
    assert.doesNotMatch(result.code, /Disposer/)
    assert.doesNotMatch(result.code, /\bd\b/)
    assert.doesNotMatch(result.code, /function Hello\(\)/)
    assert.doesNotMatch(result.code, /function World\(\)/)
    assert.match(result.code, /document\.createDocumentFragment\(\)/)
    assert.match(result.code, /_tpl0_create\(\)/)
    assert.match(result.code, /_tpl1_create\(\)/)
    assert.match(result.code, /root\.appendChild\(__gea_root0_create\(\)\)/)
  })

  it('inlines side-effect-free imported static function children', () => {
    const root = fixture({
      'Hello.tsx': `const unused = { label: 'safe' }
export function Hello() {
  return <div>Hello</div>
}`,
      'World.tsx': `function WorldImpl() {
  return <div>World</div>
}
export { WorldImpl as default }`,
      'App.tsx': `import { Component } from '@geajs/core'
import { Hello } from './Hello'
import World from './World'
export default class App extends Component {
  template() {
    return (
      <div>
        <Hello />
        <World />
      </div>
    )
  }
}`,
      'main.ts': `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.doesNotMatch(result.code, /import App/)
    assert.doesNotMatch(result.code, /new App/)
    assert.doesNotMatch(result.code, /\.render\(/)
    assert.doesNotMatch(result.code, /Component/)
    assert.doesNotMatch(result.code, /Hello\(\)/)
    assert.doesNotMatch(result.code, /World\(\)/)
    assert.match(result.code, /document\.createDocumentFragment\(\)/)
    assert.match(result.code, /_tpl0_create\(\)/)
    assert.match(result.code, /_tpl1_create\(\)/)
    assert.match(result.code, /root\.appendChild\(__gea_root0_create\(\)\)/)
  })

  it('inlines imported static function children with static string props', () => {
    const root = fixture({
      'Child.tsx': `export default function Child({ text }: { text: string }) {
  return <div>{text}</div>
}`,
      'App.tsx': `import { Component } from '@geajs/core'
import Child from './Child'
export default class App extends Component {
  template() {
    return (
      <div>
        <Child text="Hello" />
        <Child text="World" />
      </div>
    )
  }
}`,
      'main.ts': `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.doesNotMatch(result.code, /import App/)
    assert.doesNotMatch(result.code, /new App/)
    assert.doesNotMatch(result.code, /\.render\(/)
    assert.doesNotMatch(result.code, /Component/)
    assert.doesNotMatch(result.code, /Disposer/)
    assert.doesNotMatch(result.code, /\bd\b/)
    assert.match(result.code, /function Child\(text\)/)
    assert.match(result.code, /Child\("Hello"\)/)
    assert.match(result.code, /Child\("World"\)/)
    assert.match(result.code, /t0\.nodeValue = text/)
    assert.match(result.code, /root\.appendChild\(__gea_root0_create\(\)\)/)
  })

  it('inlines imported static function children with static text children', () => {
    const root = fixture({
      'Child.tsx': `export default function Child({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}`,
      'App.tsx': `import { Component } from '@geajs/core'
import Child from './Child'
export default class App extends Component {
  template() {
    return (
      <div>
        <Child>Hello</Child>
        <Child>World</Child>
      </div>
    )
  }
}`,
      'main.ts': `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.doesNotMatch(result.code, /import App/)
    assert.doesNotMatch(result.code, /new App/)
    assert.doesNotMatch(result.code, /\.render\(/)
    assert.doesNotMatch(result.code, /Component/)
    assert.doesNotMatch(result.code, /Disposer/)
    assert.doesNotMatch(result.code, /\bd\b/)
    assert.match(result.code, /function Child\(children\)/)
    assert.match(result.code, /Child\("Hello"\)/)
    assert.match(result.code, /Child\("World"\)/)
    assert.match(result.code, /t0\.nodeValue = children/)
    assert.match(result.code, /root\.appendChild\(__gea_root0_create\(\)\)/)
  })

  it('inlines imported static function children with event props', () => {
    const root = fixture({
      'Child.tsx': `export default function Child({ children, click }: { children: React.ReactNode; click: () => void }) {
  return <div id={children as string} click={click}>{children}</div>
}`,
      'App.tsx': `import { Component } from '@geajs/core'
import Child from './Child'
export default class App extends Component {
  template() {
    return (
      <div>
        <Child click={() => console.log('Hello')}>Hello</Child>
        <Child click={() => console.log('World')}>World</Child>
      </div>
    )
  }
}`,
      'main.ts': `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
const root = document.getElementById('app')
if (!root) throw new Error('missing')
new App().render(root)
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.doesNotMatch(result.code, /import App/)
    assert.doesNotMatch(result.code, /new App/)
    assert.doesNotMatch(result.code, /\.render\(/)
    assert.doesNotMatch(result.code, /Component/)
    assert.doesNotMatch(result.code, /\(\) => children/)
    assert.match(result.code, /ensureClickDelegate/)
    assert.match(result.code, /function Child\(children, click\)/)
    assert.match(result.code, /Child\("Hello", \(\) => console\.log\(['"]Hello['"]\)\)/)
    assert.match(result.code, /Child\("World", \(\) => console\.log\(['"]World['"]\)\)/)
    assert.match(result.code, /t2\.nodeValue = `\$\{__v2 \?\? ""\}`/)
    assert.match(result.code, /root\.appendChild\(__gea_root0_create\(\)\)/)
  })

  it('preserves imported function children when their module has top-level effects', () => {
    const root = fixture({
      'Hello.tsx': `console.log('loaded')
export function Hello() {
  return <div>Hello</div>
}`,
      'App.tsx': `import { Component } from '@geajs/core'
import { Hello } from './Hello'
export default class App extends Component {
  template() { return <div><Hello /></div> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.match(result.code, /import \{ Hello \} from "\.\/Hello\.tsx"/)
    assert.match(result.code, /Hello\(__fp0, __fd0\)/)
    assert.match(
      result.code,
      /document\.getElementById\('app'\)\.appendChild\(__gea_root0_create\(createDisposer\(\)\)\)/,
    )
  })

  it('inlines imported static function children with event-only wiring', () => {
    const root = fixture({
      'Hello.tsx': `export function Hello() {
  return <button onClick={() => console.log('x')}>Hello</button>
}`,
      'App.tsx': `import { Component } from '@geajs/core'
import { Hello } from './Hello'
export default class App extends Component {
  template() { return <div><Hello /></div> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.doesNotMatch(result.code, /import App/)
    assert.doesNotMatch(result.code, /new App/)
    assert.doesNotMatch(result.code, /\.render\(/)
    assert.doesNotMatch(result.code, /Component/)
    assert.match(result.code, /ensureClickDelegate/)
    assert.match(result.code, /function Hello\(\)/)
    assert.match(result.code, /Hello\(\)/)
  })

  it('reuses imports the entry already has instead of copying them (#134)', () => {
    const main = `import App from './App'
import store from './store'
import Home from './Home'
import { a } from './utils'
store.load()
new App().render(document.getElementById('app'))
`
    const root = fixture({
      'store.ts': `import { Store } from '@geajs/core'
class TodoStore extends Store {
  todos: string[] = []
}
export default new TodoStore()
`,
      'Home.tsx': `import { Component } from '@geajs/core'
export default class Home extends Component {
  template() { return <p>home</p> }
}`,
      'utils.ts': `export const a = 'a'
export const b = 'b'
`,
      'App.tsx': `import { Component } from '@geajs/core'
import store from './store'
import Home from './Home'
import { a, b } from './utils'
export default class App extends Component {
  template() { return <main class="count">{store.todos.length}{a}{b}<Home /></main> }
}`,
      'main.ts': main,
    })

    const result = transformStaticRootMount(main, join(root, 'main.ts'), resolveImportPath)

    assert.ok(result?.changed)
    assert.doesNotMatch(result.code, /new App/)
    assert.equal(result.code.match(/import store from/g)?.length, 1)
    assert.equal(result.code.match(/import Home from/g)?.length, 1)
    assert.match(result.code, /import \{ a \} from '\.\/utils'/)
    assert.match(result.code, /import \{ b \} from "\.\/utils\.ts"/)
    assert.match(result.code, /new Home\(/)
    assert.match(result.code, /store\.load\(\);\ndocument\.getElementById\('app'\)\.appendChild\(__gea_root0_create\(/)
  })

  it('skips the mount when the entry binds a copied import name to something else (#134)', () => {
    const entries = [
      `import store from './other'\nstore.load()\n`,
      `import { store } from './store'\nstore.load()\n`,
      `import type store from './store'\nconst s: typeof store = null!\n`,
      `const store = { load() {} }\nstore.load()\n`,
    ]
    for (const entry of entries) {
      const main = `import App from './App'\n${entry}new App().render(document.getElementById('app'))\n`
      const root = fixture({
        'store.ts': `export const store = { todos: [] }
export default store
`,
        'other.ts': `export default { load() {} }
`,
        'App.tsx': `import { Component } from '@geajs/core'
import store from './store'
export default class App extends Component {
  template() { return <main>{store.todos.length}</main> }
}`,
        'main.ts': main,
      })

      assert.equal(transformStaticRootMount(main, join(root, 'main.ts'), resolveImportPath), null, entry)
    }
  })

  it('skips the mount when an inlined function child has the name of an entry import (#134)', () => {
    const main = `import App from './App'
import { Hello } from './Hello'
console.log(Hello)
new App().render(document.getElementById('app'))
`
    const root = fixture({
      'Hello.tsx': `export function Hello() {
  return <button onClick={() => console.log('x')}>Hello</button>
}`,
      'App.tsx': `import { Component } from '@geajs/core'
import { Hello } from './Hello'
export default class App extends Component {
  template() { return <div><Hello /></div> }
}`,
      'main.ts': main,
    })

    assert.equal(transformStaticRootMount(main, join(root, 'main.ts'), resolveImportPath), null)
  })

  it('skips root component modules with top-level effects', () => {
    const root = fixture({
      'App.tsx': `import { Component } from '@geajs/core'
console.log('loaded')
export default class App extends Component {
  template() { return <div>Hello</div> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.equal(result, null)
  })

  it('skips components that need cleanup wiring', () => {
    const root = fixture({
      'App.tsx': `import { Component } from '@geajs/core'
export default class App extends Component {
  count = 0
  template() { return <button>{this.count}</button> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.equal(result, null)
  })

  it('skips roots that render a same-file function component with children', () => {
    const root = fixture({
      'App.tsx': `import { Component } from '@geajs/core'
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
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.equal(result, null)
  })

  it('skips roots that render a same-file class component', () => {
    const root = fixture({
      'App.tsx': `import { Component } from '@geajs/core'
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
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.equal(result, null)
  })

  it('still inlines when an HTML tag or attribute shares a name with a module binding', () => {
    const root = fixture({
      'App.tsx': `import { Component } from '@geajs/core'
const a = 'unused'
const title = 'unused'
export default class App extends Component {
  template() { return <div title="t"><a href="/">link</a></div> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result?.changed)
    assert.match(result.code, /document\.getElementById\('app'\)\.appendChild\(__gea_root0_create\(\)\)/)
  })

  it('skips static fragments because there is no single root element', () => {
    const root = fixture({
      'App.tsx': `import { Component } from '@geajs/core'
export default class App extends Component {
  template() { return <><div>A</div><div>B</div></> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.equal(result, null)
  })

  it('leaves an imported function child compile error to the child module', () => {
    const root = fixture({
      'Counter.tsx': `export default function Counter() {
  let count = 0
  return <button onClick={() => count++}>Count: {count}</button>
}`,
      'App.tsx': `import { Component } from '@geajs/core'
import Counter from './Counter'
export default class App extends Component {
  template() { return <div><Counter /></div> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.equal(result, null)
  })

  it('skips local function children that hold per-instance state', () => {
    const root = fixture({
      'App.tsx': `import { Component, Store } from '@geajs/core'
class LocalStore extends Store {
  count = 0
}
function LocalCounter() {
  const store = new LocalStore()
  return <button onClick={() => store.count++}>{store.count}</button>
}
export default class App extends Component {
  template() { return <div><LocalCounter /></div> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.equal(result, null)
  })

  it('calls imported function children that hold per-instance state instead of inlining them', () => {
    const root = fixture({
      'Counter.tsx': `export default function Counter() {
  const box = new Map([['count', 0]])
  return <button onClick={() => box.set('count', box.get('count') + 1)}>{box.get('count')}</button>
}`,
      'App.tsx': `import { Component } from '@geajs/core'
import Counter from './Counter'
export default class App extends Component {
  template() { return <div><Counter /></div> }
}`,
      'main.ts': `import App from './App'
new App().render(document.getElementById('app'))
`,
    })

    const result = transformStaticRootMount(
      `import App from './App'
new App().render(document.getElementById('app'))
`,
      join(root, 'main.ts'),
      resolveImportPath,
    )

    assert.ok(result)
    assert.match(result.code, /import Counter from "\.\/Counter\.tsx"/)
    assert.doesNotMatch(result.code, /function Counter\(/)
  })
})
