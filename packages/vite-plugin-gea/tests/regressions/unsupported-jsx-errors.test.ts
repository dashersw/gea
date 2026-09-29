import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'
import { build, createServer, type InlineConfig } from 'vite'
import { geaPlugin } from '../../src/index.ts'
import { compileForBrowser } from '../../src/browser.ts'

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

interface UnsupportedCase {
  name: string
  source: string
  message: RegExp
  hint: RegExp
  line: number
  column: number
}

// Five of the six repros from #105, plus a spread on a component tag. Each one
// used to compile and then render nothing. The sixth, a spread on an element,
// compiles since #219.
const CASES: UnsupportedCase[] = [
  {
    name: 'spread props on a component',
    source: `import { Component } from '@geajs/core'

class Child extends Component {
  template() {
    return <p>{this.props.label}</p>
  }
}

export default class App extends Component {
  childProps = { label: 'Go' }

  template() {
    return (
      <div>
        <Child {...this.childProps} />
      </div>
    )
  }
}
`,
    message: /Spread attributes like \{\.\.\.this\.childProps\} on <Child> are not supported\./,
    hint: /Pass each prop individually: <Child label=\{…\} onSelect=\{…\} \/>\./,
    line: 15,
    column: 15,
  },
  {
    name: 'a string in a component-cased tag',
    source: `import { Component } from '@geajs/core'

export default class App extends Component {
  template() {
    const Tag = 'section'
    return (
      <div>
        <Tag class="tagged">x</Tag>
      </div>
    )
  }
}
`,
    message: /<Tag> holds a string, not a component, so it would render nothing\./,
    hint: /pick one with a conditional/,
    line: 8,
    column: 9,
  },
  {
    name: 'a callback ref',
    source: `import { Component } from '@geajs/core'

export default class App extends Component {
  input: HTMLInputElement | null = null

  template() {
    return (
      <div>
        <input ref={(el: HTMLInputElement) => (this.input = el)} />
      </div>
    )
  }
}
`,
    message: /ref only accepts a property or variable to assign the element to; callback refs are not supported\./,
    hint: /Use an assignable target, e\.g\. ref=\{this\.input\}/,
    line: 9,
    column: 20,
  },
  {
    name: 'a ternary returned from a class template()',
    source: `import { Component } from '@geajs/core'

export default class App extends Component<{ href?: string }> {
  template() {
    return this.props.href ? <a href={this.props.href}>Go</a> : <button>Go</button>
  }
}
`,
    message: /`App\.template\(\)` must return a single JSX element or fragment\./,
    hint: /Wrap the result in an element or a fragment/,
    line: 5,
    column: 11,
  },
  {
    name: 'an on…Capture event handler',
    source: `import { Component } from '@geajs/core'

export default class App extends Component {
  template() {
    return (
      <div onClickCapture={() => console.log('capture')}>
        <button id="btn">Go</button>
      </div>
    )
  }
}
`,
    message: /Capture-phase event handlers like onClickCapture are not supported yet\./,
    hint: /Use onClick, or add the listener yourself in onAfterRender\(\) with addEventListener\('click', handler, true\)\./,
    line: 6,
    column: 11,
  },
  {
    name: 'a component class declared inside a function',
    source: `import { Component } from '@geajs/core'

export function createPage(label: string) {
  class Page extends Component {
    template() {
      return <div class="page">{label}</div>
    }
  }
  return Page
}

export default createPage('home')
`,
    message: /Component class `Page` is declared inside a function\. Only top-level component classes are compiled\./,
    hint: /Declare the class at the top level of the module/,
    line: 4,
    column: 2,
  },
]

