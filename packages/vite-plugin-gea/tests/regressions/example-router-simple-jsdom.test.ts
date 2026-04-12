import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadComponentUnseeded } from '../helpers/compile'
import { readExampleFile } from '../helpers/example-paths'
import { resetDelegation } from '../../../../packages/gea/src/dom/events'

async function mountRouterSimple(seed: string) {
  const Component = await loadComponentUnseeded()
  const { createRouter, Link, RouterView } = await import(`../../../gea/src/router/index.ts?${seed}`)
  const router = createRouter({})
  Link._router = router

  const Home = await compileJsxComponent(
    readExampleFile('router-simple/src/views/Home.tsx'),
    '/virtual/examples/router-simple/Home.jsx',
    'Home',
    { Component },
  )
  const About = await compileJsxComponent(
    readExampleFile('router-simple/src/views/About.tsx'),
    '/virtual/examples/router-simple/About.jsx',
    'About',
    { Component },
  )
  const UserProfile = await compileJsxComponent(
    readExampleFile('router-simple/src/views/UserProfile.tsx'),
    '/virtual/examples/router-simple/UserProfile.jsx',
    'UserProfile',
    { Component, Link },
  )
  const NotFound = await compileJsxComponent(
    readExampleFile('router-simple/src/views/NotFound.tsx'),
    '/virtual/examples/router-simple/NotFound.jsx',
    'NotFound',
    { Component, Link },
  )

  const App = await compileJsxComponent(
    readExampleFile('router-simple/src/App.tsx'),
    '/virtual/examples/router-simple/App.jsx',
    'App',
    { Component, router, Link, RouterView, Home, About, UserProfile, NotFound },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  return { app, root, router }
}

describe('examples/router-simple in JSDOM (ported from router-simple.spec)', { concurrency: false }, () => {
  let restoreDom: () => void
  let root: HTMLElement
  let app: { dispose?: () => void }
  let router: { dispose?: () => void }

  beforeEach(async () => {
    resetDelegation()
    restoreDom = installDom('http://localhost/')
    const m = await mountRouterSimple(`ex-rs-${Date.now()}-${Math.random()}`)
    app = m.app
    root = m.root
    router = m.router
  })

  afterEach(async () => {
    try { app.dispose?.() } catch {}
    try { router.dispose?.() } catch {}
    await flushMicrotasks()
    root.remove()
    restoreDom()
  })

  it('home and nav links', async () => {
    assert.equal(root.querySelector('.view h1')?.textContent, 'Home')
    assert.equal(root.querySelectorAll('.nav a').length, 5)
  })

  it('navigate to About', async () => {
    const aboutLink = [...root.querySelectorAll('.nav a')].find((a) => a.textContent === 'About') as HTMLAnchorElement
    assert.ok(aboutLink)
    aboutLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await flushMicrotasks()
    assert.equal(root.querySelector('.view h1')?.textContent, 'About')
    const active = root.querySelector('.nav a.active')
    assert.equal(active?.textContent, 'About')
  })

  it('user profile route', async () => {
    const alice = [...root.querySelectorAll('.nav a')].find((a) => a.textContent === 'Alice') as HTMLAnchorElement
    assert.ok(alice)
    alice.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await flushMicrotasks()
    assert.equal(root.querySelector('.user-profile h1')?.textContent, 'Alice')
  })

  it('unknown route 404', async () => {
    try { app.dispose?.() } catch {}
    try { router.dispose?.() } catch {}
    await flushMicrotasks()
    root.remove()
    restoreDom()

    resetDelegation()
    restoreDom = installDom('http://localhost/this-does-not-exist')
    const m = await mountRouterSimple(`ex-rs-404-${Date.now()}-${Math.random()}`)
    app = m.app
    root = m.root
    router = m.router
    assert.equal(root.querySelector('.not-found h1')?.textContent, '404')
  })
})
