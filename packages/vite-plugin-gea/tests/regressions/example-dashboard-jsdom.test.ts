import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileJsxModule, loadComponentUnseeded, readGeaUiSource } from '../helpers/compile'
import { readExampleFile } from '../helpers/example-paths'

function shimResizeObserver() {
  const prev = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver
  return () => {
    if (prev) globalThis.ResizeObserver = prev
    else delete (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  }
}

async function mountDashboard() {
  const Component = await loadComponentUnseeded()
  const { cn } = await import('../../../gea-ui/src/utils/cn.ts')
  const { default: ZagComponent } = await import('../../../gea-ui/src/primitives/zag-component.ts')
  const { normalizeProps } = await import('@zag-js/vanilla')
  const progress = await import('@zag-js/progress')
  const tabs = await import('@zag-js/tabs')
  const avatar = await import('@zag-js/avatar')

  const { Button } = await compileJsxModule(
    readGeaUiSource('components', 'button.tsx'),
    '/virtual/gea-ui/Button.jsx',
    ['Button'],
    { Component, cn },
  )
  const { Badge } = await compileJsxModule(
    readGeaUiSource('components', 'badge.tsx'),
    '/virtual/gea-ui/Badge.jsx',
    ['Badge'],
    { Component, cn },
  )
  const { Separator } = await compileJsxModule(
    readGeaUiSource('components', 'separator.tsx'),
    '/virtual/gea-ui/Separator.jsx',
    ['Separator'],
    { Component, cn },
  )
  const { Skeleton } = await compileJsxModule(
    readGeaUiSource('components', 'skeleton.tsx'),
    '/virtual/gea-ui/Skeleton.jsx',
    ['Skeleton'],
    { Component, cn },
  )

  const cardMod = await compileJsxModule(
    readGeaUiSource('components', 'card.tsx'),
    '/virtual/gea-ui/card.jsx',
    ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter'],
    { Component, cn },
  )

  const { Progress } = await compileJsxModule(
    readGeaUiSource('components', 'progress.tsx'),
    '/virtual/gea-ui/Progress.jsx',
    ['Progress'],
    { ZagComponent, progress, normalizeProps },
  )

  const { Avatar } = await compileJsxModule(
    readGeaUiSource('components', 'avatar.tsx'),
    '/virtual/gea-ui/Avatar.jsx',
    ['Avatar'],
    { ZagComponent, avatar, normalizeProps },
  )

  const { Tabs } = await compileJsxModule(
    readGeaUiSource('components', 'tabs.tsx'),
    '/virtual/gea-ui/Tabs.jsx',
    ['Tabs'],
    { ZagComponent, tabs, normalizeProps },
  )

  const DashboardApp = await compileJsxComponent(
    readExampleFile('dashboard/app.tsx'),
    '/virtual/examples/dashboard/App.jsx',
    'App',
    {
      Component,
      Button,
      Card: cardMod.Card,
      CardHeader: cardMod.CardHeader,
      CardTitle: cardMod.CardTitle,
      CardDescription: cardMod.CardDescription,
      CardContent: cardMod.CardContent,
      CardFooter: cardMod.CardFooter,
      Badge,
      Progress,
      Avatar,
      Tabs,
      Separator,
      Skeleton,
    },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new DashboardApp()
  app.render(root)
  await flushMicrotasks()
  await flushMicrotasks()
  return { app, root }
}

describe('examples/dashboard in JSDOM (ported from dashboard.spec)', { concurrency: false }, () => {
  let restoreDom: () => void
  let restoreRO: () => void
  let root: HTMLElement
  let app: { dispose: () => void }

  beforeEach(async () => {
    restoreDom = installDom()
    restoreRO = shimResizeObserver()
    const m = await mountDashboard()
    app = m.app
    root = m.root
  })

  afterEach(async () => {
    app.dispose()
    await flushMicrotasks()
    root.remove()
    restoreRO()
    restoreDom()
  })

  it('header title and primary actions', () => {
    assert.equal(root.querySelector('.dashboard-header h1')?.textContent, 'Dashboard')
    assert.ok(root.textContent?.includes('Welcome back'))
    assert.ok(root.textContent?.includes('Download Report'))
    assert.ok(root.textContent?.includes('Create New'))
    assert.ok(root.textContent?.includes('Live'))
  })

  it('four stat cards', () => {
    assert.equal(root.querySelectorAll('.stat-card').length, 4)
    assert.ok(root.textContent?.includes('$45,231.89'))
    assert.equal(root.querySelectorAll('.stat-change.positive').length, 4)
  })

  it('overview tabs and chart placeholder', () => {
    assert.ok(root.querySelector('button[data-part="trigger"]'))
    assert.ok(root.textContent?.includes('Revenue'))
    assert.ok(root.querySelector('.chart-placeholder'))
  })

  it('monthly target and progress', () => {
    assert.ok(root.textContent?.includes('Monthly Target'))
    assert.ok(root.textContent?.includes('On Track'))
    assert.ok(root.querySelector('[data-part="track"]'))
  })

  it('recent activity and team lists', () => {
    assert.equal(root.querySelectorAll('.activity-item').length, 5)
    assert.equal(root.querySelectorAll('.team-member').length, 4)
    assert.ok(root.textContent?.includes('Olivia Martin'))
    assert.ok(root.textContent?.includes('Sofia Davis'))
  })

  it('skeleton group and avatars', () => {
    assert.ok(root.querySelector('.skeleton-group'))
    assert.ok(root.querySelectorAll('.avatar-root').length >= 9)
  })

  it('footer copy', () => {
    assert.ok(root.textContent?.includes('gea-ui Dashboard Example'))
  })

  it('no data-gea-compiled-child-root leaks', () => {
    assert.equal(root.querySelectorAll('[data-gea-compiled-child-root]').length, 0)
  })
})
