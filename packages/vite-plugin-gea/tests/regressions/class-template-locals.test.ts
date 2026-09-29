import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules, transformGeaSourceToEvalBody } from '../helpers/compile'

// Regression for https://github.com/dashersw/gea/issues/139: a class
// `template()` inlined every local declared before `return` as its
// initializer at each use, the class version of #108. `const store = new
// CounterStore()` built a fresh store on every read and click, and `let count
// = 0` + `count++` became `0++`, so the file was served uncompiled.
describe('class template() locals (#139)', { concurrency: false }, () => {
  const counterStoreSource = `
    import { Component, Store } from '@geajs/core'

    class CounterStore extends Store {
      count = 0
      constructor() {
        super()
        created.push(this)
      }
    }
  `

  async function renderApp(counterSource: string, appTemplate: string) {
    const [{ default: Component }, { Store }] = await loadRuntimeModules(`class-template-locals-${Date.now()}`)
    const created: unknown[] = []
    const Counter = await compileJsxComponent(counterSource, '/virtual/Counter.tsx', 'Counter', {
      Component,
      Store,
      created,
    })
    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Counter from './Counter'

        export default class App extends Component {
          label = 'counter'
          template() {
            return <div data-label={this.label}>${appTemplate}</div>
          }
        }
      `,
      '/virtual/App.tsx',
      'App',
      { Component, Counter },
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new App()
    view.render(root)
    await flushMicrotasks()
    return { root, view, created }
  }

  async function click(button: HTMLButtonElement, times = 1) {
    for (let i = 0; i < times; i++) {
      button.click()
      await flushMicrotasks()
    }
  }

  for (const [label, template] of [
    [
      'a component without this',
      `const store = new CounterStore()
          return <button onClick={() => store.count++}>Count: {store.count}</button>`,
    ],
    [
      'a component that reads props',
      `const store = new CounterStore()
          return <button onClick={() => store.count++}>{this.props.label}: {store.count}</button>`,
    ],
    [
      'a local derived from the store',
      `const store = new CounterStore()
          const count = store.count
          return <button onClick={() => store.count++}>Count: {count}</button>`,
    ],
  ] as const) {
    it(`creates a store once per instance and updates on click in ${label}`, async () => {
      const restore = installDom()
      let view: any
      try {
        const app = await renderApp(
          `${counterStoreSource}
          export default class Counter extends Component {
            template() {
              ${template}
            }
          }
          `,
          '<Counter label="Count" /><Counter label="Count" />',
        )
        view = app.view
        const [first, second] = Array.from(app.root.querySelectorAll('button'))
        assert.equal(first.textContent, 'Count: 0')

        await click(first, 2)
        await click(second)
        assert.equal(first.textContent, 'Count: 2')
        assert.equal(second.textContent, 'Count: 1')
        assert.equal(app.created.length, 2, 'one store per component instance')
      } finally {
        view?.dispose()
        restore()
      }
    })
  }

  it('keeps a destructured constructor result as a real local', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        `${counterStoreSource}
        export default class Counter extends Component {
          template() {
            const { count } = new CounterStore()
            return <span title={String(count)}>{count}</span>
          }
        }
        `,
        '<Counter />',
      )
      view = app.view
      assert.equal(app.root.querySelector('span')!.outerHTML, '<span title="0">0</span>')
      assert.equal(app.created.length, 1, 'one store for both reads')
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
        import { Component } from '@geajs/core'

        export default class LetCounter extends Component {
          template() {
            ${body}
            return ${jsx}
          }
        }
      `,
          '/virtual/LetCounter.tsx',
        ),
        (error: any) => {
          assert.equal(error.__geaCompileError, true)
          assert.match(error.message, /`count`/)
          assert.match(error.message, /LetCounter/)
          assert.match(error.message, /class field/)
          assert.match(error.message, /Store/)
          assert.equal(typeof error.loc?.line, 'number')
          return true
        },
      )
    })
  }
})
