import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { afterEach, describe, it } from 'node:test'
import { build, createServer, type InlineConfig, type Logger } from 'vite'
import { geaPlugin, type GeaPluginOptions } from '../../src/index.ts'
import { compileForBrowser } from '../../src/browser.ts'
import { transformFile } from '../../src/closure-codegen/transform.ts'
import { EVENT_NAMES } from '../../src/utils/events.ts'

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/** The event maps in lib.dom.d.ts for the events an element fires (not the window-only ones). */
const ELEMENT_EVENT_MAPS = [
  'ElementEventMap',
  'GlobalEventHandlersEventMap',
  'HTMLElementEventMap',
  'HTMLMediaElementEventMap',
  'HTMLVideoElementEventMap',
  'MathMLElementEventMap',
  'SVGElementEventMap',
]

interface UnsupportedCase {
  name: string
  source: string
  message: RegExp
  hint: RegExp
  line: number
  column: number
  /** What the default mode compiles, which is what the compiler did before the check. */
  asBefore: (devCode: string) => void
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
    // Child gets its props without the spread.
    asBefore: (code) => assert.match(code, /\.call\(__c\d+, \{\}\)/),
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
    asBefore: (code) => assert.match(code, /mount\(Tag, /),
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
    asBefore: (code) => assert.doesNotMatch(code, /this\.input = /),
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
    asBefore: (code) => assert.match(code, /\btemplate\(\) \{/),
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
    asBefore: (code) => assert.match(code, /"clickcapture"/),
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
    asBefore: (code) => assert.match(code, /\btemplate\(\) \{/),
  },
]

// Lookalikes of the cases above that compile today and must keep compiling.
// Pick and Toggle are function components with a conditional root: #124
// compiles those, so the class template() check must not reach them. Neither
// may Badge, which has no base class, or Card, Hello, Tip and Tile, whose bases
// aren't components: core's jsx-runtime turns their JSX into HTML strings. A
// spread on an element compiles since #219.
const STILL_SUPPORTED_APP = `import { Component } from '@geajs/core'
import Pick from './Pick'
import Shape from './Shape'

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

export class Badge {
  template(on: boolean) {
    return on ? <b>on</b> : <i>off</i>
  }
}

class Plain {
  big = true
}

export class Card extends Plain {
  template() {
    return this.big ? <b>big</b> : <i>small</i>
  }
}

export class Hello extends HTMLElement {
  template() {
    const msg = <span>hello</span>
    return msg
  }
}

function sized(Base: typeof Plain) {
  return class extends Base {
    size = 1
  }
}

export class Tip extends sized(Plain) {
  template() {
    return this.size ? <b>tip</b> : <i>tip</i>
  }
}

export class Tile extends Shape {
  template() {
    return this.big ? <b>tile</b> : <i>tile</i>
  }
}

// A string variable elsewhere that shares a component's name.
export function titleText() {
  const Title = 'Home'
  return Title
}

export default class App extends Component<{ big?: boolean }> {
  input: HTMLInputElement | null = null
  attrs = { id: 'go', title: 'Go' }

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
        <button {...this.attrs}>Go</button>
      </div>
    )
  }
}
`

const STRICT: GeaPluginOptions = { strict: true }

describe('unsupported JSX warns with a hint, and fails the build with strict (#105)', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  interface Project {
    file: string
    config: InlineConfig
    /** What `vite build` passes to `onwarn` from the gea plugin. */
    buildWarnings: any[]
    /** What the dev server prints for the gea plugin's warnings. */
    devWarnings: string[]
  }

  function project(app: string, extra: Record<string, string> = {}, options: GeaPluginOptions = {}): Project {
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
    const buildWarnings: any[] = []
    const devWarnings: string[] = []
    const logger: Logger = {
      hasWarned: false,
      info() {},
      warn(msg) {
        // Vite's dev terminal colors its output.
        const text = stripVTControlCharacters(msg)
        if (text.includes('Plugin: gea-plugin')) devWarnings.push(text)
      },
      warnOnce() {},
      error() {},
      clearScreen() {},
      hasErrorLogged: () => false,
    }
    const config: InlineConfig = {
      root,
      configFile: false,
      customLogger: logger,
      plugins: [geaPlugin(options)],
      resolve: { alias: [{ find: '@geajs/core', replacement: path.join(packagesDir, 'gea/src') }] },
      // What a Gea app's tsconfig sets. JSX the compiler leaves alone (a
      // function component with a conditional root, until #124) goes here.
      oxc: { jsx: { runtime: 'automatic', importSource: '@geajs/core' } },
      build: {
        write: false,
        rollupOptions: {
          onwarn(warning) {
            if (warning.plugin === 'gea-plugin') buildWarnings.push(warning)
          },
        },
      },
      // No background transform of App's imports: one still running at
      // server.close() can keep the test process alive.
      server: { middlewareMode: true, hmr: false, ws: false, preTransformRequests: false },
      // No dependency scan either: there's nothing to optimize, and closing the
      // server while a re-transform's scan runs crashes Rolldown's native code.
      optimizeDeps: { noDiscovery: true, include: [] },
    }
    return { file: path.join(root, 'src/App.tsx'), config, buildWarnings, devWarnings }
  }

  function builtCode(output: any): string {
    return (Array.isArray(output) ? output : [output])
      .flatMap((o) => o.output)
      .filter((o: any) => o.type === 'chunk')
      .map((o: any) => o.code)
      .join('\n')
  }

  type Expected = Pick<UnsupportedCase, 'message' | 'hint' | 'line' | 'column'>

  function assertCaseError(err: any, c: Expected, file: string): void {
    assert.match(err.message, /^\[gea\] /)
    assert.match(err.message, c.message)
    assert.match(err.message, c.hint)
    assert.ok(err.message.includes(`${file}:${c.line}:${c.column}`), err.message)
    assert.equal(err.plugin, 'gea-plugin')
    assert.deepEqual({ ...err.loc }, { file, line: c.line, column: c.column })
  }

  /** One `vite build` warning, as `onwarn` gets it. */
  function assertBuildWarning(warnings: any[], c: Expected, file: string): void {
    assert.equal(warnings.length, 1, JSON.stringify(warnings.map((w) => w.message)))
    const [warning] = warnings
    assert.equal(warning.code, 'PLUGIN_WARNING')
    // Not `id`: for code the build inlines, that's the mount file being transformed.
    assertCaseError(warning, c, file)
  }

  /** One warning in the dev terminal, with Vite's plugin and file lines. */
  function assertDevWarning(warnings: string[], c: Expected, file: string): void {
    assert.equal(warnings.length, 1, warnings.join('\n---\n'))
    const [text] = warnings
    assert.match(text, /^warning: \[gea\] /)
    assert.match(text, c.message)
    assert.match(text, c.hint)
    assert.ok(text.includes(`(${file}:${c.line}:${c.column})`), text)
    assert.ok(text.includes(`  File: ${file}:${c.line}:${c.column}`), text)
  }

  for (const c of CASES) {
    it(`vite build warns on ${c.name} and builds it as before`, async () => {
      const { file, config, buildWarnings } = project(c.source)
      await build(config)
      assertBuildWarning(buildWarnings, c, file)
    })

    it(`the dev server warns on ${c.name} and compiles it as before`, async () => {
      const { file, config, devWarnings } = project(c.source)
      const server = await createServer(config)
      try {
        const result = await server.transformRequest('/src/App.tsx')
        assert.ok(result, 'the dev server should compile App.tsx')
        c.asBefore(result.code)
        assertDevWarning(devWarnings, c, file)
      } finally {
        await server.close()
      }
    })

    it(`vite build with strict fails on ${c.name}`, async () => {
      const { file, config } = project(c.source, {}, STRICT)
      let err: any
      try {
        await build(config)
      } catch (error: any) {
        err = error.errors?.[0] ?? error
      }
      assert.ok(err, 'vite build should fail')
      assertCaseError(err, c, file)
    })

    it(`the dev server with strict rejects ${c.name}`, async () => {
      const { file, config } = project(c.source, {}, STRICT)
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
  // never goes through transformFile. The string-tag check runs there too,
  // and warns without stopping the inlining.
  it('vite build warns on a string tag in a root component it inlines, and fails with strict', async () => {
    const c = CASES.find((c) => c.name === 'a string in a component-cased tag')!
    const warned = project(c.source)
    const output = await build({ ...warned.config, build: { ...warned.config.build, minify: false } })
    // Inlined as before: main.ts calls the root factory instead of rendering an App class.
    const code = builtCode(output)
    assert.match(code, /__gea_root\d+_create\(/)
    assert.doesNotMatch(code, /extends Compiled\w*Component/)
    assert.match(code, /mount\(Tag, /)
    assertBuildWarning(warned.buildWarnings, c, warned.file)

    const { file, config } = project(c.source, {}, STRICT)
    let err: any
    try {
      await build(config)
    } catch (error: any) {
      err = error.errors?.[0] ?? error
    }
    assert.ok(err, 'vite build should fail')
    assertCaseError(err, c, file)
  })

  it('vite build warns on a string tag in an imported function component, and fails with strict', async () => {
    const app = `import { Component } from '@geajs/core'
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
`
    const card = {
      'src/Card.tsx': `export default function Card() {
  const Tag = 'section'
  return <Tag class="card">x</Tag>
}
`,
    }
    const tagged = {
      message: /<Tag> holds a string, not a component/,
      hint: /pick one with a conditional/,
      line: 3,
      column: 10,
    }
    const warned = project(app, card)
    await build(warned.config)
    assertBuildWarning(warned.buildWarnings, tagged, path.join(path.dirname(warned.file), 'Card.tsx'))

    const { file, config } = project(app, card, STRICT)
    let err: any
    try {
      await build(config)
    } catch (error: any) {
      err = error.errors?.[0] ?? error
    }
    assert.ok(err, 'vite build should fail')
    assert.match(err.message, /<Tag> holds a string, not a component/)
    assert.deepEqual({ ...err.loc }, { file: path.join(path.dirname(file), 'Card.tsx'), line: 3, column: 10 })
  })

  // The build compiles Card into the mount file along with App, so neither
  // file goes through the pipeline. The warning still names Card.tsx.
  it('vite build warns about an imported function component it inlines, at its own file', async () => {
    const app = `import { Component } from '@geajs/core'
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
`
    const card = {
      'src/Card.tsx': `export default function Card() {
  return <div onClickCapture={() => console.log('capture')}>card</div>
}
`,
    }
    const capture = {
      message: /Capture-phase event handlers like onClickCapture are not supported yet\./,
      hint: /Use onClick, or add the listener yourself/,
      line: 2,
      column: 14,
    }
    const warned = project(app, card)
    const output = await build({ ...warned.config, build: { ...warned.config.build, minify: false } })
    const code = builtCode(output)
    assert.match(code, /__gea_root\d+_create\(/)
    assert.match(code, /"clickcapture"/)
    const cardFile = path.join(path.dirname(warned.file), 'Card.tsx')
    assertBuildWarning(warned.buildWarnings, capture, cardFile)

    const { file, config } = project(app, card, STRICT)
    let err: any
    try {
      await build(config)
    } catch (error: any) {
      err = error.errors?.[0] ?? error
    }
    assert.ok(err, 'vite build should fail')
    assertCaseError(err, capture, path.join(path.dirname(file), 'Card.tsx'))
  })

  it('warns once per transform, and a dev re-transform neither piles up nor throws', async () => {
    const c = CASES[0]
    const { file, config, devWarnings } = project(c.source)
    const server = await createServer(config)
    try {
      await server.transformRequest('/src/App.tsx')
      // What an edit does before HMR: invalidate the module and compile it again.
      const mod = await server.moduleGraph.getModuleByUrl('/src/App.tsx')
      assert.ok(mod)
      server.moduleGraph.invalidateModule(mod)
      assert.ok(await server.transformRequest('/src/App.tsx'))
      assert.equal(devWarnings.length, 2, devWarnings.join('\n---\n'))
      assert.equal(devWarnings[1], devWarnings[0])
    } finally {
      await server.close()
    }

    // Each transform collects its own warnings and leaves nothing behind.
    assert.equal(transformFile(c.source, file).warnings.length, 1)
    assert.equal(transformFile(c.source, file).warnings.length, 1)
    assert.throws(() => transformFile(c.source, file, { strict: true }), c.message)
    assert.equal(transformFile(c.source, file).warnings.length, 1)
  })

  /**
   * Compiles `files` with the playground compiler in both modes and returns
   * the strict errors. Without strict, nothing fails and each strict error is
   * a warning, prefixed and with its location.
   */
  function playgroundErrors(files: Record<string, string>): Array<{ file: string; message: string }> {
    const warned = compileForBrowser(files)
    const strict = compileForBrowser(files, { strict: true })
    assert.deepEqual(warned.errors, [], 'nothing fails without strict')
    assert.deepEqual(strict.warnings, [], 'strict reports errors, not warnings')
    for (const error of strict.errors) {
      const first = error.message.split('\n')[0]
      assert.ok(
        warned.warnings.some((w) => w.file === error.file && w.message.startsWith(`[gea] ${first} (${error.file}:`)),
        `${first} should be a warning: ${JSON.stringify(warned.warnings)}`,
      )
    }
    return strict.errors
  }

  it('the playground compiler warns on each one, and reports it as an error with strict', () => {
    for (const c of CASES) {
      const { errors, warnings } = compileForBrowser({ 'App.tsx': c.source })
      assert.deepEqual(errors, [], c.name)
      assert.equal(warnings.length, 1, `${c.name}: ${JSON.stringify(warnings)}`)
      assert.equal(warnings[0].file, 'App.tsx')
      assert.match(warnings[0].message, /^\[gea\] /)
      assert.match(warnings[0].message, c.message)
      assert.match(warnings[0].message, c.hint)
      assert.ok(warnings[0].message.includes(`(App.tsx:${c.line}:${c.column})`), warnings[0].message)

      const strict = playgroundErrors({ 'App.tsx': c.source })
      assert.equal(strict.length, 1, `${c.name}: ${JSON.stringify(strict)}`)
      assert.match(strict[0].message, c.message)
    }
  })

  it('also catches spread props on a function component and in a list row', () => {
    const child = `import { Component } from '@geajs/core'

function Greeting(props: { label?: string }) {
  return <p>{props.label}</p>
}
`
    for (const [tag, body] of [
      ['Greeting', `<div><Greeting {...this.p} /></div>`],
      ['Greeting', `<ul>{this.items.map((item) => <Greeting key={item.id} {...item} />)}</ul>`],
    ]) {
      const errors = playgroundErrors({
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
  it('also catches a string tag assigned after its declaration', () => {
    for (const assign of [`Tag = 'section'`, `if (on) Tag = 'section'\nelse Tag = 'div'`]) {
      const errors = playgroundErrors({
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
      const { errors, warnings } = compileForBrowser({
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
      assert.deepEqual([...errors, ...warnings], [], assign)
    }
  })

  // Once some component tag shares a string variable's name, every tag is
  // resolved: an element must not be, whatever variable shares its name.
  it('never reports an element named like a string variable', () => {
    const child = `class Child extends Component {
  template() {
    return <b>child</b>
  }
}`
    const shadowed = playgroundErrors({
      'App.tsx': `import { Component } from '@geajs/core'

${child}

const Tag = 'section'
const div = 'label'

export default function App() {
  const Tag = Child
  return (
    <div title={div}>
      <Tag />
    </div>
  )
}
`,
    })
    assert.deepEqual(shadowed, [])

    const label = playgroundErrors({
      'App.tsx': `import { Component } from '@geajs/core'
import Icon from './Icon'

${child}

const label = 'Name'

function iconName() {
  const Icon = 'star'
  return Icon
}

export default class App extends Component {
  template() {
    return (
      <label>
        {label}
        <Icon />
        <Child />
      </label>
    )
  }
}
`,
      'Icon.tsx': `import { Component } from '@geajs/core'

export default class Icon extends Component {
  template() {
    return <i>icon</i>
  }
}
`,
    })
    assert.deepEqual(label, [])

    const both = playgroundErrors({
      'App.tsx': `import { Component } from '@geajs/core'

const Tag = 'section'
const label = 'Name'

export default class App extends Component {
  template() {
    return (
      <label>
        {label}
        <Tag />
      </label>
    )
  }
}
`,
    })
    assert.equal(both.length, 1, JSON.stringify(both))
    assert.match(both[0].message, /<Tag> holds a string, not a component, so it would render nothing\./)
  })

  it('also catches lowercase and other DOM capture handlers', () => {
    for (const [attr, bubbling] of [
      ['onclickcapture', 'onclick'],
      ['onPasteCapture', 'onPaste'],
      ['onFocusInCapture', 'onFocusIn'],
    ]) {
      const errors = playgroundErrors({
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

  // #214: every event an element fires, as TypeScript's lib.dom.d.ts lists
  // them, and every event Gea knows (EVENT_NAMES, with `longTap`).
  it('also catches a capture handler for every element event and every Gea event', () => {
    const lib = readFileSync(createRequire(import.meta.url).resolve('typescript/lib/lib.dom.d.ts'), 'utf8')
    const types = new Set(EVENT_NAMES)
    for (const map of ELEMENT_EVENT_MAPS) {
      const body = lib.match(new RegExp(`^interface ${map}(?: extends [^{]+)? \\{\\n([\\s\\S]*?)^\\}`, 'm'))
      assert.ok(body, map)
      for (const [, type] of body[1].matchAll(/^\s+"([^"]+)":/gm)) types.add(type)
    }
    assert.ok(types.size > 100, `only ${types.size} event types: did lib.dom.d.ts change?`)
    const missed = [...types].filter((type) => {
      const attr = `on${type}Capture`
      const source = `export default function App() {\n  return <div ${attr}={() => 1}>x</div>\n}\n`
      const { warnings } = transformFile(source, '/src/App.tsx')
      return !(warnings.length === 1 && warnings[0].message.includes(`like ${attr} are not supported yet.`))
    })
    assert.deepEqual(missed, [])
  })

  it("also catches React's capture names, with a hint that names the event", () => {
    for (const [attr, handler, type] of [
      ['onDoubleClickCapture', 'dblclick', 'dblclick'],
      ['onCancelCapture', 'onCancel', 'cancel'],
      ['onCloseCapture', 'onClose', 'close'],
      ['onBeforeToggleCapture', 'onBeforeToggle', 'beforetoggle'],
      ['onScrollEndCapture', 'onScrollEnd', 'scrollend'],
      ['onGotPointerCaptureCapture', 'onGotPointerCapture', 'gotpointercapture'],
      ['onLongTapCapture', 'longTap', 'longTap'],
    ]) {
      const errors = playgroundErrors({
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
      assert.ok(
        errors[0].message.includes(
          `Use ${handler}, or add the listener yourself in onAfterRender() with addEventListener('${type}', handler, true).`,
        ),
        errors[0].message,
      )
    }
  })

  it('still compiles handlers that are not capture handlers of an element event', () => {
    for (const attr of [
      'onCapture',
      'oncapture',
      'onCaptureCapture',
      'onPointerCapture',
      'onScreenCapture',
      'onGotPointerCapture',
      'onLostPointerCapture',
      'onDoubleClick',
      'onCancel',
      'onClose',
      'onBeforeToggle',
      'onScrollEnd',
      'onLongTap',
      'dblclick',
    ]) {
      const { errors, warnings } = compileForBrowser({
        'App.tsx': `export default function App() {\n  return <div ${attr}={() => 1}>x</div>\n}\n`,
      })
      assert.deepEqual([...errors, ...warnings], [], attr)
    }
  })

  // Attributes written before a spread go into the spread's runtime object,
  // where onClickCapture would become the key on:clickcapture and never fire.
  it('also catches a capture handler written before a spread', () => {
    const errors = playgroundErrors({
      'App.tsx': `import { Component } from '@geajs/core'

export default class App extends Component {
  attrs = { id: 'go' }

  template() {
    return (
      <div onClickCapture={() => 1} {...this.attrs}>
        x
      </div>
    )
  }
}
`,
    })
    assert.equal(errors.length, 1, JSON.stringify(errors))
    assert.match(errors[0].message, /Capture-phase event handlers like onClickCapture are not supported yet\./)
  })

  // #118 inlines a local whose initializer is a plain value, so `let el = null`
  // leaves ref={el} no variable to assign the element to. It isn't a callback.
  it('vite build warns on a ref to a local the compiler inlines, says why, and fails with strict', async () => {
    const app = `import { Component } from '@geajs/core'
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
`
    const field = {
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
    }
    const inlinedRef = {
      message:
        /ref=\{el\} has no variable to assign the element to: the compiler inlines `el` as its initializer \(null\)\./,
      hint: /Declare it as `let el` with no initializer so it stays a variable\./,
      line: 5,
      column: 18,
    }
    const warned = project(app, field)
    await build(warned.config)
    assertBuildWarning(warned.buildWarnings, inlinedRef, path.join(path.dirname(warned.file), 'Field.tsx'))

    const { file, config } = project(app, field, STRICT)
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

    const errors = playgroundErrors({
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

  // Every kind of Gea base: in this file, from a component module, an alias,
  // a namespace or default object, a package's component (also renamed, or a
  // subpath's default export).
  it('also catches a ternary template() in a subclass of a component', () => {
    const baseModule = `import { Component } from '@geajs/core'\n\nexport default class Base extends Component {\n  template() {\n    return <div>base</div>\n  }\n}\n`
    for (const [header, base, files] of [
      [`class Base extends Component {\n  template() {\n    return <div>base</div>\n  }\n}`, 'Base', {}],
      [`import Base from './Base'`, 'Base', { 'Base.tsx': baseModule }],
      [`import { Component as Base } from '@geajs/core'`, 'Base', {}],
      [`import * as gea from '@geajs/core'`, 'gea.Component', {}],
      [`import gea from '@geajs/core'`, 'gea.Component', {}],
      [`import { View } from '@geajs/mobile'`, 'View', {}],
      [`import { Dialog as Modal } from '@geajs/ui'`, 'Modal', {}],
      [`import Dialog from '@geajs/ui/dialog'`, 'Dialog', {}],
    ] as const) {
      const errors = playgroundErrors({
        ...files,
        'App.tsx': `import { Component } from '@geajs/core'
${header}

export default class App extends ${base} {
  template() {
    return this.props.on ? <b>on</b> : <i>off</i>
  }
}
`,
      })
      assert.equal(errors.length, 1, `${header}: ${JSON.stringify(errors)}`)
      assert.match(errors[0].message, /`App\.template\(\)` must return a single JSX element or fragment\./)
    }
  })

  // The classes @geajs/* exports that aren't components, however imported.
  it('still compiles a ternary template() in a subclass of a @geajs class that is not a component', () => {
    for (const [header, base] of [
      [`import { Store } from '@geajs/core'`, 'Store'],
      [`import { Store as Base } from '@geajs/core'`, 'Base'],
      [`import * as gea from '@geajs/core'`, 'gea.Store'],
      [`import gea from '@geajs/core'`, 'gea.Store'],
      [`import { Router } from '@geajs/core/router'`, 'Router'],
      [`import { ToastStore } from '@geajs/ui/toast'`, 'ToastStore'],
      [`import { ViewManager } from '@geajs/mobile'`, 'ViewManager'],
      [`import { GestureHandler } from '@geajs/mobile'`, 'GestureHandler'],
    ] as const) {
      const { errors, warnings } = compileForBrowser({
        'App.tsx': `${header}

export class Panel extends ${base} {
  on = true

  template() {
    return this.on ? <b>on</b> : <i>off</i>
  }
}
`,
      })
      assert.deepEqual([...errors, ...warnings], [], header)
    }
  })

  it('still compiles component-valued tags, pointer-capture and custom …Capture events, assignable refs, element spreads, conditional function components and classes that are not components', async () => {
    const { config, buildWarnings, devWarnings } = project(STILL_SUPPORTED_APP, {
      'src/Pick.tsx': `export default function Pick(props: { on?: boolean }) {
  return props.on ? <b>on</b> : <i>off</i>
}
`,
      'src/Shape.ts': `export default class Shape {
  big = true
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
      assert.match(result.code, /reactiveSpread\(/)
    } finally {
      await server.close()
    }
    assert.deepEqual(buildWarnings, [])
    assert.deepEqual(devWarnings, [])
  })
})
