/**
 * HMR on a shared functional tab-content module: all tab panels must keep the hot-updated
 * markup when switching tabs. The plugin wraps functional component imports in
 * `createHotComponentProxy` (see looksLikeGeaFunctionalComponentSource); this test mirrors
 * that by binding the proxy around the compiled class.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponentForHmr, loadRuntimeModules } from '../helpers/compile'
import { getGeaHmrBindings, resetGeaHmrTestState } from '../helpers/gea-hmr-runtime'
import { DYNAMIC_TABS_APP, DYNAMIC_TABS_TABS, DYNAMIC_TABS_TAB_CONTENT_FUNCTIONAL } from './_dynamic-tabs-sources.ts'

const APP_MODULE_URL = 'file:///virtual/app.tsx'
/** Must match `new URL('./tab-content-functional', APP_MODULE_URL).href` from the compiler. */
const TAB_CONTENT_MODULE_URL = new URL('./tab-content-functional', APP_MODULE_URL).href
const TABS_MODULE_URL = new URL('./tabs/tabs.tsx', APP_MODULE_URL).href

const TAB_CONTENT_V1 = DYNAMIC_TABS_TAB_CONTENT_FUNCTIONAL

const TAB_CONTENT_V2 = `
export default function TabContentFunctional({ number }: { number: number }) {
  return (
    <div>
      <h2>Tab Contsdfent {number}</h2>
    </div>
  )
}
`

async function buildDownloadsWebAppWithHmr(seed: string, tabContentSource: string) {
  const [{ default: Component }] = await loadRuntimeModules(seed)
  resetGeaHmrTestState()
  const hmrBindings = getGeaHmrBindings()

  const TabContentClass = await compileJsxComponentForHmr(
    tabContentSource,
    '/virtual/tab-content-functional.tsx',
    TAB_CONTENT_MODULE_URL,
    'TabContentFunctional',
    { Component },
    hmrBindings,
  )

  const TabContentFunctional = hmrBindings.createHotComponentProxy(
    TAB_CONTENT_MODULE_URL,
    TabContentClass,
  ) as typeof TabContentClass

  const Tabs = await compileJsxComponentForHmr(
    DYNAMIC_TABS_TABS,
    '/virtual/tabs/tabs.tsx',
    TABS_MODULE_URL,
    'Tabs',
    { Component },
    hmrBindings,
  )

  const App = await compileJsxComponentForHmr(
    DYNAMIC_TABS_APP,
    '/virtual/app.tsx',
    APP_MODULE_URL,
    'App',
    { Component, Tabs, TabContentFunctional },
    hmrBindings,
  )

  return { App, hmrBindings, Component }
}

function panelHtmlAt(app: { el: HTMLElement }, index: number): string {
  const wrappers = Array.from(app.el.querySelectorAll('.tab-content-wrapper')) as HTMLElement[]
  return wrappers[index]?.innerHTML ?? ''
}

test('HMR + tabs: after updating tab-content functional, every tab panel keeps the new markup when switching tabs', async () => {
  const restoreDom = installDom()
  try {
    const seed = `hmr-tabs-${Date.now()}`
    const { App, hmrBindings, Component } = await buildDownloadsWebAppWithHmr(seed, TAB_CONTENT_V1)

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    assert.ok(panelHtmlAt(app, 0).includes('Tab Content'), 'sanity: initial tab 0 shows v1 copy')

    const TabContentV2Class = await compileJsxComponentForHmr(
      TAB_CONTENT_V2,
      '/virtual/tab-content-functional.tsx',
      TAB_CONTENT_MODULE_URL,
      'TabContentFunctional',
      { Component },
      hmrBindings,
    )

    hmrBindings.registerHotModule(TAB_CONTENT_MODULE_URL, { default: TabContentV2Class })
    hmrBindings.handleComponentUpdate(TAB_CONTENT_MODULE_URL, { default: TabContentV2Class })
    await flushMicrotasks()

    assert.ok(panelHtmlAt(app, 0).includes('Contsdfent'), 'after HMR, the active tab shows the hot-updated heading')

    const titleButtons = (): HTMLElement[] => Array.from(app.el.querySelectorAll('.tab-titles button')) as HTMLElement[]

    titleButtons()[2]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    assert.ok(
      panelHtmlAt(app, 2).includes('Contsdfent'),
      'other tab panels keep the hot-updated component after switch',
    )

    titleButtons()[0]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    assert.ok(panelHtmlAt(app, 0).includes('Contsdfent'), 'first tab still shows hot-updated copy after switching back')

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
