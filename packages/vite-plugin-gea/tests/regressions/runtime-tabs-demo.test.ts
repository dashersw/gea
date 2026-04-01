/**
 * End-to-end runtime checks for the **dynamic tabs** fixture (see `_dynamic-tabs-sources.ts`):
 *   `src/components/app.tsx`, `tabs/tabs.tsx`, `tab-content-functional.tsx`
 *
 * Covers: delegated map clicks resolve the correct item (template-literal keys), `activeTabIndex` updates,
 * both `.map()` regions stay intact, and tab content remains real HTML inside `.tab-content-wrapper`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'
import { DYNAMIC_TABS_APP, DYNAMIC_TABS_TAB_CONTENT_FUNCTIONAL, DYNAMIC_TABS_TABS } from './_dynamic-tabs-sources.ts'

async function compileDownloadsWebApp(seed: string) {
  const [{ default: Component }] = await loadRuntimeModules(seed)

  const TabContentFunctional = await compileJsxComponent(
    DYNAMIC_TABS_TAB_CONTENT_FUNCTIONAL,
    '/virtual/tab-content-functional.tsx',
    'TabContentFunctional',
    { Component },
  )

  const Tabs = await compileJsxComponent(DYNAMIC_TABS_TABS, '/virtual/tabs/tabs.tsx', 'Tabs', { Component })

  const App = await compileJsxComponent(DYNAMIC_TABS_APP, '/virtual/app.tsx', 'App', {
    Component,
    Tabs,
    TabContentFunctional,
  })

  return { App }
}

test('Dynamic tabs: initial render — 4 tab titles, first active, template literal item ids', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-tabs-dynamic`
    const { App } = await compileDownloadsWebApp(seed)

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const buttons = (): HTMLElement[] => Array.from(app.el.querySelectorAll('.tab-titles button')) as HTMLElement[]
    assert.equal(buttons().length, 4)

    assert.ok(buttons()[0]?.className.includes('active'), 'first tab title should be active')
    assert.ok(!buttons()[1]?.className.includes('active'), 'second tab title should not be active')

    const wrappers = (): HTMLElement[] => Array.from(app.el.querySelectorAll('.tab-content-wrapper')) as HTMLElement[]
    assert.equal(wrappers().length, 4)
    assert.ok(wrappers()[0]?.className.includes('active'), 'first content panel should be active')

    const itemIds = buttons().map((b) => b.getAttribute('data-gea-item-id'))
    assert.ok(
      !itemIds.some((id) => id === '[object Object]' || id === '[Object object]'),
      `data-gea-item-id must not be [object Object], got: ${itemIds.join(', ')}`,
    )

    const firstHtml = wrappers()[0]?.innerHTML ?? ''
    assert.ok(
      firstHtml.includes('<') && firstHtml.includes('Tab Content'),
      `tab content should render as HTML, not plain escaped text. Got: ${firstHtml.slice(0, 120)}`,
    )

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dynamic tabs: first click on Tab 3 calls setActiveTab(2) and updates active classes', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-tabs-click-tab3`
    const { App } = await compileDownloadsWebApp(seed)

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const titleButtons = (): HTMLElement[] => Array.from(app.el.querySelectorAll('.tab-titles button')) as HTMLElement[]
    assert.equal(titleButtons().length, 4)

    let lastIndex: number | undefined
    const orig = app.setActiveTab.bind(app)
    app.setActiveTab = (i: number) => {
      lastIndex = i
      orig(i)
    }

    titleButtons()[2]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(lastIndex, 2, 'clicking third tab title should call setActiveTab(2)')
    assert.equal((app as { activeTabIndex: number }).activeTabIndex, 2, 'parent activeTabIndex should be 2')

    assert.ok(titleButtons()[2]?.className.includes('active'), 'third tab title should have active class')
    assert.ok(
      !titleButtons()[0]?.className.includes('active'),
      'first tab title should be inactive after switching to tab 3',
    )

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dynamic tabs: after clicking Tab 3, content panes are divs with real HTML (not button + escaped text)', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-tabs-dom-integrity`
    const { App } = await compileDownloadsWebApp(seed)

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const titleButtons = (): HTMLElement[] => Array.from(app.el.querySelectorAll('.tab-titles button')) as HTMLElement[]
    titleButtons()[2]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    const wrappers = app.el.querySelectorAll('.tab-content-wrapper')
    assert.equal(wrappers.length, 4, 'still four content panels')

    for (const el of wrappers) {
      assert.equal(el.tagName, 'DIV', 'tab-content-wrapper must be a <div>, not a <button>')
    }

    const contentsHtml = app.el.querySelector('.tab-contents')?.innerHTML ?? ''
    assert.ok(!contentsHtml.includes('&lt;div'), 'tab contents must not store HTML as escaped text entities')

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dynamic tabs: first click on Tab 2 calls setActiveTab(1)', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-tabs-click-tab2`
    const { App } = await compileDownloadsWebApp(seed)

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const titleButtons = (): HTMLElement[] => Array.from(app.el.querySelectorAll('.tab-titles button')) as HTMLElement[]
    let lastIndex: number | undefined
    const orig = app.setActiveTab.bind(app)
    app.setActiveTab = (i: number) => {
      lastIndex = i
      orig(i)
    }

    titleButtons()[1]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(lastIndex, 1, 'clicking second tab title should call setActiveTab(1)')
    assert.equal((app as { activeTabIndex: number }).activeTabIndex, 1)

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dynamic tabs: click Tab 2 — both map regions survive, active tab/content classes and HTML stay correct', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-tabs-tab2-dom-regression`
    const { App } = await compileDownloadsWebApp(seed)

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const titleButtons = (): HTMLElement[] => Array.from(app.el.querySelectorAll('.tab-titles button')) as HTMLElement[]
    const wrappers = (): HTMLElement[] => Array.from(app.el.querySelectorAll('.tab-content-wrapper')) as HTMLElement[]

    assert.equal(titleButtons().length, 4)
    assert.equal(wrappers().length, 4)

    titleButtons()[1]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal((app as { activeTabIndex: number }).activeTabIndex, 1)

    assert.equal(titleButtons().length, 4, 'tab title buttons must not disappear after click')
    assert.equal(wrappers().length, 4, 'tab content wrappers must not disappear after click (regression: shared #__dc)')

    assert.ok(titleButtons()[1]?.className.includes('active'), 'Tab 2 title should be active')
    assert.ok(!titleButtons()[0]?.className.includes('active'), 'Tab 1 title should be inactive')

    assert.ok(wrappers()[1]?.className.includes('active'), 'second content panel should be active')
    assert.ok(!wrappers()[0]?.className.includes('active'), 'first content panel should be inactive')

    const panel2Html = wrappers()[1]?.innerHTML ?? ''
    assert.ok(
      panel2Html.includes('Tab Content') && panel2Html.includes('1'),
      `Tab 2 panel should contain Tab Content 1 HTML; got: ${panel2Html.slice(0, 200)}`,
    )

    const tabContentsEl = app.el.querySelector('.tab-contents')
    assert.ok(tabContentsEl && tabContentsEl.childElementCount >= 4, '.tab-contents should still hold four panels')

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dynamic tabs: render prop tab.content() produces HTML, not escaped text', async () => {
  const restoreDom = installDom()
  try {
    const seed = `runtime-${Date.now()}-tabs-render-prop`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TabContent = await compileJsxComponent(
      `
        export default function TabContent({ number }) {
          return <div class="inner"><h2>Content {number}</h2></div>
        }
      `,
      '/virtual/TabContent.jsx',
      'TabContent',
      { Component },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import TabContent from './TabContent'

        export default class App extends Component {
          activeTabIndex = 0
          tabs = [
            { index: 0, title: 'Tab 1', content: () => <TabContent number={0} /> },
            { index: 1, title: 'Tab 2', content: () => <TabContent number={1} /> },
          ]

          template() {
            const activeTab = this.tabs[this.activeTabIndex]
            return (
              <div class="app">
                <div class="tab-content">{activeTab.content()}</div>
              </div>
            )
          }
        }
      `,
      '/virtual/App.jsx',
      'App',
      { Component, TabContent },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const contentDiv = app.el.querySelector('.tab-content')
    const html = contentDiv?.innerHTML ?? ''

    assert.ok(
      html.includes('<div') || html.includes('<h2'),
      `render prop content must produce HTML elements, not escaped text. Got: ${html.slice(0, 200)}`,
    )
    assert.ok(!html.includes('&lt;'), `render prop content must NOT be HTML-escaped. Got: ${html.slice(0, 200)}`)

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
