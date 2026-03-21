import assert from 'node:assert/strict'
import { describe, it, before, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'

// ── DOM setup ──────────────────────────────────────────────────────

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
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    localStorage: (globalThis as any).localStorage,
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
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    localStorage: dom.window.localStorage,
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

// ── Module loader ──────────────────────────────────────────────────

async function loadModules() {
  const seed = `router-${Date.now()}-${Math.random()}`
  const { GeaRouter } = await import(`../src/lib/router/router?${seed}`)
  return { GeaRouter: GeaRouter as typeof import('../src/lib/router/router').GeaRouter }
}

let Home: any, About: any, UserProfile: any, NotFound: any
let Dashboard: any, LoginPage: any, AdminPanel: any, ProjectDetail: any
let AppShell: any, DashboardLayout: any

// ── Tests ──────────────────────────────────────────────────────────

describe('GeaRouter', () => {
  let restoreDom: () => void

  before(async () => {
    restoreDom = installDom('http://localhost/')
    Home = (await import('../../../examples/router-simple/src/views/Home')).default
    About = (await import('../../../examples/router-simple/src/views/About')).default
    UserProfile = (await import('../../../examples/router-simple/src/views/UserProfile')).default
    NotFound = (await import('../../../examples/router-simple/src/views/NotFound')).default
    Dashboard = (await import('../../../examples/router-v2/src/views/Overview')).default
    LoginPage = (await import('../../../examples/router-v2/src/views/Login')).default
    AdminPanel = (await import('../../../examples/router-v2/src/views/Projects')).default
    ProjectDetail = (await import('../../../examples/router-v2/src/views/Project')).default
    AppShell = (await import('../../../examples/router-v2/src/layouts/AppShell')).default
    DashboardLayout = (await import('../../../examples/router-v2/src/layouts/DashboardLayout')).default
    restoreDom()
  })

  beforeEach(() => {
    restoreDom = installDom('http://localhost/')
  })

  afterEach(() => {
    restoreDom()
  })

  // 1. Initial state from window.location
  it('initializes state from window.location', async () => {
    restoreDom()
    restoreDom = installDom('http://localhost/initial')
    const { GeaRouter } = await loadModules()

    const routes = { '/initial': Home as any }
    const router = new GeaRouter(routes)

    assert.equal(router.path, '/initial')
    assert.equal(router.route, '/initial')
    router.dispose()
  })

  // 2. push(string) updates path, route, params, matches
  it('push(string) updates path, route, params, matches', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/users/:id': UserProfile as any,
    } as const

    const router = new GeaRouter(routes)
    router.push('/users/42')

    assert.equal(router.path, '/users/42')
    assert.equal(router.route, '/users/:id')
    assert.equal(router.params.id, '42')
    assert.equal(router.matches.length, 1)
    assert.equal(router.matches[0], '/users/:id')
    router.dispose()
  })

  // 3. push(NavigationTarget object) updates path, query, hash
  it('push(NavigationTarget object) updates path, query, hash', async () => {
    const { GeaRouter } = await loadModules()

    const routes = { '/search': Home as any }
    const router = new GeaRouter(routes)

    router.push({ path: '/search', query: { q: 'hello', page: '2' }, hash: '#results' })

    assert.equal(router.path, '/search')
    assert.equal(router.query.q, 'hello')
    assert.equal(router.query.page, '2')
    assert.equal(router.hash, '#results')
    router.dispose()
  })

  // 4. replace() updates state
  it('replace() updates state', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/replaced': About as any,
    }
    const router = new GeaRouter(routes)
    router.replace('/replaced')

    assert.equal(router.path, '/replaced')
    assert.equal(router.route, '/replaced')
    assert.equal(router.page, About)
    router.dispose()
  })

  // 5. back(), forward(), go(-2) call history API
  it('back(), forward(), go() call history API', async () => {
    const { GeaRouter } = await loadModules()

    const routes = { '/': Home as any, '/a': About as any }
    const router = new GeaRouter(routes)

    // These methods delegate to window.history — just verify they don't throw
    const calls: string[] = []
    const origBack = window.history.back
    const origForward = window.history.forward
    const origGo = window.history.go

    window.history.back = () => {
      calls.push('back')
    }
    window.history.forward = () => {
      calls.push('forward')
    }
    window.history.go = (n: number) => {
      calls.push(`go:${n}`)
    }

    router.back()
    router.forward()
    router.go(-2)

    assert.deepEqual(calls, ['back', 'forward', 'go:-2'])

    window.history.back = origBack
    window.history.forward = origForward
    window.history.go = origGo
    router.dispose()
  })

  // 6. isActive() returns true for prefix match
  it('isActive() returns true for prefix match', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/users/:id': UserProfile as any,
    }
    const router = new GeaRouter(routes)
    router.push('/users/42')

    assert.equal(router.isActive('/users'), true)
    assert.equal(router.isActive('/users/42'), true)
    assert.equal(router.isActive('/about'), false)
    router.dispose()
  })

  // 7. isExact() returns true only for exact match
  it('isExact() returns true only for exact match', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/users/:id': UserProfile as any,
    }
    const router = new GeaRouter(routes)
    router.push('/users/42')

    assert.equal(router.isExact('/users/42'), true)
    assert.equal(router.isExact('/users'), false)
    router.dispose()
  })

  // 8. Route resolution — push resolves to correct component via router.page
  it('push resolves to correct component via router.page', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/projects/:id': ProjectDetail as any,
      '*': NotFound as any,
    }
    const router = new GeaRouter(routes)

    assert.equal(router.page, Home)

    router.push('/projects/42')
    assert.equal(router.page, ProjectDetail)
    assert.equal(router.params.id, '42')

    router.dispose()
  })

  // 9. Guards that redirect
  it('guards that redirect change path to redirect target', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/login': LoginPage as any,
      '/admin': {
        guard: () => '/login',
        children: {
          '/': AdminPanel as any,
        },
      } as any,
    }
    const router = new GeaRouter(routes)
    router.push('/admin')

    // Guard redirects to /login
    assert.equal(router.path, '/login')
    assert.equal(router.page, LoginPage)
    router.dispose()
  })

  // 10. Guards that return Component — router.page returns the guard component
  it('guards that return Component show guard component via router.page', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/protected': {
        guard: () => LoginPage,
        children: {
          '/': Dashboard as any,
        },
      } as any,
    }
    const router = new GeaRouter(routes)
    router.push('/protected')

    assert.equal(router.page, LoginPage)
    assert.equal(router.path, '/protected')
    router.dispose()
  })

  // 11. Lazy routes — async resolution updates router.page
  it('lazy routes resolve and update router.page', async () => {
    const { GeaRouter } = await loadModules()

    const LazyHome = async () => ({ default: Dashboard })

    const routes = {
      '/': Home as any,
      '/lazy': LazyHome as any,
    }
    const router = new GeaRouter(routes)
    router.push('/lazy')

    // Before resolution, page is not yet Dashboard
    // Wait for async resolution
    await flush()
    await flush()

    assert.equal(router.page, Dashboard)
    assert.equal(router.error, null)
    router.dispose()
  })

  // 12. Failed lazy routes — sets router.error
  it('failed lazy routes set router.error', async () => {
    const { GeaRouter } = await loadModules()

    const FailingLazy = async () => {
      throw new Error('Network error')
    }

    const routes = {
      '/': Home as any,
      '/broken': FailingLazy as any,
    }
    const router = new GeaRouter(routes)
    router.push('/broken')

    // resolveLazy retries 3 times with exponential backoff — use a 0-delay version
    // Actually, default is 3 retries with 1s delay. We need to wait long enough.
    // For testing, let's wait enough time for the retries to fail.
    // With retries=3 and delay=1000: waits 1000 + 2000 + 4000 = 7000ms total.
    // That's too long for a test. Let's instead use a lazy that fails immediately
    // and check that error is eventually set.

    // Actually, resolveLazy has default retries=3. We can't control that from here.
    // Let's wait for all retries to complete (up to 10s)
    // For a faster test, we rely on the fact that the promise chain resolves eventually.
    // Let's use a shorter approach: wait in a loop.
    const start = Date.now()
    while (router.error === null && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 100))
    }

    assert.ok(router.error !== null, 'error should be set')
    assert.ok(router.error!.includes('Network error'))
    router.dispose()
  })

  // 13. Base path — strips base on incoming, prepends on outgoing
  it('base path strips base on incoming and prepends on outgoing', async () => {
    restoreDom()
    restoreDom = installDom('http://localhost/app/dashboard')
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/dashboard': Dashboard as any,
      '/about': About as any,
    }
    const router = new GeaRouter(routes, { base: '/app' })

    // Initial path should have base stripped
    assert.equal(router.path, '/dashboard')
    assert.equal(router.page, Dashboard)

    // Push should prepend base in URL but path stays without base
    router.push('/about')
    assert.equal(router.path, '/about')
    assert.equal(window.location.pathname, '/app/about')
    assert.equal(router.page, About)

    router.dispose()
  })

  // 14. dispose() removes popstate listener
  it('dispose() removes popstate listener', async () => {
    const { GeaRouter } = await loadModules()

    const routes = { '/': Home as any }
    const router = new GeaRouter(routes)

    let listenerRemoved = false
    const origRemove = window.removeEventListener
    window.removeEventListener = function (type: string, ...args: any[]) {
      if (type === 'popstate') listenerRemoved = true
      return origRemove.call(this, type, ...args)
    } as any

    router.dispose()
    assert.equal(listenerRemoved, true)

    window.removeEventListener = origRemove
  })

  // Additional: reactive fields trigger observers
  it('push triggers reactive updates on path', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/about': About as any,
    }
    const router = new GeaRouter(routes)

    const paths: string[] = []
    router.observe('path', (val: string) => {
      paths.push(val)
    })

    router.push('/about')
    await flush()

    assert.ok(paths.length >= 1)
    assert.equal(paths[paths.length - 1], '/about')
    router.dispose()
  })

  // String redirects
  it('string redirect navigates to target', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/old': '/new' as any,
      '/new': About as any,
    }
    const router = new GeaRouter(routes)
    router.push('/old')

    assert.equal(router.path, '/new')
    assert.equal(router.page, About)
    router.dispose()
  })

  // No match returns null component
  it('no match results in null page', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
    }
    const router = new GeaRouter(routes)
    router.push('/nonexistent')

    assert.equal(router.page, null)
    router.dispose()
  })

  // Router created without routes still reads the initial URL
  it('router without routes reads initial URL from window.location', async () => {
    restoreDom()
    restoreDom = installDom('http://localhost/some/deep/route?q=1#section')
    const { GeaRouter } = await loadModules()

    const router = new GeaRouter()
    assert.equal(router.path, '/some/deep/route', 'path should reflect window.location.pathname')
    assert.equal(router.hash, '#section', 'hash should reflect window.location.hash')
    assert.deepEqual(router.query, { q: '1' }, 'query should reflect window.location.search')
    router.dispose()
  })

  it('navigate() is an alias for push()', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': Home as any,
      '/about': About as any,
    }
    const router = new GeaRouter(routes)
    router.navigate('/about')

    assert.equal(router.path, '/about')
    assert.equal(router.page, About)
    router.dispose()
  })

  it('getComponentAtDepth passes page prop to layouts', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': {
        layout: AppShell,
        children: {
          '/dashboard': {
            layout: DashboardLayout,
            children: {
              '/': Dashboard,
              '/projects': AdminPanel,
            },
          },
        },
      } as any,
    }
    const router = new GeaRouter(routes)
    router.push('/dashboard')

    const depth0 = router.getComponentAtDepth(0)
    assert.equal(depth0?.component, AppShell, 'depth 0 should be AppShell')
    assert.equal(depth0?.props.page, DashboardLayout, 'AppShell page prop should be DashboardLayout')

    const depth1 = router.getComponentAtDepth(1)
    assert.equal(depth1?.component, DashboardLayout, 'depth 1 should be DashboardLayout')
    assert.equal(depth1?.props.page, Dashboard, 'DashboardLayout page prop should be Dashboard')

    router.push('/dashboard/projects')
    const depth1b = router.getComponentAtDepth(1)
    assert.equal(depth1b?.props.page, AdminPanel, 'after nav, DashboardLayout page prop should be AdminPanel')

    router.dispose()
  })

  it('guard component replaces entire layout chain when guard blocks', async () => {
    const { GeaRouter } = await loadModules()

    const routes = {
      '/': {
        layout: AppShell,
        guard: () => LoginPage,
        children: {
          '/dashboard': Dashboard,
        },
      } as any,
    }
    const router = new GeaRouter(routes)
    router.push('/dashboard')

    // Guard blocks before _applyResolved — layouts are not applied, guard component shows directly
    assert.equal(router.page, LoginPage, 'router.page should be the guard component')
    const depth0 = router.getComponentAtDepth(0)
    assert.equal(depth0?.component, LoginPage, 'depth 0 should be the guard component (no layout)')

    router.dispose()
  })
})
