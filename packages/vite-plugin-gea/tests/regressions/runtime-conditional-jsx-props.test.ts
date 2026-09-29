import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { buildEvalPrelude, compileJsxModule, loadRuntimeModules, mergeEvalBindings } from '../helpers/compile'
import { transformFile } from '../../src/closure-codegen/transform.ts'

// Issue #120: a ternary or `&&` with JSX passed as `children` or a named prop
// must keep re-reading its condition, while each JSX branch is built once.

const PARTS = `
  import { Component } from '@geajs/core'
  export class Title extends Component {
    created() { counter.n++ }
    template() { return <b>Title</b> }
  }
  export class Card extends Component {
    template({ children }: any) { return <div class="card">{children}</div> }
  }
  export class Header extends Component {
    template({ header }: any) { return <div class="header">{header}</div> }
  }
  export class Outer extends Component {
    template({ children }: any) { return <Card>{children}</Card> }
  }
  export function FnCard({ children }: any) { return <div class="card">{children}</div> }
  export function FnHeader({ header }: any) { return <div class="header">{header}</div> }
`

type Mountable = { render: (n: Node) => void; dispose: () => void }
type Harness = { root: HTMLElement; ui: { fancy: boolean }; counter: { n: number }; dispose: () => void }

function assertShowsTitle(root: Element, selector: string): void {
  const el = root.querySelector(selector)
  assert.ok(el, `missing ${selector}`)
  assert.equal(el.querySelectorAll('b').length, 1)
  assert.equal(el.textContent, 'Title')
}

function assertShowsOff(root: Element, selector: string, off: string | null): void {
  const el = root.querySelector(selector)
  assert.ok(el, `missing ${selector}`)
  assert.equal(el.querySelector('b'), null)
  if (off !== null) assert.equal(el.textContent, off)
}

