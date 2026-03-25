/**
 * Unit tests for Element Caching in ZagComponent.
 * Verifies that DOM queries are memoized and correctly invalidated.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

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
    rendered_ = true
    _cacheArrayContainers() {}
    __geaSyncMap() {}
    dispose() {}
  }
  
  const js = transpileTs(src)
    .replace(/^import\b.*$/gm, '')
    .replace(/extends\s+Component/, 'extends MockComponent')
    .replace(/^export\s+default\s+class\s+/, 'class ')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '')
    
  const fn = new Function('MockComponent', 'VanillaMachine', 'normalizeProps', 'spreadProps', `${js}\nreturn ZagComponent;`)
  return fn(MockComponent, {}, () => ({}), () => ({}))
}

// ── Tests ────────────────────────────────────────────────────────────────

test('ZagComponent: should cache element queries', async () => {
  const ZagComponent = await loadZagComponent()
  const instance = new ZagComponent()
  
  // Call created to initialize _elementCache and other locals
  instance.created({})
  
  // Minimal setup for the instance
  instance._api = {}
  instance.getSpreadMap = () => ({
    '[data-part="item"]': () => ({})
  })
  instance.el = document.getElementById('root')
  instance._queryAllIncludingSelf = (selector: string) => {
    queryCount++
    return Array.from(document.querySelectorAll(selector))
  }

  let queryCount = 0

  // 1. First run: should be a Cache MISS (calls queryCount++)
  instance._applyAllSpreads()
  assert.strictEqual(queryCount, 1, 'Should query DOM on first run')

  // 2. Second run: should be a Cache HIT (no queryCount++)
  instance._applyAllSpreads()
  assert.strictEqual(queryCount, 1, 'Should NOT query DOM on second run (cache hit)')

  // 3. Clear cache via __geaSyncMap
  instance.__geaSyncMap(0)
  instance._applyAllSpreads()
  assert.strictEqual(queryCount, 2, 'Should query DOM again after cache is cleared via __geaSyncMap')

  // 4. Clear cache via onAfterRender
  instance.onAfterRender() // Calls clear() internally
  assert.strictEqual(queryCount, 3, 'Should query DOM again after cache is cleared via onAfterRender')
})
