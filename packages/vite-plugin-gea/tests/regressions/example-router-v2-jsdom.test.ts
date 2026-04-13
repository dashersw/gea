import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadComponentUnseeded } from '../helpers/compile'
import { readExampleFile } from '../helpers/example-paths'

async function mountRouterV2(seed: string) {
  const Component = await loadComponentUnseeded()
  const { router, Link, RouterView, Outlet } = await import(`../../../gea/src/router/index.ts?${seed}`)
  const { default: authStore } = await import('../../../../examples/router-v2/src/stores/auth-store.ts')
  authStore.logout()

  const AuthGuard = () => (authStore.user ? (true as const) : '/login')

  const NotFound = await compileJsxComponent(
    readExampleFile('router-v2/src/views/NotFound.tsx'),
    '/virtual/examples/router-v2/NotFound.jsx',
    'NotFound',
    { Component, Link },
  )
  const BillingSettings = await compileJsxComponent(
    readExampleFile('router-v2/src/views/BillingSettings.tsx'),
    '/virtual/examples/router-v2/BillingSettings.jsx',
    'BillingSettings',
    { Component },
  )
  const ProfileSettings = await compileJsxComponent(
    readExampleFile('router-v2/src/views/ProfileSettings.tsx'),
    '/virtual/examples/router-v2/ProfileSettings.jsx',
    'ProfileSettings',
    { Component, authStore },
  )
  const ProjectEdit = await compileJsxComponent(
    readExampleFile('router-v2/src/views/ProjectEdit.tsx'),
    '/virtual/examples/router-v2/ProjectEdit.jsx',
    'ProjectEdit',
    { Component, Link },
  )
  const Project = await compileJsxComponent(
    readExampleFile('router-v2/src/views/Project.tsx'),
    '/virtual/examples/router-v2/Project.jsx',
    'Project',
    { Component, Link },
  )
  const Projects = await compileJsxComponent(
    readExampleFile('router-v2/src/views/Projects.tsx'),
    '/virtual/examples/router-v2/Projects.jsx',
    'Projects',
    { Component, Link },
  )
  const Overview = await compileJsxComponent(
    readExampleFile('router-v2/src/views/Overview.tsx'),
    '/virtual/examples/router-v2/Overview.jsx',
    'Overview',
    { Component, authStore },
  )
  const Login = await compileJsxComponent(
    readExampleFile('router-v2/src/views/Login.tsx'),
    '/virtual/examples/router-v2/Login.jsx',
    'Login',
    { Component, router, authStore },
  )
  const DashboardLayout = await compileJsxComponent(
    readExampleFile('router-v2/src/layouts/DashboardLayout.tsx'),
    '/virtual/examples/router-v2/DashboardLayout.jsx',
    'DashboardLayout',
    { Component, router, Link, Outlet },
  )
  const SettingsLayout = await compileJsxComponent(
    readExampleFile('router-v2/src/layouts/SettingsLayout.tsx'),
    '/virtual/examples/router-v2/SettingsLayout.jsx',
    'SettingsLayout',
    { Component, Outlet },
  )
  const AppShell = await compileJsxComponent(
    readExampleFile('router-v2/src/layouts/AppShell.tsx'),
    '/virtual/examples/router-v2/AppShell.jsx',
    'AppShell',
    { Component, router, Link, Outlet, authStore },
  )

  const appSource = readExampleFile('router-v2/src/App.tsx')
    .replace(`import { AuthGuard } from './guards'\n`, '')
    .replace(`'/projects/:id/edit': () => import('./views/ProjectEdit'),`, `'/projects/:id/edit': ProjectEdit,`)

  const App = await compileJsxComponent(appSource, '/virtual/examples/router-v2/App.jsx', 'App', {
    Component,
    router,
    RouterView,
    AuthGuard,
    AppShell,
    DashboardLayout,
    SettingsLayout,
    Login,
    Overview,
    Projects,
    Project,
    ProfileSettings,
    BillingSettings,
    NotFound,
    ProjectEdit,
  })

  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  return { app, root, authStore, router }
}

describe('examples/router-v2 in JSDOM (ported from router-v2.spec)', { concurrency: false }, () => {
  let restoreDom: () => void
  let root: HTMLElement
  let app: { dispose: () => void }
  let router: { dispose: () => void }

  beforeEach(async () => {
    restoreDom = installDom('http://localhost/')
    const m = await mountRouterV2(`ex-rv2-${Date.now()}-${Math.random()}`)
    app = m.app
    root = m.root
    router = m.router
  })

  afterEach(async () => {
    app.dispose()
    router.dispose()
    await flushMicrotasks()
    root.remove()
    restoreDom()
  })

  it('unauthenticated sees login', async () => {
    assert.ok(root.querySelector('.login-page'))
  })

  it('login reaches dashboard overview', async () => {
    const name = root.querySelector('#login-name') as HTMLInputElement
    const email = root.querySelector('#login-email') as HTMLInputElement
    name.value = 'Test User'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    email.value = 'test@example.com'
    email.dispatchEvent(new Event('input', { bubbles: true }))
    ;(root.querySelector('.btn-primary') as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.ok(root.querySelector('.app-shell'))
    assert.equal(root.querySelector('.overview h1')?.textContent, 'Dashboard')
  })

  it('sidebar project navigation', async () => {
    const name = root.querySelector('#login-name') as HTMLInputElement
    name.value = 'Test User'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    ;(root.querySelector('.btn-primary') as HTMLButtonElement).click()
    await flushMicrotasks()

    const projectsLink = [...root.querySelectorAll('.sidebar-link')].find((a) => a.textContent === 'Projects') as
      | HTMLAnchorElement
      | undefined
    assert.ok(projectsLink)
    projectsLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await flushMicrotasks()
    assert.equal(root.querySelector('.projects h1')?.textContent, 'Projects')
  })
})
