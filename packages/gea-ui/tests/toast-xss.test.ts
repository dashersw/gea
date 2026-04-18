import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Setup ────────────────────────────────────────────────────────────────

function transpileSource(source: string): string {
  const result = transformSync(source, {
    loader: 'tsx',
    format: 'esm',
    target: 'esnext',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  })
  return result.code
}

async function loadToaster() {
  const src = await readFile(resolve(__dirname, '../src/components/toast.tsx'), 'utf-8')
  
  // Mock dependencies
  class MockComponent {
    __geaRequestRender() {}
    render() {}
  }
  
  // Minimal h function for JSX rendering to string for testing
  const h = (tag: string, props: any, ...children: any[]) => {
    let s = `<${tag}`
    if (props) {
      for (const key in props) {
        if (key === 'key') continue
        s += ` ${key}="${props[key]}"`
      }
    }
    s += '>'
    children.flat().forEach(child => {
      if (child) s += String(child)
    })
    s += `</${tag}>`
    return s
  }

  const js = transpileSource(src)
    .replace(/^import\b.*$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replace(/extends\s+Component/, 'extends MockComponent')
    .replace(/^export\s+(default\s+)?class\s+/, 'class ')
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, '')
    
  // We need to provide the mocks to the function scope
  const fn = new Function('MockComponent', 'h', 'Fragment', 'toast', 'VanillaMachine', 'normalizeProps', 'spreadProps', `${js}\nreturn Toaster;`)
  
  // Mock toast/zag modules
  const mockToast = {
    group: { machine: {}, connect: () => ({ getToasts: () => [] }) },
    createStore: () => ({})
  }
  const mockZagVanilla = {
    VanillaMachine: class { start() {}; subscribe() {}; service = {} },
    normalizeProps: (p: any) => p,
    spreadProps: () => {}
  }

  return fn(
    MockComponent, 
    h, 
    null, 
    mockToast, 
    mockZagVanilla.VanillaMachine, 
    mockZagVanilla.normalizeProps, 
    mockZagVanilla.spreadProps
  )
}

// ── Tests ────────────────────────────────────────────────────────────────

test('Toast: template prevents XSS via description (Native Refactor)', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window as any
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement

  const Toaster = await loadToaster()
  const toaster = new Toaster()
  
  const maliciousPayload = "<img src=x onerror='alert(\"XSS_FAIL\")'>"
  const toastData = {
    id: 'test-toast',
    title: 'Safe Title',
    description: maliciousPayload
  }

  // Set internal state
  toaster._currentToasts = [toastData]

  // Check template output
  const html = toaster.template({})
  
  // Verify that the malicious payload is ESCAPED
  assert.ok(!html.includes(maliciousPayload), 'Malicious payload should NOT be present as raw HTML')
  assert.ok(html.includes('&lt;img'), 'Malicious tag should be escaped to &lt;img')
  assert.ok(html.includes('onerror=&#39;alert(&quot;XSS_FAIL&quot;)&#39;'), 'Attributes should also be escaped')

  // Cleanup
  dom.window.close()
  delete (globalThis as any).window
  delete (globalThis as any).document
  delete (globalThis as any).HTMLElement
})
