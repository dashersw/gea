import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../helpers/jsdom-setup'
import {
  buildEvalPrelude,
  mergeEvalBindings,
  loadRuntimeModules,
} from '../../packages/vite-plugin-gea/tests/helpers/compile'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index'

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

function mountApp(App: any) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  return { root, app }
}

describe('Object-style class attribute', () => {
  let restoreDom: () => void
  let Component: any
  let Store: any

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `object-class-${Date.now()}-${Math.random()}`
    const [componentMod, storeMod] = await loadRuntimeModules(seed)
    Component = componentMod.default
    Store = storeMod.Store
  })

  afterEach(() => {
    restoreDom()
  })

  describe('static object class', () => {
    it('renders truthy keys as class names', async () => {
      const App = await compileSource(
        `import { Component } from '@geajs/core'
export default class App extends Component {
  template() {
    return <div class={{ foo: true, bar: true, baz: false }}>hello</div>
  }
}`,
        '/test/app.tsx',
        'App',
        { Component },
      )

      const { root, app } = mountApp(App)
      const div = root.querySelector('div')!
      assert.ok(div.classList.contains('foo'), 'should have class foo')
      assert.ok(div.classList.contains('bar'), 'should have class bar')
      assert.ok(!div.classList.contains('baz'), 'should not have class baz')
      app.dispose()
    })

    it('renders empty class when all values are false', async () => {
      const App = await compileSource(
        `import { Component } from '@geajs/core'
export default class App extends Component {
  template() {
    return <div class={{ foo: false, bar: false }}>hello</div>
  }
}`,
        '/test/app.tsx',
        'App',
        { Component },
      )

      const { root, app } = mountApp(App)
      const div = root.querySelector('div')!
      assert.ok(!div.classList.contains('foo'))
      assert.ok(!div.classList.contains('bar'))
      app.dispose()
    })
  })

  describe('dynamic object class with store', () => {
    it('renders classes based on store state', async () => {
      const store = await compileSource(
        `import { Store } from '@geajs/core'
class AppStore extends Store {
  active = true
  highlighted = false
}
export default new AppStore()`,
        '/test/store.ts',
        'store',
        { Store },
      )

      const App = await compileSource(
        `import { Component } from '@geajs/core'
import store from './store'
export default class App extends Component {
  template() {
    return <div class={{ item: true, active: store.active, highlighted: store.highlighted }}>hello</div>
  }
}`,
        '/test/app.tsx',
        'App',
        { Component, store },
      )

      const { root, app } = mountApp(App)
      const div = root.querySelector('div')!
      assert.ok(div.classList.contains('item'), 'should have class item')
      assert.ok(div.classList.contains('active'), 'should have class active')
      assert.ok(!div.classList.contains('highlighted'), 'should not have class highlighted')
      app.dispose()
    })

    it('updates classes reactively when store changes', async () => {
      const store = await compileSource(
        `import { Store } from '@geajs/core'
class AppStore extends Store {
  active = true
  highlighted = false
}
export default new AppStore()`,
        '/test/store.ts',
        'store',
        { Store },
      )

      const App = await compileSource(
        `import { Component } from '@geajs/core'
import store from './store'
export default class App extends Component {
  template() {
    return <div class={{ item: true, active: store.active, highlighted: store.highlighted }}>hello</div>
  }
}`,
        '/test/app.tsx',
        'App',
        { Component, store },
      )

      const { root, app } = mountApp(App)
      const div = root.querySelector('div')!

      // Initial state
      assert.ok(div.classList.contains('active'))
      assert.ok(!div.classList.contains('highlighted'))

      // Toggle store values
      store.active = false
      store.highlighted = true
      await flushMicrotasks()

      assert.ok(!div.classList.contains('active'), 'active should be removed')
      assert.ok(div.classList.contains('highlighted'), 'highlighted should be added')
      assert.ok(div.classList.contains('item'), 'static class should remain')

      app.dispose()
    })
  })

  describe('object class with string-literal keys', () => {
    it('handles hyphenated class names', async () => {
      const store = await compileSource(
        `import { Store } from '@geajs/core'
class AppStore extends Store {
  isWinning = true
  gameOver = false
}
export default new AppStore()`,
        '/test/store.ts',
        'store',
        { Store },
      )

      const App = await compileSource(
        `import { Component } from '@geajs/core'
import store from './store'
export default class App extends Component {
  template() {
    return (
      <button class={{
        cell: true,
        'cell-winning': store.isWinning,
        'cell-playable': !store.gameOver,
      }}>X</button>
    )
  }
}`,
        '/test/app.tsx',
        'App',
        { Component, store },
      )

      const { root, app } = mountApp(App)
      const btn = root.querySelector('button')!
      assert.ok(btn.classList.contains('cell'))
      assert.ok(btn.classList.contains('cell-winning'))
      assert.ok(btn.classList.contains('cell-playable'))

      store.isWinning = false
      store.gameOver = true
      await flushMicrotasks()

      assert.ok(btn.classList.contains('cell'), 'static class should remain')
      assert.ok(!btn.classList.contains('cell-winning'), 'cell-winning should be removed')
      assert.ok(!btn.classList.contains('cell-playable'), 'cell-playable should be removed')

      app.dispose()
    })
  })

  describe('object class in functional components', () => {
    it('renders object class on functional component elements', async () => {
      const Badge = await compileSource(
        `import { Component } from '@geajs/core'
export default function Badge({ active }: { active: boolean }) {
  return <span class={{ badge: true, 'badge-active': active }}>!</span>
}`,
        '/test/badge.tsx',
        'Badge',
        { Component },
      )

      const App = await compileSource(
        `import { Component } from '@geajs/core'
import Badge from './badge'
export default class App extends Component {
  template() {
    return <div><Badge active={true} /></div>
  }
}`,
        '/test/app.tsx',
        'App',
        { Component, Badge },
      )

      const { root, app } = mountApp(App)
      const span = root.querySelector('span')!
      assert.ok(span.classList.contains('badge'))
      assert.ok(span.classList.contains('badge-active'))
      app.dispose()
    })
  })
})
