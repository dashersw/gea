import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { installDom, flushMicrotasks } from '../helpers/jsdom-setup'
import {
  buildEvalPrelude,
  mergeEvalBindings,
  loadRuntimeModules,
} from '../../packages/vite-plugin-gea/tests/helpers/compile'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index'

const EXAMPLE_DIR = resolve(import.meta.dirname, '../../examples/configurator/src')

function readSource(name: string) {
  return readFileSync(resolve(EXAMPLE_DIR, name), 'utf-8')
}

async function compileSource(source: string, id: string, exportName: string, bindings: Record<string, unknown>) {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)

  let code: string
  if (result) {
    code = typeof result === 'string' ? result : result.code
  } else {
    code = source
  }

  const esbuild = await import('esbuild')
  const stripped = await esbuild.transform(code, { loader: 'ts', target: 'esnext' })
  code = stripped.code

  bindings = mergeEvalBindings(bindings)
  const compiledSource = `${buildEvalPrelude()}${code
    .replace(/^import .*;$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export default class\s+/, 'class ')
    .replace(/export default function\s+/, 'function ')
    .replace(/export default new\s+(\w+)\(\)/, 'return new $1()')
    .replace(/export\s*\{[^}]*\}/, '')}
return ${exportName};`

  return new Function(...Object.keys(bindings), compiledSource)(...Object.values(bindings))
}

async function buildConfigurator(seed: string) {
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

  const store = await compileSource(
    readSource('configurator-store.ts'),
    resolve(EXAMPLE_DIR, 'configurator-store.ts'),
    'store',
    { Store },
  )

  const OptionCard = await compileSource(
    readSource('option-card.tsx'),
    resolve(EXAMPLE_DIR, 'option-card.tsx'),
    'OptionCard',
    { Component },
  )

  const SummaryPanel = await compileSource(
    readSource('summary-panel.tsx'),
    resolve(EXAMPLE_DIR, 'summary-panel.tsx'),
    'SummaryPanel',
    { Component, store },
  )

  const App = await compileSource(readSource('app.tsx'), resolve(EXAMPLE_DIR, 'app.tsx'), 'App', {
    Component,
    store,
    OptionCard,
    SummaryPanel,
  })

  return { Component, Store, store, App, OptionCard, SummaryPanel }
}

function mountApp(App: any) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  return { root, app }
}

