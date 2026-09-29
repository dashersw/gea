import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { createDisposer } from '../../../gea/src/runtime/disposer'
import { compileJsxComponent, loadRuntimeModules, transformGeaSourceToEvalBody } from '../helpers/compile'

// Regression for https://github.com/dashersw/gea/issues/108: every local
// declared before `return` in a function component was inlined as its
// initializer at each use. `let count = 0` + `count++` became `0++`, and
// `const store = new CounterStore()` built a fresh store on every read.
describe('function component locals (#108)', { concurrency: false }, () => {
  const counterStoreSource = `
    import { Store } from '@geajs/core'

    class CounterStore extends Store {
      count = 0
      constructor() {
        super()
        created.push(this)
      }
    }
  `

  it('creates a store declared in a standalone component once and updates on click', async () => {
    const restore = installDom()
    const d = createDisposer()
    try {
      const [, { Store }] = await loadRuntimeModules(`fn-local-store-${Date.now()}`)
      const created: unknown[] = []
      const Counter = await compileJsxComponent(
        `${counterStoreSource}
        export default function Counter() {
          const store = new CounterStore()
          return <button onClick={() => store.count++}>Count: {store.count}</button>
        }
      `,
        '/virtual/Counter.tsx',
        'Counter',
        { Store, created },
      )

      const button = Counter({}, d) as HTMLButtonElement
      document.body.appendChild(button)
      await flushMicrotasks()
      assert.equal(button.textContent, 'Count: 0')

      button.click()
      await flushMicrotasks()
      button.click()
      await flushMicrotasks()
      assert.equal(button.textContent, 'Count: 2')
      assert.equal(created.length, 1, 'one store per component instance')
    } finally {
      d.dispose()
      restore()
    }
  })

  it('gives each same-file component instance its own store', async () => {
    const restore = installDom()
    let view: any
    try {
      const [{ default: Component }, { Store }] = await loadRuntimeModules(`fn-local-store-same-file-${Date.now()}`)
      const created: unknown[] = []
      const App = await compileJsxComponent(
        `${counterStoreSource}
        import { Component } from '@geajs/core'

        function Counter() {
          const store = new CounterStore()
          const count = store.count
          return <button onClick={() => store.count++}>Count: {count}</button>
        }

        export default class App extends Component {
          template() {
            return (
              <div>
                <Counter />
                <Counter />
              </div>
            )
          }
        }
      `,
        '/virtual/CounterApp.tsx',
        'App',
        { Component, Store, created },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      view = new App()
      view.render(root)
      await flushMicrotasks()

      const [first, second] = Array.from(root.querySelectorAll('button'))
      first.click()
      await flushMicrotasks()
      first.click()
      await flushMicrotasks()
      second.click()
      await flushMicrotasks()
      assert.equal(first.textContent, 'Count: 2')
      assert.equal(second.textContent, 'Count: 1')
      assert.equal(created.length, 2, 'one store per component instance')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('keeps locals derived from props live, including a let that is never reassigned', async () => {
    const restore = installDom()
    let view: any
    try {
      const [{ default: Component }] = await loadRuntimeModules(`fn-local-derived-${Date.now()}`)
      const App = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'

        function Label({ text }) {
          const upper = text.trim().toUpperCase()
          let suffix = text.length > 3 ? '!' : '?'
          return <span>{upper}{suffix}</span>
        }

        export default class App extends Component {
          text = 'hi'
          template() {
            return <div><Label text={this.text} /></div>
          }
        }
      `,
        '/virtual/LabelApp.tsx',
        'App',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      view = new App()
      view.render(root)
      await flushMicrotasks()
      assert.equal(root.querySelector('span')!.textContent, 'HI?')

      view.text = ' hello '
      await flushMicrotasks()
      assert.equal(root.querySelector('span')!.textContent, 'HELLO!')
    } finally {
      view?.dispose()
      restore()
    }
  })

  for (const [label, body, jsx] of [
    ['an update in a handler', 'let count = 0', '<button onClick={() => count++}>Count: {count}</button>'],
    ['an assignment in a handler', 'let count = 0', '<button onClick={() => (count = 1)}>Count: {count}</button>'],
    ['an assignment before return', 'let count = 0\n          count += 1', '<span>{count}</span>'],
  ] as const) {
    it(`fails the build for a let reassigned by ${label}`, async () => {
      await assert.rejects(
        transformGeaSourceToEvalBody(
          `
        export default function Counter() {
          ${body}
          return ${jsx}
        }
      `,
          '/virtual/LetCounter.tsx',
        ),
        (error: any) => {
          assert.equal(error.__geaCompileError, true)
          assert.match(error.message, /`count`/)
          assert.match(error.message, /Counter/)
          assert.match(error.message, /Store or a class component/)
          assert.equal(typeof error.loc?.line, 'number')
          return true
        },
      )
    })
  }
})
