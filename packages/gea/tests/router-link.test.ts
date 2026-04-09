import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { GEA_ELEMENT, GEA_RENDERED } from '../src/lib/symbols'

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

import Home from '../../../examples/router-simple/src/views/Home'
import About from '../../../examples/router-simple/src/views/About'

describe('Link', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom('http://localhost/')
  })

  afterEach(() => {
    restoreDom()
  })

  async function loadModules() {
    const seed = `link-${Date.now()}-${Math.random()}`
    const { GeaRouter } = await import(`../src/lib/router/router?${seed}`)
    const linkMod = await import(`../src/lib/router/link?${seed}`)
    return { GeaRouter, Link: linkMod.default }
  }

  it('renders an <a> tag with href from to prop', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any, '/about': About as any })
    Link._router = router

    const html = String(new Link({ to: '/about', label: 'About Us' }))
    assert.ok(html.includes('<a'))
    assert.ok(html.includes('href="/about"'))
    assert.ok(html.includes('About Us'))

    router.dispose()
  })

  it('renders label text', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any })
    Link._router = router

    const html = String(new Link({ to: '/', label: 'Click Me' }))
    assert.ok(html.includes('Click Me'))

    router.dispose()
  })

  it('renders children html when provided', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any })
    Link._router = router

    const html = String(new Link({ to: '/', children: '<span class="inner">Click Me</span>' }))
    assert.ok(html.includes('<span class="inner">Click Me</span>'))

    router.dispose()
  })

  it('renders class attribute', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any })
    Link._router = router

    const html = String(new Link({ to: '/', label: 'Home', class: 'nav-link active' }))
    assert.ok(html.includes('class="nav-link active"'))

    router.dispose()
  })

  it('click calls router.push(to)', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any, '/target': About as any })
    Link._router = router

    const link = new Link({ to: '/target', label: 'Go' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.insertAdjacentHTML('beforeend', String(link))
    const el = document.getElementById(link.id) as HTMLAnchorElement
    link[GEA_ELEMENT] = el
    link[GEA_RENDERED] = true
    link.onAfterRender()

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    assert.equal(router.path, '/target')

    router.dispose()
    container.remove()
  })

  it('click calls onNavigate before router.push(to)', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any, '/target': About as any })
    Link._router = router

    let navigated = false
    const link = new Link({
      to: '/target',
      label: 'Go',
      onNavigate: () => {
        navigated = true
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.insertAdjacentHTML('beforeend', String(link))
    const el = document.getElementById(link.id) as HTMLAnchorElement
    link[GEA_ELEMENT] = el
    link[GEA_RENDERED] = true
    link.onAfterRender()

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    assert.equal(navigated, true)
    assert.equal(router.path, '/target')

    router.dispose()
    container.remove()
  })

  it('click with replace prop calls router.replace', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any, '/replaced': About as any })
    Link._router = router

    const link = new Link({ to: '/replaced', replace: true, label: 'Replace' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.insertAdjacentHTML('beforeend', String(link))
    const el = document.getElementById(link.id) as HTMLAnchorElement
    link[GEA_ELEMENT] = el
    link[GEA_RENDERED] = true
    link.onAfterRender()

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    assert.equal(router.path, '/replaced')

    router.dispose()
    container.remove()
  })

  it('ctrl+click does NOT intercept', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any, '/target': About as any })
    Link._router = router

    const pathBefore = router.path
    const link = new Link({ to: '/target', label: 'Go' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.insertAdjacentHTML('beforeend', String(link))
    const el = document.getElementById(link.id) as HTMLAnchorElement
    link[GEA_ELEMENT] = el
    link[GEA_RENDERED] = true
    link.onAfterRender()

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    await flush()

    assert.equal(router.path, pathBefore)

    router.dispose()
    container.remove()
  })

  it('external URL does NOT intercept', async () => {
    const { GeaRouter, Link } = await loadModules()
    const router = new GeaRouter({ '/': Home as any })
    Link._router = router

    const pathBefore = router.path
    const link = new Link({ to: 'https://example.com', label: 'External' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.insertAdjacentHTML('beforeend', String(link))
    const el = document.getElementById(link.id) as HTMLAnchorElement
    link[GEA_ELEMENT] = el
    link[GEA_RENDERED] = true
    link.onAfterRender()

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    assert.equal(router.path, pathBefore)

    router.dispose()
    container.remove()
  })
})
