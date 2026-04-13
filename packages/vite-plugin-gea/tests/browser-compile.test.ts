import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { flushMicrotasks, installDom } from '../../../tests/helpers/jsdom-setup'
import { compileForBrowser } from '../src/browser.ts'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TEST_DIR, '../../..')

function rewriteImports(
  code: string,
  modulePathMap: Record<string, string>,
  coreUrl: string,
  compilerRuntimeUrl: string,
): string {
  return code
    .replace(/from\s+['"]virtual:gea-compiler-runtime['"]/g, `from '${compilerRuntimeUrl}'`)
    .replace(/from\s+['"]@geajs\/core\/compiler-runtime['"]/g, `from '${compilerRuntimeUrl}'`)
    .replace(/from\s+['"]@geajs\/core['"]/g, `from '${coreUrl}'`)
    .replace(/from\s+['"](\.[^'"]+)['"]/g, (match, importPath) => {
      const normalized = importPath.replace(/^\.\//, '')
      const candidates = [normalized, `${normalized}.ts`, `${normalized}.tsx`, `${normalized}.js`, `${normalized}.jsx`]
      for (const candidate of candidates) {
        const resolved = modulePathMap[candidate]
        if (resolved) {
          return `from '${pathToFileURL(resolved).href}'`
        }
      }
      return match
    })
}

describe('compileForBrowser', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('produces browser-runnable modules with automatic DOM reactivity', async () => {
    const root = document.createElement('div')
    root.id = 'app'
    document.body.appendChild(root)

    const files = {
      'store.ts': `
        import { Store } from '@geajs/core'

        class CounterStore extends Store {
          count = 0

          inc() {
            this.count++
          }
        }

        export const store = new CounterStore()
      `,
      'App.tsx': `
        import { Component } from '@geajs/core'
        import { store } from './store'

        export default class App extends Component {
          template() {
            return <button class="counter-btn" onClick={() => store.inc()}>Count: {store.count}</button>
          }
        }
      `,
      'main.ts': `
        import App from './App'

        new App().render(document.getElementById('app'))
      `,
    }

    const { compiledModules, errors } = compileForBrowser(files)
    assert.deepEqual(errors, [])

    const moduleDir = mkdtempSync(path.join(tmpdir(), 'gea-browser-compile-'))
    const fileOrder = ['store.ts', 'App.tsx', 'main.ts']
    const modulePathMap: Record<string, string> = {}
    for (const filename of fileOrder) {
      const outPath = path.join(moduleDir, filename.replace(/\.[^.]+$/, '.mjs'))
      mkdirSync(path.dirname(outPath), { recursive: true })
      modulePathMap[filename] = outPath
    }

    const coreUrl = pathToFileURL(path.join(REPO_ROOT, 'packages/gea/src/index.ts')).href
    const compilerRuntimeUrl = pathToFileURL(path.join(REPO_ROOT, 'packages/gea/src/compiler-runtime.ts')).href
    for (const filename of fileOrder) {
      const rewritten = rewriteImports(compiledModules[filename]!, modulePathMap, coreUrl, compilerRuntimeUrl)
      writeFileSync(modulePathMap[filename], rewritten, 'utf8')
    }

    try {
      await import(pathToFileURL(modulePathMap['main.ts']).href)
      const storeModule = await import(pathToFileURL(modulePathMap['store.ts']).href)

      assert.equal(root.querySelector('.counter-btn')?.textContent?.trim(), 'Count: 0')

      storeModule.store.inc()
      await flushMicrotasks()
      assert.equal(root.querySelector('.counter-btn')?.textContent?.trim(), 'Count: 1')

      root.querySelector('.counter-btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushMicrotasks()
      assert.equal(root.querySelector('.counter-btn')?.textContent?.trim(), 'Count: 2')
    } finally {
      rmSync(moduleDir, { recursive: true, force: true })
    }
  })
})