// Lookalikes of the cases above that compile today and must keep compiling.
// Pick and Toggle are function components with a conditional root: #124
// compiles those, so the class template() check must not reach them.
const STILL_SUPPORTED_APP = `import { Component } from '@geajs/core'
import Pick from './Pick'

function Toggle(props: { on?: boolean }) {
  return props.on ? <b>on</b> : <i>off</i>
}

class Big extends Component {
  template() {
    return <b>big</b>
  }
}

class Small extends Component {
  template() {
    return <i>small</i>
  }
}

class Title extends Component {
  template() {
    return <h1>title</h1>
  }
}

// A string variable elsewhere that shares a component's name.
export function titleText() {
  const Title = 'Home'
  return Title
}

export default class App extends Component<{ big?: boolean }> {
  input: HTMLInputElement | null = null

  template() {
    const Icon = this.props.big ? Big : Small
    let field: HTMLInputElement | undefined
    return (
      <div onGotPointerCapture={() => 1} onLostPointerCapture={() => 2}>
        <Icon />
        <Title />
        <Pick on />
        <Toggle on />
        <input ref={this.input} />
        <input ref={field} />
        <my-camera onScreenCapture={() => console.log('screencapture handled')} />
      </div>
    )
  }
}
`

describe('unsupported JSX fails the build with a hint (#105)', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function project(app: string, extra: Record<string, string> = {}): { file: string; config: InlineConfig } {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'gea-unsupported-jsx-')))
    dirs.push(root)
    const files: Record<string, string> = {
      'index.html': '<!doctype html><div id="app"></div><script type="module" src="/src/main.ts"></script>',
      'src/main.ts': `import App from './App'\nnew App().render(document.getElementById('app')!)\n`,
      'src/App.tsx': app,
      ...extra,
    }
    for (const [name, source] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
      writeFileSync(path.join(root, name), source)
    }
    const config: InlineConfig = {
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [geaPlugin()],
      resolve: { alias: [{ find: '@geajs/core', replacement: path.join(packagesDir, 'gea/src') }] },
      // What a Gea app's tsconfig sets. JSX the compiler leaves alone (a
      // function component with a conditional root, until #124) goes here.
      oxc: { jsx: { runtime: 'automatic', importSource: '@geajs/core' } },
      build: { write: false },
      // No background transform of App's imports: one still running at
      // server.close() can keep the test process alive.
      server: { middlewareMode: true, hmr: false, ws: false, preTransformRequests: false },
    }
    return { file: path.join(root, 'src/App.tsx'), config }
  }

  function assertCaseError(err: any, c: UnsupportedCase, file: string): void {
    assert.match(err.message, /^\[gea\] /)
    assert.match(err.message, c.message)
    assert.match(err.message, c.hint)
    assert.ok(err.message.includes(`${file}:${c.line}:${c.column}`), err.message)
    assert.equal(err.plugin, 'gea-plugin')
    assert.deepEqual({ ...err.loc }, { file, line: c.line, column: c.column })
  }

  for (const c of CASES) {
    it(`vite build fails on ${c.name}`, async () => {
      const { file, config } = project(c.source)
      let err: any
      try {
        await build(config)
      } catch (error: any) {
        err = error.errors?.[0] ?? error
      }
      assert.ok(err, 'vite build should fail')
      assertCaseError(err, c, file)
    })

    it(`the dev server rejects ${c.name}`, async () => {
      const { file, config } = project(c.source)
      const server = await createServer(config)
      try {
        await assert.rejects(server.transformRequest('/src/App.tsx'), (err: any) => {
          assertCaseError(err, c, file)
          return true
        })
      } finally {
        await server.close()
      }
    })
  }

  // A build inlines a static root component into the mount file, so App.tsx
  // never goes through transformFile. The string-tag check has to run there
  // too, or the page throws `Tag is not defined`.
  it('vite build fails on a string tag in a root component the build inlines', async () => {
    const app = (tag: string) => `import { Component } from '@geajs/core'

const Tag = 'section'

export default class App extends Component {
  template() {
    return (
      <div>
        <${tag} class="tagged">x</${tag}>
      </div>
    )
  }
}
`
    // The same root with a plain element is inlined: main.ts calls the
    // root factory instead of rendering an App class.
    const inlined = project(app('section'))
    const output: any = await build({ ...inlined.config, build: { write: false, minify: false } })
    const chunk = (Array.isArray(output) ? output[0] : output).output.find((o: any) => o.type === 'chunk')
    assert.match(chunk.code, /__gea_root\d+_create\(\)/)
    assert.doesNotMatch(chunk.code, /extends Compiled\w*Component/)

    const { file, config } = project(app('Tag'))
    let err: any
    try {
      await build(config)
    } catch (error: any) {
      err = error.errors?.[0] ?? error
    }
    assert.ok(err, 'vite build should fail')
    assert.match(err.message, /<Tag> holds a string, not a component/)
    assert.deepEqual({ ...err.loc }, { file, line: 9, column: 9 })
  })

  it('vite build fails on a string tag in an imported function component', async () => {
    const { file, config } = project(
      `import { Component } from '@geajs/core'
import Card from './Card'

export default class App extends Component {
  template() {
    return (
      <div>
        <Card />
      </div>
    )
  }
}
`,
      {
        'src/Card.tsx': `export default function Card() {
  const Tag = 'section'
  return <Tag class="card">x</Tag>
}
`,
      },
    )
    let err: any
    try {
      await build(config)
    } catch (error: any) {
      err = error.errors?.[0] ?? error
    }
    assert.ok(err, 'vite build should fail')
    const card = path.join(path.dirname(file), 'Card.tsx')
    assert.match(err.message, /<Tag> holds a string, not a component/)
    assert.deepEqual({ ...err.loc }, { file: card, line: 3, column: 10 })
  })

  it('the playground compiler reports each one', () => {
    for (const c of CASES) {
      const { errors } = compileForBrowser({ 'App.tsx': c.source })
      assert.equal(errors.length, 1, `${c.name}: ${JSON.stringify(errors)}`)
      assert.match(errors[0].message, c.message)
    }
  })

  it('also rejects spread props on a function component and in a list row', () => {
    const child = `import { Component } from '@geajs/core'

function Greeting(props: { label?: string }) {
  return <p>{props.label}</p>
}
`
    for (const [tag, body] of [
      ['Greeting', `<div><Greeting {...this.p} /></div>`],
      ['Greeting', `<ul>{this.items.map((item) => <Greeting key={item.id} {...item} />)}</ul>`],
    ]) {
      const { errors } = compileForBrowser({
        'App.tsx': `${child}
export default class App extends Component {
  p = { label: 'x' }
  items = [{ id: 1, label: 'a' }]

  template() {
    return ${body}
  }
}
`,
      })
      assert.equal(errors.length, 1, `${body}: ${JSON.stringify(errors)}`)
      assert.match(
        errors[0].message,
        new RegExp(`Spread attributes like \\{\\.\\.\\.\\S+\\} on <${tag}> are not supported\\.`),
      )
    }
  })

  // At module scope: template() and function components reject reassigned
  // locals of their own (#168, #118).
  it('also rejects a string tag assigned after its declaration', () => {
    for (const assign of [`Tag = 'section'`, `if (on) Tag = 'section'\nelse Tag = 'div'`]) {
      const { errors } = compileForBrowser({
        'App.tsx': `import { Component } from '@geajs/core'

const on = Math.random() > 0.5
let Tag
${assign}

export default class App extends Component {
  template() {
    return (
      <div>
        <Tag class="tagged">x</Tag>
      </div>
    )
  }
}
`,
      })
      assert.equal(errors.length, 1, `${assign}: ${JSON.stringify(errors)}`)
      assert.match(errors[0].message, /<Tag> holds a string, not a component, so it would render nothing\./)
    }
  })

  it('still compiles a tag assigned a component, or a component on some paths', () => {
    for (const assign of [`Tag = Big`, `if (on) Tag = Big\nelse Tag = Small`, `if (on) Tag = 'b'\nelse Tag = Big`]) {
      const { errors } = compileForBrowser({
        'App.tsx': `import { Component } from '@geajs/core'

class Big extends Component {
  template() {
    return <b>big</b>
  }
}

class Small extends Component {
  template() {
    return <i>small</i>
  }
}

const on = Math.random() > 0.5
let Tag
${assign}

export default class App extends Component {
  template() {
    return (
      <div>
        <Tag />
      </div>
    )
  }
}
`,
      })
      assert.deepEqual(errors, [], assign)
    }
  })

  it('also rejects lowercase and other DOM capture handlers', () => {
    for (const [attr, bubbling] of [
      ['onclickcapture', 'onclick'],
      ['onPasteCapture', 'onPaste'],
      ['onFocusInCapture', 'onFocusIn'],
    ]) {
      const { errors } = compileForBrowser({
        'App.tsx': `import { Component } from '@geajs/core'

export default class App extends Component {
  template() {
    return <div ${attr}={() => 1}>x</div>
  }
}
`,
      })
      assert.equal(errors.length, 1, `${attr}: ${JSON.stringify(errors)}`)
      assert.match(errors[0].message, new RegExp(`Capture-phase event handlers like ${attr} are not supported yet\\.`))
      assert.match(errors[0].message, new RegExp(`Use ${bubbling}, or add the listener yourself`))
    }
  })

  // #118 inlines a local whose initializer is a plain value, so `let el = null`
  // leaves ref={el} no variable to assign the element to. It isn't a callback.
  it('vite build fails on a ref to a local the compiler inlines, and says why', async () => {
    const { file, config } = project(
      `import { Component } from '@geajs/core'
import Field from './Field'

export default class App extends Component {
  template() {
    return (
      <div>
        <Field />
      </div>
    )
  }
}
`,
      {
        'src/Field.tsx': `export default function Field() {
  let el: HTMLInputElement | null = null
  return (
    <div>
      <input ref={el} />
      <button click={() => el?.focus()}>Focus</button>
    </div>
  )
}
`,
      },
    )
    let err: any
    try {
      await build(config)
    } catch (error: any) {
      err = error.errors?.[0] ?? error
    }
    assert.ok(err, 'vite build should fail')
    assert.match(
      err.message,
      /ref=\{el\} has no variable to assign the element to: the compiler inlines `el` as its initializer \(null\)\./,
    )
    assert.match(err.message, /Declare it as `let el` with no initializer so it stays a variable\./)
    assert.doesNotMatch(err.message, /callback/)
    assert.deepEqual({ ...err.loc }, { file: path.join(path.dirname(file), 'Field.tsx'), line: 5, column: 18 })

    const { errors } = compileForBrowser({
      'App.tsx': `import { Component } from '@geajs/core'

export default class App extends Component {
  template() {
    let el: HTMLInputElement | null = null
    return <div><input ref={el} /></div>
  }
}
`,
    })
    assert.equal(errors.length, 1, JSON.stringify(errors))
    assert.match(errors[0].message, /ref=\{el\} has no variable to assign the element to/)
    assert.match(errors[0].message, /or use a class field such as ref=\{this\.input\}\./)
  })

  it('also rejects a ternary template() in a subclass of a component', () => {
    const { errors } = compileForBrowser({
      'App.tsx': `import { Component } from '@geajs/core'

class Base extends Component {
  template() {
    return <div>base</div>
  }
}

export default class App extends Base {
  template() {
    return this.props.on ? <b>on</b> : <i>off</i>
  }
}
`,
    })
    assert.equal(errors.length, 1, JSON.stringify(errors))
    assert.match(errors[0].message, /`App\.template\(\)` must return a single JSX element or fragment\./)
  })

  it('still compiles component-valued tags, pointer-capture and custom …Capture events, assignable refs and conditional function components', async () => {
    const { config } = project(STILL_SUPPORTED_APP, {
      'src/Pick.tsx': `export default function Pick(props: { on?: boolean }) {
  return props.on ? <b>on</b> : <i>off</i>
}
`,
    })
    await build(config)
    const server = await createServer(config)
    try {
      const result = await server.transformRequest('/src/App.tsx')
      assert.ok(result, 'the dev server should compile App.tsx')
      assert.match(result.code, /"gotpointercapture"/)
      assert.match(result.code, /"screencapture"/)
      assert.match(result.code, /this\.input = el\d+/)
      assert.match(result.code, /\bfield = el\d+/)
    } finally {
      await server.close()
    }
  })
})