describe('Configurator', () => {
  let restoreDom: () => void
  let store: any
  let App: any

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `configurator-${Date.now()}-${Math.random()}`
    const built = await buildConfigurator(seed)
    store = built.store
    App = built.App
  })

  afterEach(() => {
    restoreDom()
  })

  describe('initial render', () => {
    it('renders all 8 category tabs with correct labels', async () => {
      const { root, app } = mountApp(App)

      const tabs = root.querySelectorAll('.cat-tab')
      assert.equal(tabs.length, 8)

      const labels = Array.from(tabs).map((t) => t.querySelector('.cat-label')?.textContent)
      assert.deepEqual(labels, [
        'Exterior Color',
        'Interior',
        'Wheels',
        'Powertrain',
        'Sound System',
        'Roof',
        'Driver Assistance',
        'Lighting',
      ])

      app.dispose()
    })

    it('shows Exterior Color heading and 7 option cards', async () => {
      const { root, app } = mountApp(App)

      assert.equal(root.querySelector('.options-heading')?.textContent, 'Exterior Color')

      const cards = root.querySelectorAll('.option-card')
      assert.equal(cards.length, 7)

      app.dispose()
    })

    it('marks only the first category tab as active', async () => {
      const { root, app } = mountApp(App)

      const tabs = root.querySelectorAll('.cat-tab')
      assert.ok(tabs[0].classList.contains('cat-tab--active'))
      for (let i = 1; i < tabs.length; i++) {
        assert.ok(!tabs[i].classList.contains('cat-tab--active'), `tab ${i} should not be active`)
      }

      app.dispose()
    })

    it('shows $52,000 base price in footer', async () => {
      const { root, app } = mountApp(App)

      assert.equal(root.querySelector('.footer-total-price')?.textContent, '$52,000')

      app.dispose()
    })

    it('selects Glacier White as default with checkmark', async () => {
      const { root, app } = mountApp(App)

      const selectedCards = root.querySelectorAll('.option-card--selected')
      assert.equal(selectedCards.length, 1)
      assert.equal(selectedCards[0].querySelector('.option-name')?.textContent, 'Glacier White')
      assert.equal(selectedCards[0].querySelector('.option-check')?.textContent, '✓')

      app.dispose()
    })

    it('shows color swatches for all exterior color options', async () => {
      const { root, app } = mountApp(App)

      const swatches = root.querySelectorAll('.option-swatch')
      assert.equal(swatches.length, 7)

      app.dispose()
    })

    it('shows "Included" for zero-price options', async () => {
      const { root, app } = mountApp(App)

      const firstCard = root.querySelector('.option-card')!
      const price = firstCard.querySelector('.option-price')
      assert.equal(price?.textContent, 'Included')
      assert.ok(price?.classList.contains('option-price--included'))

      app.dispose()
    })

    it('shows formatted price for non-zero options', async () => {
      const { root, app } = mountApp(App)

      const cards = root.querySelectorAll('.option-card')
      // Obsidian Black is $800
      const price = cards[1].querySelector('.option-price')
      assert.equal(price?.textContent, '+$800')
      assert.ok(!price?.classList.contains('option-price--included'))

      app.dispose()
    })

    it('shows summary panel with base configuration message', async () => {
      const { root, app } = mountApp(App)

      assert.equal(root.querySelector('.summary-empty')?.textContent, 'Base configuration — no extras selected')
      assert.equal(root.querySelectorAll('.summary-line').length, 0)
      assert.equal(root.querySelector('.summary-car-name')?.textContent, 'Meridian GT-e')
      assert.equal(root.querySelector('.summary-car-price')?.textContent, '$52,000')
      assert.equal(root.querySelector('.summary-total-price')?.textContent, '$52,000')

      app.dispose()
    })
  })

  describe('category switching via store.setCategory()', () => {
    it('switching to Interior updates the heading', async () => {
      const { root, app } = mountApp(App)

      store.setCategory('interior')
      await flushMicrotasks()

      assert.equal(root.querySelector('.options-heading')?.textContent, 'Interior')

      app.dispose()
    })

    it('switching to Interior shows 6 option cards', async () => {
      const { root, app } = mountApp(App)

      store.setCategory('interior')
      await flushMicrotasks()

      assert.equal(root.querySelectorAll('.option-card').length, 6)

      app.dispose()
    })

    it('switching to Wheels shows correct option names', async () => {
      const { root, app } = mountApp(App)

      store.setCategory('wheels')
      await flushMicrotasks()

      assert.equal(root.querySelector('.options-heading')?.textContent, 'Wheels')

      const names = Array.from(root.querySelectorAll('.option-card')).map(
        (c) => c.querySelector('.option-name')?.textContent,
      )
      assert.deepEqual(names, ['19″ Aero', '20″ Sport', '20″ Turbine', '21″ Performance', '21″ Carbon Fiber'])

      app.dispose()
    })

    it('switching to Wheels hides color swatches', async () => {
      const { root, app } = mountApp(App)

      store.setCategory('wheels')
      await flushMicrotasks()

      assert.equal(root.querySelectorAll('.option-swatch').length, 0)

      app.dispose()
    })

    it('cycles through all categories with correct headings and counts', async () => {
      const { root, app } = mountApp(App)

      const categories = [
        { id: 'color', name: 'Exterior Color', count: 7 },
        { id: 'interior', name: 'Interior', count: 6 },
        { id: 'wheels', name: 'Wheels', count: 5 },
        { id: 'powertrain', name: 'Powertrain', count: 4 },
        { id: 'sound', name: 'Sound System', count: 4 },
        { id: 'roof', name: 'Roof', count: 4 },
        { id: 'assist', name: 'Driver Assistance', count: 3 },
        { id: 'lighting', name: 'Lighting', count: 3 },
      ]

      for (const cat of categories) {
        store.setCategory(cat.id)
        await flushMicrotasks()

        assert.equal(root.querySelector('.options-heading')?.textContent, cat.name, `heading for ${cat.id}`)
        assert.equal(root.querySelectorAll('.option-card').length, cat.count, `card count for ${cat.id}`)
      }

      app.dispose()
    })

    it('switching categories preserves selections and reflects them in the DOM', async () => {
      const { root, app } = mountApp(App)

      // Select Obsidian Black in Exterior Color
      store.selectOption('color', 'obsidian-black')
      await flushMicrotasks()

      // Switch to Interior, then back to color
      store.setCategory('interior')
      await flushMicrotasks()
      store.setCategory('color')
      await flushMicrotasks()

      // Store state should be preserved
      assert.equal(store.selections['color'], 'obsidian-black')

      // DOM should show Obsidian Black as selected
      const selectedCard = root.querySelector('.option-card--selected .option-name')
      assert.equal(selectedCard?.textContent, 'Obsidian Black')

      app.dispose()
    })
  })

  describe('option selection and DOM updates', () => {
    it('clicking an option card selects it in the store', async () => {
      const { root, app } = mountApp(App)

      const cards = root.querySelectorAll('.option-card')
      // Click Obsidian Black (index 1)
      cards[1].dispatchEvent(new window.Event('click', { bubbles: true }))
      await flushMicrotasks()

      assert.equal(store.selections['color'], 'obsidian-black')

      app.dispose()
    })

    it('clicking an option updates the option card selected class', async () => {
      const { root, app } = mountApp(App)

      const cards = root.querySelectorAll('.option-card')
      // Click Obsidian Black (index 1)
      cards[1].dispatchEvent(new window.Event('click', { bubbles: true }))
      await flushMicrotasks()

      assert.ok(!cards[0].classList.contains('option-card--selected'), 'Glacier White deselected')
      assert.ok(cards[1].classList.contains('option-card--selected'), 'Obsidian Black selected')

      app.dispose()
    })

    it('clicking an option moves the checkmark', async () => {
      const { root, app } = mountApp(App)

      const cards = root.querySelectorAll('.option-card')
      cards[1].dispatchEvent(new window.Event('click', { bubbles: true }))
      await flushMicrotasks()

      // Old selection should lose checkmark, new should gain it
      assert.equal(cards[0].querySelector('.option-check'), null)
      assert.equal(cards[1].querySelector('.option-check')?.textContent, '✓')

      app.dispose()
    })

    it('selecting a priced option updates the footer total price', async () => {
      const { root, app } = mountApp(App)

      // Select Crimson Red ($1,200)
      store.selectOption('color', 'crimson-red')
      await flushMicrotasks()

      assert.equal(root.querySelector('.footer-total-price')?.textContent, '$53,200')

      app.dispose()
    })

    it('selecting options across categories accumulates in the footer price', async () => {
      const { root, app } = mountApp(App)

      store.selectOption('color', 'crimson-red') // +$1,200
      store.selectOption('interior', 'ivory-leather') // +$2,200
      store.selectOption('wheels', '21-perf') // +$2,400
      await flushMicrotasks()

      // $52,000 + $1,200 + $2,200 + $2,400 = $57,800
      assert.equal(root.querySelector('.footer-total-price')?.textContent, '$57,800')

      app.dispose()
    })
  })

  describe('summary panel reactivity', () => {
    it('selecting a non-default option shows an upgrade line', async () => {
      const { root, app } = mountApp(App)

      const cards = root.querySelectorAll('.option-card')
      // Click Obsidian Black ($800)
      cards[1].dispatchEvent(new window.Event('click', { bubbles: true }))
      await flushMicrotasks()

      const summaryLines = root.querySelectorAll('.summary-line')
      assert.equal(summaryLines.length, 1)
      assert.equal(summaryLines[0].querySelector('.summary-line-cat')?.textContent, 'Exterior Color')
      assert.equal(summaryLines[0].querySelector('.summary-line-opt')?.textContent, 'Obsidian Black')
      assert.equal(summaryLines[0].querySelector('.summary-line-price')?.textContent, '+$800')

      // Empty message should be gone
      assert.equal(root.querySelector('.summary-empty'), null)

      app.dispose()
    })

    it('summary total price updates when an option is selected', async () => {
      const { root, app } = mountApp(App)

      assert.equal(root.querySelector('.summary-total-price')?.textContent, '$52,000')

      // Click Sunrise Gold ($2,500)
      const cards = root.querySelectorAll('.option-card')
      cards[6].dispatchEvent(new window.Event('click', { bubbles: true }))
      await flushMicrotasks()

      assert.equal(root.querySelector('.summary-total-price')?.textContent, '$54,500')

      app.dispose()
    })

    it('selecting multiple upgrades shows all summary lines', async () => {
      const { root, app } = mountApp(App)

      store.selectOption('color', 'obsidian-black') // +$800
      store.selectOption('interior', 'ivory-leather') // +$2,200
      await flushMicrotasks()

      const summaryLines = root.querySelectorAll('.summary-line')
      assert.equal(summaryLines.length, 2)

      const cats = Array.from(summaryLines).map((l) => l.querySelector('.summary-line-cat')?.textContent)
      assert.deepEqual(cats, ['Exterior Color', 'Interior'])

      app.dispose()
    })

    it('reverting to default option removes summary line and shows empty message', async () => {
      const { root, app } = mountApp(App)

      // Select upgrade, then revert
      store.selectOption('color', 'obsidian-black')
      await flushMicrotasks()
      assert.equal(root.querySelectorAll('.summary-line').length, 1)

      store.selectOption('color', 'glacier-white')
      await flushMicrotasks()
      assert.equal(root.querySelectorAll('.summary-line').length, 0)
      assert.ok(root.querySelector('.summary-empty'), 'empty message should reappear')

      app.dispose()
    })
  })
})
