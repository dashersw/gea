import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { buildEvalPrelude, compileJsxModule, loadRuntimeModules, mergeEvalBindings } from '../helpers/compile'
import { transformFile } from '../../src/closure-codegen/transform.ts'

// Issue #120: a ternary or `&&` with JSX passed as `children` or a named prop
// must keep re-reading its condition, while each JSX branch is built once
// while it stays selected and disposed once it isn't.

const PARTS = `
  import { Component } from '@geajs/core'
  export class Title extends Component {
    created() { counter.n++ }
    dispose() { counter.d++; super.dispose() }
    template() { return <b>Title</b> }
  }
  export class Profile extends Component {
    created() { counter.p++ }
    dispose() { counter.pd++; super.dispose() }
    template({ name }: any) { return <i>{name}</i> }
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
  // The setter keeps this on the CompiledReactiveComponent base.
  export class ReactiveCard extends Component {
    open = true
    set flag(v: boolean) { this.open = v }
    template({ children }: any) { return <div class="card">{children}</div> }
  }
  export class Panel extends Component {
    template({ children }: any) { return <div class="panel">{ui.open && <p>{children}</p>}</div> }
  }
  export function FnCard({ children }: any) { return <div class="card">{children}</div> }
  export function FnHeader({ header }: any) { return <div class="header">{header}</div> }
`

type Mountable = { render: (n: Node) => void; dispose: () => void }
type Ui = {
  fancy: boolean
  rows: number[]
  open: boolean
  loggedIn: boolean
  profile: { name: string } | null
  ids: string[]
  byId: Record<string, { name: string }>
}
type Counter = { n: number; d: number; p: number; pd: number }
type Harness = { root: HTMLElement; ui: Ui; counter: Counter; flush: () => void; dispose: () => void }

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

/** Every `Title` built and not yet disposed is one of the `<b>`s on screen. */
function assertTitlesLive(h: Harness, expected = h.root.querySelectorAll('b').length): void {
  assert.equal(h.counter.n - h.counter.d, expected, 'Title instances alive')
}

