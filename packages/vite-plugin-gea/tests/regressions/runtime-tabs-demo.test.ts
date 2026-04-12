/**
 * End-to-end runtime checks for dynamic tabs:
 * Covers: delegated map clicks, `activeTabIndex` updates,
 * both `.map()` regions stay intact, and tab content renders correctly.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'

/**
 * Compile a tabs app that uses string content (avoids JSX-in-non-template context
 * which the v2 compiler does not wrap in thunks).
 */
async function compileTabsApp(seed: string) {
  const [{ default: Component }] = await loadRuntimeModules(seed)

  const Tabs = await compileJsxComponent(
    `
    export default function Tabs({ tabs, activeTabIndex, onTabChange }) {
      return (
        <div>
          <div class="tab-titles">
            {tabs.map((tab) => (
              <button
                key={\`\${tab.title}-button\`}
                class={\`\${tab.index === activeTabIndex ? 'active' : ''}\`}
                data-index={tab.index}
                click={() => onTabChange(tab.index)}
              >
                {tab.title}
              </button>
            ))}
          </div>
          <div class="tab-contents">
            {tabs.map((tab) => (
              <div
                key={\`\${tab.index}-content\`}
                class={\`tab-content-wrapper \${tab.index === activeTabIndex ? 'active' : ''}\`}
              >
                {tab.content}
              </div>
            ))}
          </div>
        </div>
      )
    }
    `,
    '/virtual/tabs.tsx',
    'Tabs',
    { Component },
  )

  const App = await compileJsxComponent(
    `
    import { Component } from '@geajs/core'
    import Tabs from './tabs'

    export default class App extends Component {
      activeTabIndex = 0
      tabs = [
        { index: 0, title: 'Tab 1', content: 'Tab Content 0' },
        { index: 1, title: 'Tab 2', content: 'Tab Content 1' },
        { index: 2, title: 'Tab 3', content: 'Tab Content 2' },
        { index: 3, title: 'Tab 4', content: 'Tab Content 3' },
      ]

      setActiveTab(index) {
        this.activeTabIndex = index
      }

      template() {
        return (
          <div>
            <Tabs
              tabs={this.tabs}
              activeTabIndex={this.activeTabIndex}
              onTabChange={(index) => this.setActiveTab(index)}
            />
          </div>
        )
      }
    }
    `,
    '/virtual/app.tsx',
    'App',
    { Component, Tabs },
  )

  return { App }
}

test('Dynamic tabs: initial render — 4 tab titles, first active', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-tabs-dynamic`
    const { App } = await compileTabsApp(seed)

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

    const firstText = wrappers()[0]?.textContent ?? ''
    assert.ok(
      firstText.includes('Tab Content'),
      `tab content should contain text. Got: ${firstText.slice(0, 120)}`,
    )

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dynamic tabs: click on Tab 3 calls setActiveTab(2) and updates active classes', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-tabs-click-tab3`
    const { App } = await compileTabsApp(seed)

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

test('Dynamic tabs: after clicking Tab 3, content panes are divs', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-tabs-dom-integrity`
    const { App } = await compileTabsApp(seed)

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

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dynamic tabs: click Tab 2 calls setActiveTab(1)', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-tabs-click-tab2`
    const { App } = await compileTabsApp(seed)

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

test('Dynamic tabs: click Tab 2 — both map regions survive, active tab/content classes stay correct', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-tabs-tab2-dom-regression`
    const { App } = await compileTabsApp(seed)

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
    assert.equal(wrappers().length, 4, 'tab content wrappers must not disappear after click')

    assert.ok(titleButtons()[1]?.className.includes('active'), 'Tab 2 title should be active')
    assert.ok(!titleButtons()[0]?.className.includes('active'), 'Tab 1 title should be inactive')

    assert.ok(wrappers()[1]?.className.includes('active'), 'second content panel should be active')
    assert.ok(!wrappers()[0]?.className.includes('active'), 'first content panel should be inactive')

    const panel2Text = wrappers()[1]?.textContent ?? ''
    assert.ok(
      panel2Text.includes('Tab Content') && panel2Text.includes('1'),
      `Tab 2 panel should contain Tab Content 1; got: ${panel2Text.slice(0, 200)}`,
    )

    const tabContentsEl = app.el.querySelector('.tab-contents')
    assert.ok(tabContentsEl && tabContentsEl.childElementCount >= 4, '.tab-contents should still hold four panels')

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Dynamic tabs: render prop tab.content produces text content, not escaped text', async () => {
  const restoreDom = installDom()
  resetDelegation()
  try {
    const seed = `runtime-${Date.now()}-tabs-render-prop`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class App extends Component {
          activeTabIndex = 0
          tabs = [
            { index: 0, title: 'Tab 1', content: 'Content for tab 0' },
            { index: 1, title: 'Tab 2', content: 'Content for tab 1' },
          ]

          template() {
            const activeTab = this.tabs[this.activeTabIndex]
            return (
              <div class="app">
                <div class="tab-content">{activeTab.content}</div>
              </div>
            )
          }
        }
      `,
      '/virtual/App.jsx',
      'App',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const contentDiv = app.el.querySelector('.tab-content')
    const text = contentDiv?.textContent ?? ''

    assert.ok(
      text.includes('Content for tab 0'),
      `content should render correctly. Got: ${text.slice(0, 200)}`,
    )
    assert.ok(!text.includes('&lt;'), `content must NOT be HTML-escaped. Got: ${text.slice(0, 200)}`)

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
