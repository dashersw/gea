/**
 * Unit tests for Element Caching in ZagComponent.
 * Verifies that DOM queries are memoized and correctly invalidated.
 */

import { GEA_MAPS, GEA_SYNC_MAP, GEA_UPDATE_PROPS } from '@geajs/core'
import { transformSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Setup ────────────────────────────────────────────────────────────────

const dom = new JSDOM('<!doctype html><html><body><div id="root"><span data-part="item"></span></div></body></html>')
const { window } = dom
const { document, HTMLElement, Node } = window

Object.assign(globalThis, { window, document, HTMLElement, Node })

function transpileTs(source: string): string {
  const result = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    target: 'esnext',
  })
  return result.code
}

async function loadZagComponent() {
  const src = await readFile(resolve(__dirname, '../src/primitives/zag-component.ts'), 'utf-8')
  // Mock Component base class
  class MockComponent {
    get rendered() {
      return true
    }
    _cacheArrayContainers() {}
    [GEA_SYNC_MAP]() {}
    dispose() {}
  }

  const js = transpileTs(src)
    .replace(/^import\b.*$/gm, '')
    .replace(/extends\s+Component/, 'extends MockComponent')
    .replace(/^export\s+default\s+class\s+/, 'class ')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '')

  const fn = new Function(
    'MockComponent',
    'VanillaMachine',
    'normalizeProps',
    'spreadProps',
    'GEA_MAPS',
    'GEA_SYNC_MAP',
    'GEA_UPDATE_PROPS',
    `${js}\nreturn ZagComponent;`,
  )
  return fn(
    MockComponent,
    {},
    () => ({}),
    () => () => ({}),
    GEA_MAPS,
    GEA_SYNC_MAP,
    GEA_UPDATE_PROPS,
  )
}

// ── Tests ────────────────────────────────────────────────────────────────
test('ZagComponent: should cache element queries and handle invalidation', async () => {
  const ZagComponent = await loadZagComponent()
  const instance = new ZagComponent()

  // 1. Setup & Initial State
  let queryCount = 0
  instance.created({})
  instance._api = {}
  instance.getSpreadMap = () => ({
    '[data-part="item"]': () => ({}),
  })
  instance.el = document.getElementById('root')

  // Mocking the query method to track hits
  instance._queryAllIncludingSelf = (selector: string) => {
    queryCount++
    return Array.from(document.querySelectorAll(selector))
  }

  // --- 2. Test Execution ---

  // Run 1: Cache MISS
  instance._applyAllSpreads()
  assert.strictEqual(queryCount, 1, 'Should query DOM on first run (Cache MISS)')

  // Run 2: Cache HIT
  instance._applyAllSpreads()
  assert.strictEqual(queryCount, 1, 'Should NOT query DOM on second run (Cache HIT)')

  // Run 3: Invalidation via [GEA_SYNC_MAP]
  instance[GEA_SYNC_MAP](0)
  instance._applyAllSpreads()
  assert.strictEqual(queryCount, 2, 'Should re-query after __geaSyncMap clears cache')

  // Run 4: Invalidation via onAfterRender
  instance.onAfterRender()
  instance._applyAllSpreads()
  assert.strictEqual(queryCount, 3, 'Should re-query after onAfterRender clears cache')

  // Run 5: Transition Persistence (Machine Transition)
  // Logic: Scheduling should NOT clear cache anymore. State-only transitions should be fast.
  instance._spreadScheduled = false
  instance._scheduleSpreadApplication()
  await Promise.resolve()
  assert.strictEqual(queryCount, 3, 'Should HIT cache during machine transition (NO re-query)')

  // Run 6: Structural Change Invalidation (Re-render)
  // Simulate a re-render that might have added elements
  const newThumb = document.createElement('span')
  newThumb.setAttribute('data-part', 'item')
  instance.el.appendChild(newThumb)

  instance.onAfterRender()
  instance._applyAllSpreads()
  assert.strictEqual(queryCount, 4, 'Should re-query after onAfterRender clears cache')

  const cachedElements = instance._elementCache.get('[data-part="item"]')
  assert.strictEqual(cachedElements.length, 2, 'Should find the newly added element after invalidation')

  // Run 6: Memory Leak Check (Dispose)
  instance.dispose()
  assert.strictEqual(instance._elementCache.size, 0, 'Should clear element cache on dispose')
  assert.strictEqual(instance._zagIdMap.size, 0, 'Should clear zag ID map on dispose')
})
