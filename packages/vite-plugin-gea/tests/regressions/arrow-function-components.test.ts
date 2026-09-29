/**
 * Arrow-function (#106) and function-expression (#122) components, and
 * anonymous `export default function` components (#123), must compile and
 * render like `function` declarations: named (`export const X = () => <jsx/>`,
 * `export const X = function () { … }`), default
 * (`export default (props) => <jsx/>`, `export default function () { … }`) and
 * block-bodied arrows, in the Vite plugin (dev and build) and in the
 * playground compiler.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { parse } from '@babel/parser'
import type { ResolvedConfig } from 'vite'
import { flushMicrotasks, installDom } from '../../../../tests/helpers/jsdom-setup'
import { geaPlugin } from '../../src/index.ts'
import { compileForBrowser } from '../../src/browser.ts'
import { normalizeArrowComponents } from '../../src/preprocess/arrow-components.ts'
import { generate } from '../../src/utils/babel-interop.ts'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const GEA_SRC = path.resolve(TEST_DIR, '../../../gea/src')
const HMR_RUNTIME = path.resolve(TEST_DIR, '../helpers/gea-hmr-runtime.ts')

const FILES: Record<string, string> = {
  'NamedArrow.tsx': `export const NamedArrow = () => <p class="named-arrow">named arrow</p>\n`,
  'DefaultArrow.tsx': `export default (props: { label: string }) => <p class="default-arrow">default arrow {props.label}</p>\n`,
  'BlockArrow.tsx': `export const BlockArrow = ({ label }: { label: string }) => {
  const text = label.toUpperCase()
  return <p class="block-arrow">{text}</p>
}
`,
  'FnExpr.tsx': `export const FnExpr = function () {
  return <p class="fn-expr">function expression</p>
}
`,
  'DefaultFnExpr.tsx': `const DefaultFnExpr = function Inner(props: { label: string }) {
  return <p class="default-fn-expr">default function expression {props.label}</p>
}
export default DefaultFnExpr
`,
  'AnonDefault.tsx': `export default function (props: { label: string }) {
  return <p class="anon-default">anonymous default {props.label}</p>
}
`,
  'FnDecl.tsx': `export function FnDecl() {
  return <p class="fn-decl">function declaration</p>
}
`,
  'App.tsx': `import { Component } from '@geajs/core'
import { NamedArrow } from './NamedArrow'
import DefaultArrow from './DefaultArrow'
import { BlockArrow } from './BlockArrow'
import { FnExpr } from './FnExpr'
import DefaultFnExpr from './DefaultFnExpr'
import AnonDefault from './AnonDefault'
import { FnDecl } from './FnDecl'

const LocalArrow = () => <p class="local-arrow">local arrow</p>
const LocalFnExpr = function () {
  return <p class="local-fn-expr">local function expression</p>
}

export default class App extends Component {
  template() {
    return (
      <div class="app">
        <NamedArrow />
        <DefaultArrow label="x" />
        <BlockArrow label="block" />
        <LocalArrow />
        <FnExpr />
        <DefaultFnExpr label="y" />
        <AnonDefault label="z" />
        <LocalFnExpr />
        <FnDecl />
      </div>
    )
  }
}
`,
}

const EXPECTED_HTML =
  '<div class="app">' +
  '<p class="named-arrow">named arrow</p>' +
  '<p class="default-arrow">default arrow x</p>' +
  '<p class="block-arrow">BLOCK</p>' +
  '<p class="local-arrow">local arrow</p>' +
  '<p class="fn-expr">function expression</p>' +
  '<p class="default-fn-expr">default function expression y</p>' +
  '<p class="anon-default">anonymous default z</p>' +
  '<p class="local-fn-expr">local function expression</p>' +
  '<p class="fn-decl">function declaration</p>' +
  '</div>'

async function compileWithPlugin(dir: string, command: 'build' | 'serve'): Promise<Record<string, string>> {
  const plugin = geaPlugin()
  if (command === 'serve' && typeof plugin.configResolved === 'function') {
    plugin.configResolved.call({} as never, { command } as ResolvedConfig)
  }
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform!.handler
  const out: Record<string, string> = {}
  for (const [filename, source] of Object.entries(FILES)) {
    const result = await transform.call({} as never, source, path.join(dir, filename))
    out[filename] = !result ? source : typeof result === 'string' ? result : result.code
  }
  return out
}

/**
 * Writes compiled modules as `.mjs` next to the sources and imports `App`.
 * Leftover JSX goes through `@geajs/core/jsx-runtime`, as it does in an app
 * with `jsxImportSource: '@geajs/core'`.
 */
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
      .replace(/from\s*['"]\.\/(\w+)['"]/g, (_m, name) => `from './${name}.mjs'`)
      // Dev output resolves proxied component imports against the importer's URL.
      .replace(/new URL\((['"])\.\/(\w+)\1/g, (_m, q, name) => `new URL(${q}./${name}.mjs${q}`)
    writeFileSync(path.join(dir, filename.replace(/\.tsx$/, '.mjs')), rewritten, 'utf8')
  }
  return (await import(url(path.join(dir, 'App.mjs')))).default
}

async function renderApp(App: any): Promise<string> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  const html = root.innerHTML
  app.dispose()
  root.remove()
  return html
}

describe('components in every function form render (#106, #122, #123)', { concurrency: false }, () => {
  let restoreDom: () => void
  let dir: string

  beforeEach(() => {
    restoreDom = installDom()
    dir = mkdtempSync(path.join(tmpdir(), 'gea-arrow-components-'))
    for (const [filename, source] of Object.entries(FILES)) writeFileSync(path.join(dir, filename), source, 'utf8')
  })

  afterEach(() => {
    restoreDom()
    rmSync(dir, { recursive: true, force: true })
  })

  it('vite build', async () => {
    const App = await loadApp(dir, await compileWithPlugin(dir, 'build'))
    assert.equal(await renderApp(App), EXPECTED_HTML)
  })

  it('vite dev server', async () => {
    const App = await loadApp(dir, await compileWithPlugin(dir, 'serve'))
    assert.equal(await renderApp(App), EXPECTED_HTML)
  })

  it('playground compiler', async () => {
    const { compiledModules, errors } = compileForBrowser(FILES)
    assert.deepEqual(errors, [])
    const App = await loadApp(dir, compiledModules)
    assert.equal(await renderApp(App), EXPECTED_HTML)
  })
})

describe('normalizeArrowComponents', () => {
  function normalize(source: string, filename = '/src/Comp.tsx'): string {
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
    normalizeArrowComponents(ast, filename)
    return generate(ast).code
  }

  it('rewrites named, local and block-bodied arrows into function declarations', () => {
    const out = normalize(`
      export const Named = (props) => <p>{props.a}</p>
      const Local = () => <i />
      export const Block = ({ a }) => { const b = a + 1; return <p>{b}</p> }
    `)
    assert.match(out, /export function Named\(props\) \{\s*return <p>\{props\.a\}<\/p>;\s*\}/)
    assert.match(out, /^function Local\(\) \{\s*return <i \/>;\s*\}/m)
    assert.match(out, /export function Block\(\{\s*a\s*\}\) \{\s*const b = a \+ 1;\s*return <p>\{b\}<\/p>;\s*\}/)
  })

  it('rewrites arrows that pick their root with a condition (#124)', () => {
    const out = normalize(`
      export const Cond = (p) => p.a ? <a /> : <b />
      export const And = (p) => p.a && <a />
    `)
    assert.match(out, /export function Cond\(p\) \{\s*return p\.a \? <a \/> : <b \/>;\s*\}/)
    assert.match(out, /export function And\(p\) \{\s*return p\.a && <a \/>;\s*\}/)
  })

  it('names an anonymous default export after the file, avoiding clashes', () => {
    assert.match(
      normalize(`export default (p) => <p />`, '/src/default-arrow.tsx'),
      /export default function DefaultArrow\(p\)/,
    )
    assert.match(
      normalize(`import Card from './Card'\nexport default () => <Card />`, '/src/Card.tsx'),
      /export default function Card1\(\)/,
    )
  })

  it('splits multi-declarator consts and keeps the other declarators in order', () => {
    const out = normalize(`export const a = 1, A = () => <a />, b = 2, c = 3`)
    assert.match(
      out,
      /export const a = 1;\s*export function A\(\) \{\s*return <a \/>;\s*\}\s*export const b = 2,\s*c = 3;/,
    )
  })

  it('keeps TypeScript type parameters and return types', () => {
    const out = normalize(`export const List = <T,>(props: { items: T[] }): Node => <ul />`)
    assert.match(out, /export function List<T,?>\(props: \{\s*items: T\[\];?\s*\}\): Node \{/)
  })

  it('leaves arrows alone that are not components or would change meaning as functions', () => {
    const ast = parse(
      `
      export const lower = () => <p />
      export const NotJsx = () => 1
      export let Mutable = () => <p />
      export const UsesThis = () => <p>{this.x}</p>
      export const UsesArguments = () => <p>{arguments[0]}</p>
      export const ThisInDefault = (p = this.x) => <p>{p}</p>
      export const ArgumentsInDefault = ({ a } = arguments[0]) => <p>{a}</p>
      export const ComputedArguments = (p) => <p>{p[arguments]}</p>
    `,
      { sourceType: 'module', plugins: ['jsx', 'typescript'] },
    )
    assert.equal(normalizeArrowComponents(ast, '/src/Comp.tsx'), false)
    assert.doesNotMatch(generate(ast).code, /function/)
  })

  it('rewrites function-expression components into function declarations (#122)', () => {
    const out = normalize(`
      export const Named = function (props) { return <p>{props.a}</p> }
      const Local = async function () { return <p>{this.x}{arguments[0]}</p> }
      export default Local
    `)
    assert.match(out, /export function Named\(props\) \{\s*return <p>\{props\.a\}<\/p>;\s*\}/)
    assert.match(
      out,
      /^async function Local\(\) \{\s*return <p>\{this\.x\}\{arguments\[0\]\}<\/p>;\s*\}\s*export default Local;/m,
    )
  })

  it('renames references to a named function expression to the component name (#122)', () => {
    const out = normalize(`
      export const Tree = function Node(props) {
        return <ul>{props.items.map((i) => <Node items={i.children}></Node>)}{Node.name}{props.Node}</ul>
      }
      export const Same = function Same() { return <p>{Same.name}</p> }
      export const Param = function Inner(Inner) { return <p>{Inner}</p> }
    `)
    assert.match(out, /export function Tree\(props\)/)
    assert.match(out, /<Tree items=\{i\.children\}><\/Tree>\)\}\{Tree\.name\}\{props\.Node\}/)
    assert.match(out, /export function Same\(\) \{\s*return <p>\{Same\.name\}<\/p>;/)
    assert.match(out, /export function Param\(Inner\) \{\s*return <p>\{Inner\}<\/p>;/)
  })

  it('leaves function expressions alone that are not components or cannot be renamed', () => {
    const ast = parse(
      `
      export const lower = function () { return <p /> }
      export const NotJsx = function () { return 1 }
      export let Mutable = function () { return <p /> }
      export const Shadowed = function Inner() { const Shadowed = 1; return <p>{Inner}{Shadowed}</p> }
      export const Reassigned = function Inner() { Inner = 1; return <p /> }
      export const SameReassigned = function SameReassigned() { SameReassigned = 1; return <p /> }
    `,
      { sourceType: 'module', plugins: ['jsx', 'typescript'] },
    )
    assert.equal(normalizeArrowComponents(ast, '/src/Comp.tsx'), false)
    assert.doesNotMatch(generate(ast).code, /^(export )?function/m)
  })

  it('names an anonymous `export default function` component after the file (#123)', () => {
    assert.match(
      normalize(`export default function (props) { return <p>{props.a}</p> }`, '/src/anon-default.tsx'),
      /export default function AnonDefault\(props\)/,
    )
    assert.match(
      normalize(`import Card from './Card'\nexport default async function () { return <Card /> }`, '/src/Card.tsx'),
      /export default async function Card1\(\)/,
    )
    assert.match(normalize(`export default function () { return 1 }`), /export default function \(\)/)
  })

  it('converts arrows whose `this` belongs to a nested function', () => {
    const out = normalize(`export const Btn = () => <button click={function () { this.x }} />`)
    assert.match(out, /export function Btn\(\)/)
  })

  it('converts arrows that use `arguments` only as a property or key name', () => {
    const out = normalize(`
      export const Args = (props: { arguments: string[] }) => <p>{props.arguments}{props?.arguments}</p>
      export const Opts = () => <Child opts={{ arguments: 1 }} />
    `)
    assert.match(out, /export function Args\(props/)
    assert.match(out, /export function Opts\(\)/)
  })
})