async function mountApp(appBody: string, id: string, factories: string[] = []): Promise<Harness> {
  const seed = `cond-jsx-props-${id}-${Date.now()}`
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
  const ui = new Store({
    fancy: true,
    rows: [1, 2],
    open: true,
    loggedIn: true,
    profile: { name: 'Ada' },
    ids: ['a', 'b'],
    byId: { a: { name: 'A' }, b: { name: 'B' } },
  }) as Ui
  const counter: Counter = { n: 0, d: 0, p: 0, pd: 0 }
  const source = `${PARTS}
    export default class App extends Component {
      template() { return <main>${appBody}</main> }
    }
  `
  const names = ['Title', 'Profile', 'Card', 'Header', 'Outer', 'ReactiveCard', 'Panel', 'FnCard', 'FnHeader', 'App']
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
  return { root, ui, counter, flush: () => Store.flushAll(), dispose: () => app.dispose() }
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
    name: 'ternary in children of a reactive class component',
    body: `<ReactiveCard>{ui.fancy ? <Title /> : 'plain'}</ReactiveCard>`,
    selector: '.card',
    off: 'plain',
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
      assertTitlesLive(h, 1)
      await toggle(h)
      assertShowsOff(h.root, c.selector, c.off)
      assertTitlesLive(h, 0)
      await toggle(h)
      assertShowsTitle(h.root, c.selector)
      assertTitlesLive(h, 1)
      await toggle(h)
      assertShowsOff(h.root, c.selector, c.off)
      assertTitlesLive(h, 0)
      h.dispose()
      assertTitlesLive(h, 0)
    })
  }

  it('builds a JSX branch once while it stays selected', async () => {
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
    assert.equal(h.counter.n, 2)
    await toggle(h)
    assert.equal(card.props.children, 'plain')
    assert.equal(h.counter.d, 2)
    // Switching back builds the branch again, as an in-template conditional does.
    await toggle(h)
    assert.notEqual(card.props.children, children)
    assert.equal(card.props.children, card.props.children)
    assert.equal(h.counter.n, 4)
    assertTitlesLive(h, 2)
    h.dispose()
  })

  it('disposes a hidden branch before its bindings see the state that hid it', async () => {
    for (const body of [
      `<Card>{ui.loggedIn && <Profile name={ui.profile.name} />}</Card>`,
      `<Header header={ui.loggedIn && <Profile name={ui.profile.name} />} />`,
    ]) {
      const h = await mountApp(body, 'guard')
      assert.equal(h.root.querySelector('i')?.textContent, 'Ada')
      h.ui.loggedIn = false
      h.ui.profile = null
      assert.doesNotThrow(() => h.flush(), body)
      assert.equal(h.root.querySelector('i'), null, body)
      assert.equal(h.counter.p - h.counter.pd, 0, body)
      h.dispose()
    }
  })

  it('disposes JSX built by a nested function once its nodes are replaced', async () => {
    const h = await mountApp(`<Card>{ui.fancy ? <Title /> : ui.rows.map((r: number) => <Title />)}</Card>`, 'mixed')
    assertTitlesLive(h, 1)
    await toggle(h)
    assertTitlesLive(h, 2)
    for (let i = 3; i <= 6; i++) {
      h.ui.rows = [...h.ui.rows, i]
      await flushMicrotasks()
      assertTitlesLive(h, i)
    }
    await toggle(h)
    assertTitlesLive(h, 1)
    h.dispose()
    assertTitlesLive(h, 0)
  })

  it('disposes JSX a nested function built on a read that was never shown', async () => {
    // The first read happens when the child installs its props, before it renders.
    const h = await mountApp(`<Card>{ui.fancy ? ui.rows.map((r: number) => <Title />) : 'none'}</Card>`, 'eager')
    assertTitlesLive(h, 2)
    h.ui.rows = [1, 2, 3]
    await flushMicrotasks()
    assertTitlesLive(h, 3)
    h.dispose()
    assertTitlesLive(h, 0)
  })

  it('disposes JSX a nested function built once its slot is torn down', async () => {
    const h = await mountApp(`<Panel>{ui.rows.length > 0 && ui.rows.map((r: number) => <Title />)}</Panel>`, 'panel')
    for (let i = 0; i < 3; i++) {
      assertTitlesLive(h, 2)
      h.ui.open = false
      await flushMicrotasks()
      assertTitlesLive(h, 0)
      h.ui.open = true
      await flushMicrotasks()
    }
    h.dispose()
    assertTitlesLive(h, 0)
  })

  it('disposes replaced nested JSX before its bindings see the state that replaced it', async () => {
    const h = await mountApp(
      `<Card>{ui.fancy ? <Title /> : ui.ids.map((id: string) => <Profile name={ui.byId[id].name} />)}</Card>`,
      'nested-guard',
    )
    await toggle(h)
    assert.equal(h.root.querySelector('.card')?.textContent, 'AB')
    h.ui.ids = ['a']
    h.ui.byId = { a: { name: 'A' } }
    assert.doesNotThrow(() => h.flush())
    assert.equal(h.root.querySelector('.card')?.textContent, 'A')
    assert.equal(h.counter.p - h.counter.pd, 1)
    h.dispose()
  })

  it('keeps a JSX site shown when an array around it re-renders', async () => {
    const h = await mountApp(`<Card>{[<Title />, ui.fancy ? 'a' : 'b']}</Card>`, 'array-site')
    assert.equal(h.root.querySelectorAll('.card b').length, 1)
    await toggle(h)
    assert.equal(h.root.querySelectorAll('.card b').length, 1)
    assert.equal(h.counter.n, 1)
    h.dispose()
  })

  it('keeps a named prop with JSX in a nested function built once', async () => {
    // Such a prop keeps the whole-value memo it had before #120 (see #194).
    const h = await mountApp(
      `<Header header={ui.fancy ? <Title /> : ui.rows.map((r: number) => <Title />)} />`,
      'named-mixed',
    )
    assertTitlesLive(h, 1)
    await toggle(h)
    for (let i = 3; i <= 6; i++) {
      h.ui.rows = [...h.ui.rows, i]
      await flushMicrotasks()
    }
    assert.equal(h.counter.n, 1)
    assertTitlesLive(h, 1)
    h.dispose()
    assertTitlesLive(h, 0)
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
