import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE, GEA_COMPILED } from '../src/symbols'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { Component } from '../src/component/component'
import type { PropThunks } from '../src/component/props'

function installDom(url = 'http://localhost/') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url })
  const raf = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  const caf = (id: number) => clearTimeout(id)
  dom.window.requestAnimationFrame = raf
  dom.window.cancelAnimationFrame = caf

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: (globalThis as any).HTMLElement,
    Element: (globalThis as any).Element,
    DocumentFragment: (globalThis as any).DocumentFragment,
    Text: (globalThis as any).Text,
    Node: (globalThis as any).Node,
    NodeFilter: (globalThis as any).NodeFilter,
    MutationObserver: (globalThis as any).MutationObserver,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    MouseEvent: (globalThis as any).MouseEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    DocumentFragment: dom.window.DocumentFragment,
    Text: dom.window.Text,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MouseEvent: dom.window.MouseEvent,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
  })

  return () => {
    Object.assign(globalThis, prev)
    dom.window.close()
  }
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

// ── Stub components ────────────────────────────────────────────────

class Home extends Component {}
class About extends Component {}

// ── Helper: create a Link with props wired up ──────────────────────

let linkIdCounter = 0

function createLink(LinkClass: any, props: Record<string, any>) {
  const link = new LinkClass()
  const thunks: PropThunks = {}
  for (const [key, value] of Object.entries(props)) {
    thunks[key] = () => value
  }
  link[GEA_SET_PROPS](thunks)
  ;(link as any).id = `link-test-${linkIdCounter++}`
  return link
}

function getTemplateHtml(link: any): string {
  const node = link[GEA_CREATE_TEMPLATE]()
  if (node instanceof Element) return node.outerHTML
  // DocumentFragment: serialize all children
  const div = document.createElement('div')
  div.appendChild(node.cloneNode(true))
  return div.innerHTML
}

/** Ensure the router has an observe() stub so Link.onAfterRender() can call
 *  router.observe('path', cb) without throwing.  In production this is provided
 *  by the compiler; in unit tests we supply a no-op that returns a remover. */
function ensureObserve(router: any) {
  if (typeof router.observe !== 'function') {
    router.observe = (_field: string, _cb: () => void) => () => {}
  }
}

function mountLink(link: any, container: HTMLElement) {
  const html = getTemplateHtml(link)
  container.insertAdjacentHTML('beforeend', html)
  const el = document.getElementById((link as any).id) as HTMLAnchorElement
  ;(link as any).el = el
  ensureObserve(link.constructor._router)
  link.onAfterRender()
  return el
}

describe('Link', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom('http://localhost/')
    linkIdCounter = 0
  })

  afterEach(() => {
    restoreDom()
  })

  async function loadModules() {
    const seed = `link-${Date.now()}-${Math.random()}`
    const { Router } = await import(`../src/router/router?${seed}`)
    const linkMod = await import(`../src/router/link?${seed}`)
    return { Router, Link: linkMod.default }
  }

  it('renders an <a> tag with href from to prop', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any, '/about': About as any })
    Link._router = router

    const link = createLink(Link, { to: '/about', label: 'About Us' })
    const html = getTemplateHtml(link)
    assert.ok(html.includes('<a'))
    assert.ok(html.includes('href="/about"'))
    assert.ok(html.includes('About Us'))

    router.dispose()
  })

  it('renders label text', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any })
    Link._router = router

    const link = createLink(Link, { to: '/', label: 'Click Me' })
    const html = getTemplateHtml(link)
    assert.ok(html.includes('Click Me'))

    router.dispose()
  })

  it('renders children html when provided', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any })
    Link._router = router

    const link = createLink(Link, { to: '/', children: '<span class="inner">Click Me</span>' })
    const html = getTemplateHtml(link)
    assert.ok(html.includes('<span class="inner">Click Me</span>'))

    router.dispose()
  })

  it('renders class attribute', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any })
    Link._router = router

    const link = createLink(Link, { to: '/', label: 'Home', class: 'nav-link active' })
    const html = getTemplateHtml(link)
    assert.ok(html.includes('class="nav-link active"'))

    router.dispose()
  })

  it('click calls router.push(to)', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any, '/target': About as any })
    Link._router = router

    const link = createLink(Link, { to: '/target', label: 'Go' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const el = mountLink(link, container)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    assert.equal(router.path, '/target')

    router.dispose()
    container.remove()
  })

  it('click calls onNavigate before router.push(to)', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any, '/target': About as any })
    Link._router = router

    let navigated = false
    const link = createLink(Link, {
      to: '/target',
      label: 'Go',
      onNavigate: () => {
        navigated = true
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const el = mountLink(link, container)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    assert.equal(navigated, true)
    assert.equal(router.path, '/target')

    router.dispose()
    container.remove()
  })

  it('click with replace prop calls router.replace', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any, '/replaced': About as any })
    Link._router = router

    const link = createLink(Link, { to: '/replaced', replace: true, label: 'Replace' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const el = mountLink(link, container)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    assert.equal(router.path, '/replaced')

    router.dispose()
    container.remove()
  })

  it('ctrl+click does NOT intercept', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any, '/target': About as any })
    Link._router = router

    const pathBefore = router.path
    const link = createLink(Link, { to: '/target', label: 'Go' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const el = mountLink(link, container)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    await flush()

    assert.equal(router.path, pathBefore)

    router.dispose()
    container.remove()
  })

  it('external URL does NOT intercept', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': Home as any })
    Link._router = router

    const pathBefore = router.path
    const link = createLink(Link, { to: 'https://example.com', label: 'External' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const el = mountLink(link, container)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    assert.equal(router.path, pathBefore)

    router.dispose()
    container.remove()
  })
})