async function mountApp(appBody: string, id: string, factories: string[] = []): Promise<Harness> {
  const seed = `cond-jsx-props-${id}-${Date.now()}`
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
  const ui = new Store({ fancy: true }) as { fancy: boolean }
  const counter = { n: 0 }
  const source = `${PARTS}
    export default class App extends Component {
      template() { return <main>${appBody}</main> }
    }
  `
  const names = ['Title', 'Card', 'Header', 'Outer', 'FnCard', 'FnHeader', 'App']
  let App: new () => Mountable
  if (factories.length > 0) {
    // The Vite pipeline calls imported function components directly instead of
    // going through mount(); reproduce that by telling transformFile about them.
    const { code } = transformFile(source, `/virtual/${id}.tsx`, { directFactoryComponents: new Set(factories) })
    const esbuild = await import('esbuild')
    const js = (await esbuild.transform(code, { loader: 'ts', target: 'esnext' })).code
      .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .replace(/export default class\s+/g, 'class ')
      .replace(/export class\s+/g, 'class ')
      .replace(/export function\s+/g, 'function ')
    const bindings = mergeEvalBindings({ Component, ui, counter })
    const mod = new Function(...Object.keys(bindings), `${buildEvalPrelude()}${js}\nreturn { ${names.join(', ')} };`)(
      ...Object.values(bindings),
    )
    App = mod.App
  } else {
    const mod = await compileJsxModule(source, `/virtual/${id}.tsx`, names, { Component, ui, counter })
    App = mod.App as new () => Mountable
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  return { root, ui, counter, dispose: () => app.dispose() }
}

async function toggle(h: Harness): Promise<void> {
  h.ui.fancy = !h.ui.fancy
  await flushMicrotasks()
}

// `off` is the text shown once the condition is false; null means only check
// that the branch is gone (how `false` itself renders is out of scope here).
const CASES: Array<{ name: string; body: string; selector: string; off: string | null; factories?: string[] }> = [
  {
    name: 'ternary in children of a class component',
    body: `<Card>{ui.fancy ? <Title /> : 'plain'}</Card>`,
    selector: '.card',
    off: 'plain',
  },
  {
    name: 'ternary in a named prop of a class component',
    body: `<Header header={ui.fancy ? <Title /> : 'plain'} />`,
    selector: '.header',
    off: 'plain',
  },
  {
    name: '&& in children of a class component',
    body: `<Card>{ui.fancy && <Title />}</Card>`,
    selector: '.card',
    off: null,
  },
  {
    name: '&& in a named prop of a class component',
    body: `<Header header={ui.fancy && <Title />} />`,
    selector: '.header',
    off: null,
  },
  {
    name: 'ternary in children of a function component',
    body: `<FnCard>{ui.fancy ? <Title /> : 'plain'}</FnCard>`,
    selector: '.card',
    off: 'plain',
  },
  {
    name: 'ternary in a named prop of a function component',
    body: `<FnHeader header={ui.fancy ? <Title /> : 'plain'} />`,
    selector: '.header',
    off: 'plain',
  },
  {
    name: 'ternary in children forwarded through another component',
    body: `<Outer>{ui.fancy ? <Title /> : 'plain'}</Outer>`,
    selector: '.card',
    off: 'plain',
  },
  {
    name: 'ternary in children of a directly called function component',
    body: `<FnCard>{ui.fancy ? <Title /> : 'plain'}</FnCard>`,
    selector: '.card',
    off: 'plain',
    factories: ['FnCard'],
  },
  {
    name: 'ternary in a children prop of a directly called function component',
    body: `<FnCard children={ui.fancy ? <Title /> : 'plain'} />`,
    selector: '.card',
    off: 'plain',
    factories: ['FnCard'],
  },
  {
    name: 'ternary in a named prop of a directly called function component',
    body: `<FnHeader header={ui.fancy ? <Title /> : 'plain'} />`,
    selector: '.header',
    off: 'plain',
    factories: ['FnHeader'],
  },
]

describe('conditional JSX passed in props or children (#120)', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => restoreDom())

  for (const [i, c] of CASES.entries()) {
    it(`${c.name} follows the condition`, async () => {
      const h = await mountApp(c.body, `case${i}`, c.factories)
      assertShowsTitle(h.root, c.selector)
      await toggle(h)
      assertShowsOff(h.root, c.selector, c.off)
      await toggle(h)
      assertShowsTitle(h.root, c.selector)
      await toggle(h)
      assertShowsOff(h.root, c.selector, c.off)
      // Each JSX branch is built once and reused across toggles.
      assert.equal(h.counter.n, 1)
      h.dispose()
    })
  }

  it('builds a JSX branch once however often the prop is read', async () => {
    const h = await mountApp(
      `<Card>{ui.fancy ? <Title /> : 'plain'}</Card><Header header={ui.fancy ? <Title /> : 'plain'} />`,
      'reads',
    )
    assert.equal(h.counter.n, 2)
    const card = findComponent(h.root, '.card')
    const header = findComponent(h.root, '.header')
    const children = card.props.children
    const title = header.props.header
    assert.equal(children.textContent, 'Title')
    assert.equal(title.textContent, 'Title')
    for (let i = 0; i < 5; i++) {
      assert.equal(card.props.children, children)
      assert.equal(header.props.header, title)
    }
    await toggle(h)
    assert.equal(card.props.children, 'plain')
    await toggle(h)
    assert.equal(card.props.children, children)
    assert.equal(header.props.header, title)
    assert.equal(h.counter.n, 2)
    h.dispose()
  })
})

/** The component instance whose root element matches `selector`. */
function findComponent(root: Element, selector: string): any {
  const el = root.querySelector(selector) as any
  assert.ok(el, `missing ${selector}`)
  for (const sym of Object.getOwnPropertySymbols(el)) {
    const v = el[sym]
    if (v && typeof v === 'object' && 'props' in v) return v
  }
  assert.fail(`no component on ${selector}`)
}
