import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponentForHmr } from '../helpers/compile'
import { HMR_RUNTIME_SOURCE } from '../../src/virtual-modules.ts'
import { mount } from '../../../gea/src/runtime/mount'
import { createDisposer } from '../../../gea/src/runtime/disposer'
import { Store, isClassConstructorValue } from '../../../gea/src/store'

// The shipped `virtual:gea-hmr` module, evaluated as-is (no Vite: import.meta.hot is undefined).
const hmrRuntime = await import(`data:text/javascript,${encodeURIComponent(HMR_RUNTIME_SOURCE)}`)

let urlSeq = 0
const uniqueUrl = (name: string) => `file:///virtual/hmr-proxy-mount/${++urlSeq}/${name}.tsx`

describe('HMR: proxied components mount through runtime mount() (#112)', { concurrency: false }, () => {
  let restoreDom: () => void
  let prevHot: unknown
  let tempDir: string

  beforeEach(() => {
    restoreDom = installDom()
    tempDir = mkdtempSync(join(tmpdir(), 'gea-hmr-proxy-mount-'))
    prevHot = (globalThis as any).__geaHmrTestHot
    ;(globalThis as any).__geaHmrTestHot = {
      accept() {
        /* test harness no-op */
      },
      invalidate() {
        throw new Error('HMR invalidated unexpectedly')
      },
    }
  })

  afterEach(() => {
    if (prevHot === undefined) delete (globalThis as any).__geaHmrTestHot
    else (globalThis as any).__geaHmrTestHot = prevHot
    rmSync(tempDir, { recursive: true, force: true })
    restoreDom()
  })

  class PlainClass {
    el: Element | null = null
    rendered = false
    props: any
    render(parent: Node) {
      this.el = document.createElement('b')
      this.el.textContent = 'class'
      parent.appendChild(this.el)
      this.rendered = true
    }
    dispose() {
      this.el?.remove()
    }
  }
  function plainFunction() {
    const el = document.createElement('i')
    el.textContent = 'function'
    return el
  }
  const plainArrow = () => {
    const el = document.createElement('u')
    el.textContent = 'arrow'
    return el
  }

  for (const [kind, Comp, tag] of [
    ['class', PlainClass, 'b'],
    ['function', plainFunction, 'i'],
    ['arrow', plainArrow, 'u'],
  ] as const) {
    it(`mounts a proxied ${kind} component`, () => {
      const proxy = hmrRuntime.createHotComponentProxy(uniqueUrl(kind), Comp)
      const parent = document.createElement('div')
      const d = createDisposer()
      mount(proxy, parent, {}, d)
      assert.equal(parent.querySelector(tag)?.textContent, kind)
      d.dispose()
    })

    it(`keeps proxy invariants for a proxied ${kind} component`, () => {
      const proxy = hmrRuntime.createHotComponentProxy(uniqueUrl(kind), Comp)
      const keys = Reflect.ownKeys(proxy)
      assert.ok(keys.includes('prototype'), 'the target’s non-configurable prototype must be listed')
      for (const key of keys) Object.getOwnPropertyDescriptor(proxy, key)
      assert.equal('prototype' in proxy, true)
      assert.equal(proxy.prototype, (Comp as any).prototype)
      assert.equal(Object.getOwnPropertyDescriptor(proxy, 'prototype')?.value, (Comp as any).prototype)
      assert.equal(Object.getOwnPropertyDescriptor(proxy, 'name')?.value, Comp.name)
    })
  }

  it('still treats a proxied class as a class when a store getter returns it', () => {
    const proxy = hmrRuntime.createHotComponentProxy(uniqueUrl('page'), PlainClass)
    const fnProxy = hmrRuntime.createHotComponentProxy(uniqueUrl('fn'), plainFunction)
    assert.equal(isClassConstructorValue(proxy), true)
    assert.equal(isClassConstructorValue(fnProxy), false)

    class Pages extends Store {
      get page() {
        return proxy
      }
    }
    // Router.page is a getter like this one; binding the class would break identity and `new`.
    assert.equal(new Pages().page, proxy)
  })

  async function compileFile(name: string, source: string, bindings: Record<string, unknown> = {}) {
    const path = join(tempDir, `${name}.tsx`)
    writeFileSync(path, source)
    const url = pathToFileURL(path).href
    return { url, Comp: await compileJsxComponentForHmr(source, path, url, name, bindings, hmrRuntime) }
  }

  it('renders an imported class component inside a function component', async () => {
    const button = await compileFile(
      'Button',
      `import { Component } from '@geajs/core'
      export default class Button extends Component {
        template({ children }: any) {
          return <button class="btn">{children}</button>
        }
      }`,
    )
    const toolbar = await compileFile(
      'Toolbar',
      `import Button from './Button'
      export default function Toolbar() {
        return (
          <div class="toolbar">
            <Button>Save</Button>
          </div>
        )
      }`,
      { __hmr_Button: button.Comp },
    )
    const app = await compileFile(
      'App',
      `import { Component } from '@geajs/core'
      import Toolbar from './Toolbar'
      export default class App extends Component {
        template() {
          return <main><Toolbar /></main>
        }
      }`,
      { __hmr_Toolbar: toolbar.Comp },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new app.Comp()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.toolbar > button.btn')?.textContent, 'Save')
    view.dispose()
  })

  it('renders a class component held in a variable', async () => {
    const check = await compileFile(
      'Check',
      `import { Component } from '@geajs/core'
      export default class Check extends Component {
        template() { return <span class="check">done</span> }
      }`,
    )
    const spinner = await compileFile(
      'Spinner',
      `import { Component } from '@geajs/core'
      export default class Spinner extends Component {
        template() { return <span class="spinner">loading</span> }
      }`,
    )
    const app = await compileFile(
      'App',
      `import { Component } from '@geajs/core'
      import Check from './Check'
      import Spinner from './Spinner'
      export default class App extends Component {
        done = false
        template() {
          const Icon = this.done ? Check : Spinner
          return (
            <div class="page">
              <Icon />
            </div>
          )
        }
      }`,
      { __hmr_Check: check.Comp, __hmr_Spinner: spinner.Comp },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new app.Comp()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.page > .spinner')?.textContent, 'loading')
    view.dispose()
  })
})
