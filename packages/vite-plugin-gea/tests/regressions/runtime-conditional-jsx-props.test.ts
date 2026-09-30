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
  export class LiveTitle extends Component {
    created() { counter.n++ }
    dispose() { counter.d++; super.dispose() }
    template() { return <b>T{ui.tick}</b> }
  }
  const cache = new Map()
  function cacheSet(key: any, node: any) {
    cache.set(key, node)
    return node
  }
  // Returns the node the previous call for \`key\` got, and keeps this one for the next.
  function swap(key: any, node: any) {
    const prev = cache.get(key) ?? node
    cache.set(key, node)
    return prev
  }
  function wrap(node: any, ..._: any[]) {
    return node
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
  // Keeps the first children it gets and shows all of them or only the first.
  const kept = new WeakMap()
  export class Pick extends Component {
    kids() {
      if (!kept.has(this)) kept.set(this, this.props.children)
      return kept.get(this)
    }
    template() {
      return <div class="pick">{ui.open ? this.kids() : ui.loggedIn ? this.kids().slice(0, 1) : this.kids()[0]}</div>
    }
  }
  // Shows each of its first children's nodes in its own slot.
  export class Split extends Component {
    kids() {
      if (!kept.has(this)) kept.set(this, this.props.children)
      return kept.get(this)
    }
    kid(i: number) {
      return this.kids()[i]
    }
    template() {
      return <div class="card">{ui.open && <p>{this.kid(0)}</p>}{ui.loggedIn && <i>{this.kid(1)}</i>}</div>
    }
  }
  // Shows all of its first children in two slots; the nodes end up in the one rendered last.
  export class Twice extends Component {
    kids() {
      if (!kept.has(this)) kept.set(this, this.props.children)
      return kept.get(this)
    }
    template() {
      return <div class="card">{ui.open && <p>{this.kids()}</p>}{ui.loggedIn && <i>{this.kids()}</i>}</div>
    }
  }
  // Shows its first children's first node in one slot, and swaps another slot
  // from their second node to the first, as a node or an array, or to text.
  export class Swap extends Component {
    kids() {
      if (!kept.has(this)) kept.set(this, this.props.children)
      return kept.get(this)
    }
    kid(i: number) {
      return this.kids()[i]
    }
    shown() {
      const [a, b] = this.kids()
      if (!ui.fancy) return 'none'
      if (this.props.shape === 'array') return ui.loggedIn ? [b] : a
      if (this.props.shape === 'arrays') return ui.loggedIn ? [b] : [a]
      return ui.loggedIn ? b : a
    }
    template() {
      return <div class="card">{ui.open && <p>{this.kid(0)}</p>}<i>{this.shown()}</i></div>
    }
  }
  export class SplitProps extends Component {
    template({ children }: any) {
      return <div class="card">{ui.open && <p>{children[0]}</p>}{ui.loggedIn && <i>{children[1]}</i>}</div>
    }
  }
  export class Slots extends Component {
    template({ children }: any) { return <div class="card">{children.rows}<p>{children.label}</p></div> }
  }
  export class Flat extends Component {
    template({ children }: any) { return <div class="card">{children.flat()}</div> }
  }
  export class RenderCard extends Component {
    template({ children }: any) { return <div class="card">{children(ui.fancy)}</div> }
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
  tick: number
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
    tick: 0,
  }) as Ui
  const counter: Counter = { n: 0, d: 0, p: 0, pd: 0 }
  const source = `${PARTS}
    export default class App extends Component {
      template() { return <main>${appBody}</main> }
    }
  `
  const names = [
    'Title',
    'Profile',
    'Card',
    'Header',
    'Outer',
    'ReactiveCard',
    'Panel',
    'Pick',
    'Split',
    'SplitProps',
    'Swap',
    'Twice',
    'Slots',
    'Flat',
    'RenderCard',
    'FnCard',
    'FnHeader',
    'App',
  ]
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

  it('keeps nested JSX live while the slot still shows part of it', async () => {
    const h = await mountApp(
      `<Pick>{ui.fancy ? ui.ids.map((id: string) => <Profile name={ui.byId[id].name} />) : 'none'}</Pick>`,
      'pick',
    )
    const pick = () => [...h.root.querySelectorAll('.pick i')].map((i) => i.textContent).join('')
    assert.equal(pick(), 'AB')
    h.ui.open = false
    h.flush()
    assert.equal(pick(), 'A')
    h.ui.byId = { a: { name: 'A2' }, b: { name: 'B' } }
    h.flush()
    assert.equal(pick(), 'A2')
    // From the array to its first node alone.
    h.ui.open = true
    h.flush()
    h.ui.loggedIn = false
    h.ui.open = false
    h.flush()
    assert.equal(pick(), 'A2')
    h.ui.byId = { a: { name: 'A3' }, b: { name: 'B' } }
    h.flush()
    assert.equal(pick(), 'A3')
    h.dispose()
    assert.equal(h.counter.p - h.counter.pd, 0)
  })

  // [body, whether a Title shows once `ui.fancy` is false]
  const RUN_BY_THE_READ: Array<[string, boolean]> = [
    [`<Card>{(() => (ui.fancy ? <Title /> : 'plain'))()}</Card>`, false],
    [`<Card>{(function () { return ui.fancy ? <Title /> : 'plain' })()}</Card>`, false],
    [`<Card>{((on: boolean) => (on ? <Title /> : 'plain'))(ui.fancy)}</Card>`, false],
    [`<Card>{ui.fancy ? (() => <Title />)() : 'plain'}</Card>`, false],
    [`<Card>{ui.fancy && (() => <Title />)()}</Card>`, false],
    [`<Card>{ui.fancy ? <Title /> : (() => <Title />)()}</Card>`, true],
    [`<Card>{(function (this: any) { return ui.fancy ? <Title /> : 'plain' }).call(this)}</Card>`, false],
    [
      `<Card>{ui.fancy ? ui.rows.map((r: number) => { const make = () => <Title />; return make() }) : 'none'}</Card>`,
      false,
    ],
    [
      `<Card>{ui.fancy ? ui.rows.map((r: number) => <Title />).concat([((x: any) => <Title />) && 'x']) : 'none'}</Card>`,
      false,
    ],
  ]
  for (const [i, [body, titleWhenOff]] of RUN_BY_THE_READ.entries()) {
    it(`disposes JSX a function the read runs built: ${body}`, async () => {
      const h = await mountApp(body, `run${i}`)
      for (let n = 0; n < 20; n++) {
        const shown = h.root.querySelectorAll('.card b').length
        assert.ok(h.ui.fancy || titleWhenOff ? shown > 0 : shown === 0, `${shown} shown`)
        assertTitlesLive(h)
        await toggle(h)
      }
      h.dispose()
      assertTitlesLive(h, 0)
    })
  }

  it('disposes JSX a read built before it threw', async () => {
    const h = await mountApp(
      `<Card>{ui.fancy ? ui.rows.map((r: number) => (r === 3 ? ui.profile.name : <Title />)) : 'none'}</Card>`,
      'throws',
    )
    assertTitlesLive(h, 2)
    h.ui.profile = null
    h.ui.rows = [1, 2, 3]
    try {
      h.flush()
    } catch {
      // The read's own error; only what it built matters here.
    }
    h.dispose()
    assertTitlesLive(h, 0)
  })

  it('keeps JSX live that a function the read hands out builds later', async () => {
    const h = await mountApp(
      `<RenderCard>{(on: boolean) => (on ? <Profile name={ui.profile.name} /> : 'plain')}</RenderCard>`,
      'handed-out',
    )
    assert.equal(h.root.querySelector('.card')?.textContent, 'Ada')
    h.ui.profile = { name: 'Grace' }
    h.flush()
    assert.equal(h.root.querySelector('.card')?.textContent, 'Grace')
    h.dispose()
    assert.equal(h.counter.p - h.counter.pd, 0)
  })

  it('keeps JSX live that a read returns inside an object', async () => {
    const h = await mountApp(
      `<Slots>{{ label: 'L', rows: ui.ids.map((id: string) => <Profile name={ui.byId[id].name} />) }}</Slots>`,
      'object',
    )
    const names = () => [...h.root.querySelectorAll('.card i')].map((i) => i.textContent).join('')
    assert.equal(names(), 'AB')
    h.ui.byId = { a: { name: 'A2' }, b: { name: 'B2' } }
    h.flush()
    assert.equal(names(), 'A2B2')
    h.dispose()
    assert.equal(h.counter.p - h.counter.pd, 0)
  })

  it('keeps JSX live that a cache returns to later reads', async () => {
    // The first read, when the child installs its props, builds and caches the
    // nodes; the reads after it get them from the cache.
    const h = await mountApp(
      `<Card>{ui.fancy && ui.tick >= 0 && ui.rows.map((r: number) => cache.get(r) ?? cacheSet(r, <LiveTitle />))}</Card>`,
      'cache',
    )
    const card = () => [...h.root.querySelectorAll('.card b')].map((b) => b.textContent).join('')
    assert.equal(card(), 'T0T0')
    assertTitlesLive(h, 2)
    h.ui.tick = 3
    h.flush()
    assert.equal(card(), 'T3T3')
    assertTitlesLive(h, 2)
    // The cache still holds them while they're hidden, so they come back live.
    await toggle(h)
    assert.equal(h.root.querySelectorAll('.card b').length, 0)
    await toggle(h)
    h.ui.tick = 4
    h.flush()
    assert.equal(card(), 'T4T4')
    assert.equal(h.counter.n, 2)
    h.dispose()
    assertTitlesLive(h, 0)
  })

  // User code can keep JSX that it gets as a call argument, so it builds on the
  // parent, as on main, and stays live whenever user code shows it again.
  it('keeps JSX live that user code gets from a cache or creates', async () => {
    const h = await mountApp(`<Card>{cache.get(ui.fancy) ?? cacheSet(ui.fancy, <LiveTitle />)}</Card>`, 'get-or-create')
    const card = () => [...h.root.querySelectorAll('.card b')].map((b) => b.textContent).join('')
    assert.equal(card(), 'T0')
    h.ui.tick = 1
    h.flush()
    assert.equal(card(), 'T1')
    await toggle(h)
    assert.equal(card(), 'T1')
    await toggle(h)
    h.ui.tick = 2
    h.flush()
    assert.equal(card(), 'T2')
    // `children` keeps the first Node, as on main, so the other key never builds.
    assert.equal(h.counter.n, 1)
    assert.equal(h.counter.d, 0)
    h.dispose()
    assertTitlesLive(h, 0)
  })

  it('keeps JSX live that a cache hands back on every other read', async () => {
    const h = await mountApp(
      `<Card>{ui.rows.map((r: number) => cache.get(r * 10 + (ui.tick % 2)) ?? cacheSet(r * 10 + (ui.tick % 2), <LiveTitle />))}</Card>`,
      'alternate-cache',
    )
    const card = () => [...h.root.querySelectorAll('.card b')].map((b) => b.textContent).join('')
    assert.equal(card(), 'T0T0')
    for (let tick = 1; tick <= 4; tick++) {
      h.ui.tick = tick
      h.flush()
      assert.equal(card(), `T${tick}T${tick}`)
    }
    assert.equal(h.counter.n, 4)
    h.dispose()
    assertTitlesLive(h, 0)
  })

  it('keeps JSX live that user code hands out one read later', async () => {
    const h = await mountApp(
      `<Card>{ui.tick >= 0 && ui.rows.map((r: number) => swap(r, <LiveTitle />))}</Card>`,
      'hand-out-later',
    )
    const card = () => [...h.root.querySelectorAll('.card b')].map((b) => b.textContent).join('')
    assert.equal(card(), 'T0T0')
    for (let tick = 1; tick <= 3; tick++) {
      h.ui.tick = tick
      h.flush()
      assert.equal(card(), `T${tick}T${tick}`)
    }
    h.dispose()
    assertTitlesLive(h, 0)
  })

  // Re-running such an expression would build a new node on the parent each
  // read, and reads also follow what the node reads while it's built.
  const USER_KEPT_ONCE = [
    `<Card>{wrap(<LiveTitle />)}</Card>`,
    `<Card>{wrap(<LiveTitle />, ui.fancy)}</Card>`,
    `<Card>{ui.fancy ? <LiveTitle /> : wrap(<LiveTitle />)}</Card>`,
  ]
  for (const [i, body] of USER_KEPT_ONCE.entries()) {
    it(`keeps the first node of \`children\` with JSX user code can keep: ${body}`, async () => {
      const h = await mountApp(body, `user-kept-once${i}`)
      const card = () => [...h.root.querySelectorAll('.card b')].map((b) => b.textContent).join('')
      for (let tick = 1; tick <= 3; tick++) {
        h.ui.tick = tick
        h.flush()
        await toggle(h)
        assert.equal(card(), `T${tick}`)
        assertTitlesLive(h, 1)
      }
      assert.equal(h.counter.n, 1)
      h.dispose()
      assertTitlesLive(h, 0)
    })
  }

  // The kept node is one a function the read runs built, so it's tagged for
  // disposal like other items; the slot hiding it must not dispose it.
  const USER_KEPT_ITEM = [
    `<Panel>{(() => (ui.fancy ? <LiveTitle /> : wrap(<LiveTitle />)))()}</Panel>`,
    `<Panel>{(() => { if (!ui.fancy) return wrap(<LiveTitle />); return <LiveTitle /> })()}</Panel>`,
  ]
  for (const [i, body] of USER_KEPT_ITEM.entries()) {
    it(`keeps the first node of \`children\` live after its slot hides it: ${body}`, async () => {
      const h = await mountApp(body, `user-kept-item${i}`)
      const panel = () => [...h.root.querySelectorAll('.panel b')].map((b) => b.textContent).join('')
      assert.equal(panel(), 'T0')
      for (let tick = 1; tick <= 3; tick++) {
        h.ui.open = false
        h.flush()
        assert.equal(panel(), '')
        h.ui.open = true
        h.flush()
        await toggle(h)
        h.ui.tick = tick
        h.flush()
        assert.equal(panel(), `T${tick}`)
        assertTitlesLive(h, 1)
      }
      assert.equal(h.counter.n, 1)
      h.dispose()
      assertTitlesLive(h, 0)
    })
  }

  // Two slots show nodes of one read; tearing one down must not dispose the other's.
  for (const child of ['Split', 'SplitProps']) {
    it(`keeps a node live in one slot after another slot showing its read is torn down: ${child}`, async () => {
      const h = await mountApp(`<${child}>{(() => [<LiveTitle />, <LiveTitle />])()}</${child}>`, `split-${child}`)
      const text = (tag: string) => [...h.root.querySelectorAll(`.card ${tag} b`)].map((b) => b.textContent).join('')
      assert.equal(text('p') + text('i'), 'T0T0')
      for (let tick = 1; tick <= 3; tick++) {
        h.ui.open = false
        h.flush()
        h.ui.tick = tick
        h.flush()
        assert.equal(text('p') + '|' + text('i'), `|T${tick}`)
        h.ui.open = true
        h.flush()
        assert.equal(text('p') + text('i'), `T${tick}T${tick}`)
      }
      // Once neither slot shows them, they're disposed.
      h.ui.open = false
      h.flush()
      h.ui.loggedIn = false
      h.flush()
      assertTitlesLive(h, 0)
      h.dispose()
      assertTitlesLive(h, 0)
    })
  }

  it('keeps nodes live that another slot took when the slot that showed them first is torn down', async () => {
    const h = await mountApp(`<Twice>{(() => [<LiveTitle />, <LiveTitle />])()}</Twice>`, 'twice')
    const text = (tag: string) => [...h.root.querySelectorAll(`.card ${tag} b`)].map((b) => b.textContent).join('')
    assert.equal(text('p') + '|' + text('i'), '|T0T0')
    h.ui.open = false
    h.flush()
    h.ui.tick = 1
    h.flush()
    assert.equal(text('i'), 'T1T1')
    assertTitlesLive(h, 2)
    h.dispose()
    assertTitlesLive(h, 0)
  })

  // A slot swaps in a node whose first slot was torn down, from a node or an
  // array. The record it shares with what it replaces must stay live.
  for (const shape of ['node', 'array', 'arrays']) {
    it(`keeps a node live that a slot swaps in after the slot that showed it is torn down: ${shape}`, async () => {
      const h = await mountApp(`<Swap shape="${shape}">{(() => [<LiveTitle />, <LiveTitle />])()}</Swap>`, `swap-${shape}`)
      const text = (tag: string) => [...h.root.querySelectorAll(`.card ${tag} b`)].map((b) => b.textContent).join('')
      assert.equal(text('p') + '|' + text('i'), 'T0|T0')
      h.ui.open = false
      h.flush()
      h.ui.loggedIn = false
      h.flush()
      for (let tick = 1; tick <= 3; tick++) {
        h.ui.tick = tick
        h.flush()
        assert.equal(text('p') + '|' + text('i'), `|T${tick}`)
      }
      // The node it dropped shares the shown node's record, so it stays too.
      assertTitlesLive(h, 2)
      // Once the slot shows neither, they're disposed.
      await toggle(h)
      assert.equal(h.root.querySelector('.card i')!.textContent, 'none')
      assertTitlesLive(h, 0)
      h.dispose()
      assertTitlesLive(h, 0)
    })
  }

  it('disposes JSX a function the read runs built inside a nested array', async () => {
    const h = await mountApp(`<Flat>{[ui.fancy ? ui.rows.map((r: number) => <Title />) : []]}</Flat>`, 'nested-array')
    for (let n = 0; n < 6; n++) {
      assert.equal(h.root.querySelectorAll('.card b').length, h.ui.fancy ? 2 : 0)
      assertTitlesLive(h)
      await toggle(h)
    }
    h.dispose()
    assertTitlesLive(h, 0)
  })

  // A `d` the user names inside the expression means what it does on main.
  const NAMES_D = [
    `{ui.open && ui.rows.flatMap((d: number) => [0].map(() => (d > 1 ? <b>big</b> : <i>small</i>)))}`,
    `{ui.open && ((d: number) => ui.rows.map((r: number) => (r >= d ? <b>big</b> : <i>small</i>)))(2)}`,
    `{ui.open && ui.rows.map((r: number) => { const d = r; return d > 1 ? <b>big</b> : <i>small</i> })}`,
    `{ui.open && ui.rows.map((r: number) => { let d = r; return d > 1 ? <b>big</b> : <i>small</i> })}`,
  ]
  for (const [i, children] of NAMES_D.entries()) {
    it(`leaves a user's \`d\` alone: ${children}`, async () => {
      const h = await mountApp(`<Card>${children}</Card>`, `names-d${i}`)
      // Array slots also leave a stray text node behind (#192), so only read the elements.
      const card = () => [...h.root.querySelectorAll('.card b, .card i')].map((e) => e.textContent).join('')
      assert.equal(card(), 'smallbig')
      h.ui.rows = [2, 1]
      h.flush()
      assert.equal(card(), 'bigsmall')
      h.ui.open = false
      h.flush()
      h.ui.open = true
      h.flush()
      assert.equal(card(), 'bigsmall')
      h.dispose()
    })
  }

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
