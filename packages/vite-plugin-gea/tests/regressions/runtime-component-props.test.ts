import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileJsxModule, loadRuntimeModules } from '../helpers/compile'
import { transformFile } from '../../src/closure-codegen/transform.ts'

// Issue #107: a component passed in a prop other than `children` must mount as
// a node, not be stringified into `[object HTMLSpanElement]`.

const LAYOUT = `
import { Component } from '@geajs/core'

export default class Layout extends Component {
  template({ header, sidebar, main }: any) {
    return (
      <div class="layout">
        <aside>{sidebar}</aside>
        <main>{main}</main>
        <header>{header}</header>
      </div>
    )
  }
}
`

const PARTS = `
export function Title() { return <h1>Title</h1> }
export function Nav() { return <nav>Nav</nav> }
export function Content() { return <p>Content</p> }
`

const APP = `
import { Component } from '@geajs/core'
import Layout from './Layout'
import { Title, Nav, Content } from './Parts'

export default class App extends Component {
  template() {
    return <Layout header={<Title />} sidebar={<Nav />} main={<Content />} />
  }
}
`

/** innerHTML with the runtime's `display:contents` mount wrappers unwrapped. */
function layoutHtml(root: Element): string {
  const copy = root.cloneNode(true) as Element
  for (const span of Array.from(copy.querySelectorAll('span[style="display:contents"]'))) {
    span.replaceWith(...Array.from(span.childNodes))
  }
  return copy.innerHTML
}

describe('components passed as non-children props (#107)', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => restoreDom())

  it('mounts JSX passed in named props of a class component', async () => {
    const seed = `component-props-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const Layout = await compileJsxComponent(LAYOUT, '/virtual/Layout.tsx', 'Layout', { Component })
    const parts = await compileJsxModule(PARTS, '/virtual/Parts.tsx', ['Title', 'Nav', 'Content'], { Component })
    const App = await compileJsxComponent(APP, '/virtual/App.tsx', 'App', { Component, Layout, ...parts })

    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    assert.equal(
      layoutHtml(root),
      '<div class="layout"><aside><nav>Nav</nav></aside><main><p>Content</p></main><header><h1>Title</h1></header></div>',
    )
    app.dispose()
  })

  it('mounts JSX passed in named props of a function component', async () => {
    const seed = `component-props-fn-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    const m = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        function Title() { return <h1>Title</h1> }
        function Card({ header }: any) { return <section class="card">{header}</section> }
        function Panel(props: any) { return <section class="panel">{props.header}</section> }
        export default class App extends Component {
          template() {
            return <div><Card header={<Title />} /><Panel header={<Title />} /></div>
          }
        }
      `,
      '/virtual/FnSlots.tsx',
      ['App'],
      { Component },
    )
    const App = m.App as new () => { render: (n: Node) => void; dispose: () => void }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = new App()
    app.render(root)
    await flushMicrotasks()

    assert.equal(
      layoutHtml(root),
      '<div><section class="card"><h1>Title</h1></section><section class="panel"><h1>Title</h1></section></div>',
    )
    app.dispose()
  })

  it('emits the node-capable text helper for prop reads only', () => {
    const { code } = transformFile(
      `
        import { Component } from '@geajs/core'
        export default class C extends Component {
          name = 'n'
          template({ header }: any) {
            return (
              <div>
                <i>{header}</i>
                <i>{this.props.footer}</i>
                <i>{header || 'none'}</i>
                <b>{this.name}</b>
                <b>{header + 1}</b>
                <b>{\`\${header}\`}</b>
              </div>
            )
          }
        }
      `,
      '/virtual/Helpers.tsx',
    )
    assert.match(code, /reactiveText\(t0, d, this, \(\) => this\.props\.header\)/)
    assert.match(code, /reactiveText\(t1, d, this, \(\) => this\.props\.footer\)/)
    assert.match(code, /reactiveText\(t2, d, this, \(\) => this\.props\.header \|\| 'none'\)/)
    assert.match(code, /reactiveTextValue\(t3, d, this, \["name"\]\)/)
    assert.match(code, /reactiveTextValue\(t4, d, this, \(\) => this\.props\.header \+ 1\)/)
    assert.match(code, /reactiveTextValue\(t5, d, this, \(\) => `\$\{this\.props\.header\}`\)/)
  })
})
