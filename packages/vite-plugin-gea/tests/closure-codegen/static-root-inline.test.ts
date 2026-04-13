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
})
