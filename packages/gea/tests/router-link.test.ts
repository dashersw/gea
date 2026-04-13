import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import { GEA_SET_PROPS } from '../src/compiler-runtime'

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
    const { Router } = await import(`../src/router/router?${seed}`)
    const linkMod = await import(`../src/router/link?${seed}`)
    return { Router, Link: linkMod.default }
  }

  function renderLink(Link: any, props: any) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const link = new Link()
    const thunks: Record<string, () => any> = {}
    for (const k of Object.keys(props)) {
      const v = props[k]
      thunks[k] = () => v
    }
    link[GEA_SET_PROPS](thunks)
    link.render(container)
    return { container, link, el: link.el as HTMLAnchorElement }
  }

  it('renders an <a> tag with href from to prop', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/': () => document.createElement('div') })
    const { el, container } = renderLink(Link, { to: '/about', label: 'About Us' })
    assert.equal(el.tagName, 'A')
    assert.equal(el.getAttribute('href'), '/about')
    assert.equal(el.textContent, 'About Us')

    router.dispose()
    container.remove()
  })

  it('renders label text', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({})
    const { el, container } = renderLink(Link, { to: '/', label: 'Click Me' })
    assert.equal(el.textContent, 'Click Me')

    router.dispose()
    container.remove()
  })

  it('renders class attribute', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({})
    const { el, container } = renderLink(Link, { to: '/', label: 'Home', class: 'nav-link' })
    assert.ok((el.getAttribute('class') ?? '').includes('nav-link'))

    router.dispose()
    container.remove()
  })

  it('click calls router.push(to)', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/target': () => document.createElement('div') })
    const { el, container } = renderLink(Link, { to: '/target', label: 'Go' })
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    assert.equal(router.path, '/target')

    router.dispose()
    container.remove()
  })

  it('click calls onNavigate before router.push(to)', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/target': () => document.createElement('div') })
    let navigated = false
    const { el, container } = renderLink(Link, {
      to: '/target',
      label: 'Go',
      onNavigate: () => {
        navigated = true
      },
    })
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    assert.equal(navigated, true)
    assert.equal(router.path, '/target')

    router.dispose()
    container.remove()
  })

  it('click with replace prop calls router.replace', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/replaced': () => document.createElement('div') })
    const { el, container } = renderLink(Link, { to: '/replaced', replace: true, label: 'Replace' })
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    assert.equal(router.path, '/replaced')

    router.dispose()
    container.remove()
  })

  it('ctrl+click does NOT intercept', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({ '/target': () => document.createElement('div') })
    const pathBefore = router.path
    const { el, container } = renderLink(Link, { to: '/target', label: 'Go' })
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    await flush()
    assert.equal(router.path, pathBefore)

    router.dispose()
    container.remove()
  })

  it('external URL does NOT intercept', async () => {
    const { Router, Link } = await loadModules()
    const router = new Router({})
    const pathBefore = router.path
    const { el, container } = renderLink(Link, { to: 'https://example.com', label: 'External' })
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    assert.equal(router.path, pathBefore)

    router.dispose()
    container.remove()
  })
})
