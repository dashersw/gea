import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, compileStore, loadRuntimeModules } from '../helpers/compile'

/**
 * Regression: multiple component classes in the same file should be compiled
 * properly. When ComponentA uses <ComponentB /> and both are defined in the
 * same file, ComponentB must render its template — not as a custom element tag.
 * https://github.com/dashersw/gea/issues/25
 */
test('same-file component used as JSX tag renders its template, not a custom element', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-same-file-comp`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const module = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        export class LoginForm extends Component {
          template() {
            return (
              <form class="login-form">
                <input type="text" class="username" />
                <input type="password" class="password" />
                <button type="submit">Submit</button>
              </form>
            )
          }
        }

        export default class LoginGuard extends Component {
          template() {
            return (
              <div class="login-guard">
                <LoginForm />
              </div>
            )
          }
        }
      `,
      '/virtual/login-guard.tsx',
      ['LoginForm', 'LoginGuard'],
      { Component },
    )

    const LoginGuard = module.LoginGuard as any

    const root = document.createElement('div')
    document.body.appendChild(root)

    const guard = new LoginGuard()
    guard.render(root)
    await flushMicrotasks()

    const form = guard.el.querySelector('.login-form')
    assert.ok(form, 'LoginForm should render its template with .login-form, not as a <loginform> custom element')

    const inputs = guard.el.querySelectorAll('input')
    assert.equal(inputs.length, 2, 'LoginForm should render its two input fields')

    const button = guard.el.querySelector('button')
    assert.ok(button, 'LoginForm should render its submit button')
    assert.equal(button.textContent, 'Submit')

    guard.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('same-file component receives and renders props from parent', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-same-file-props`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const module = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        export class Greeting extends Component {
          template({ name }) {
            return <span class="greeting">Hello {name}</span>
          }
        }

        export default class App extends Component {
          template() {
            return (
              <div class="app">
                <Greeting name="World" />
              </div>
            )
          }
        }
      `,
      '/virtual/app.tsx',
      ['Greeting', 'App'],
      { Component },
    )

    const App = module.App as any

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    const greeting = app.el.querySelector('.greeting')
    assert.ok(greeting, 'Greeting component should render its template')
    assert.ok(
      greeting.textContent?.includes('Hello') && greeting.textContent?.includes('World'),
      `Greeting should show "Hello World" but got "${greeting?.textContent}"`,
    )

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('same-file component with reactive store updates correctly', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-same-file-reactive`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    // In v2, Store fields must be compiled to signals — use compileStore
    const CounterStore = await compileStore(
      `
        import { Store } from '@geajs/core'

        export default class CounterStore extends Store {
          count = 0
        }
      `,
      '/virtual/CounterStore.ts',
      'CounterStore',
      { Store },
    )
    const store = new CounterStore()

    const module = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export class Counter extends Component {
          template({ value }) {
            return <span class="counter-display">{value}</span>
          }
        }

        export default class CounterPage extends Component {
          template() {
            return (
              <div class="counter-page">
                <Counter value={store.count} />
                <button class="inc" click={() => store.count++}>+</button>
              </div>
            )
          }
        }
      `,
      '/virtual/counter-page.tsx',
      ['Counter', 'CounterPage'],
      { Component, store },
    )

    const CounterPage = module.CounterPage as any

    const root = document.createElement('div')
    document.body.appendChild(root)

    const page = new CounterPage()
    page.render(root)
    await flushMicrotasks()

    const display = page.el.querySelector('.counter-display')
    assert.ok(display, 'Counter component should render its template')
    assert.equal(display.textContent?.trim(), '0', 'Counter should show initial value')

    store.count = 5
    await flushMicrotasks()

    assert.equal(display.textContent?.trim(), '5', 'Counter should update reactively')

    page.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
