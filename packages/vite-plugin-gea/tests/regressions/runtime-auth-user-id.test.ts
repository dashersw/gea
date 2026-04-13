import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

describe('ported auth ternary and user id regressions', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('store-backed auth ternary tracks sign in and sign out transitions', async () => {
    const seed = `auth-ternary-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const auth = new Store({ user: null as null | { name: string } }) as { user: null | { name: string } }

    const AuthProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import auth from './auth'

        export default class AuthProbe extends Component {
          template() {
            return (
              <section class="auth">
                {auth.user ? (
                  <div class="signed-in">Hello {auth.user.name}</div>
                ) : (
                  <button class="sign-in">Sign in</button>
                )}
              </section>
            )
          }
        }
      `,
      '/virtual/AuthProbe.tsx',
      'AuthProbe',
      { Component, auth },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new AuthProbe()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.sign-in')?.textContent, 'Sign in')
    auth.user = { name: 'Mira' }
    await flushMicrotasks()
    assert.equal(root.querySelector('.signed-in')?.textContent, 'Hello Mira')
    assert.equal(root.querySelector('.sign-in'), null)

    auth.user.name = 'Noor'
    await flushMicrotasks()
    assert.equal(root.querySelector('.signed-in')?.textContent, 'Hello Noor')

    auth.user = null
    await flushMicrotasks()
    assert.equal(root.querySelector('.sign-in')?.textContent, 'Sign in')
    assert.equal(root.querySelector('.signed-in'), null)

    view.dispose()
    await flushMicrotasks()
  })

  it('user-provided ids survive compilation and do not block reactive child lookup', async () => {
    const seed = `user-id-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ value: 'first' }) as { value: string }

    const IdProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class IdProbe extends Component {
          template() {
            return (
              <form id="profile-form" class="profile">
                <label id="name-label" for="name-input">{store.value}</label>
                <input id="name-input" value={store.value} />
              </form>
            )
          }
        }
      `,
      '/virtual/IdProbe.tsx',
      'IdProbe',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new IdProbe()
    view.render(root)
    await flushMicrotasks()

    const form = root.querySelector('#profile-form') as HTMLFormElement
    const label = root.querySelector('#name-label') as HTMLLabelElement
    const input = root.querySelector('#name-input') as HTMLInputElement
    assert.equal(label.htmlFor, 'name-input')
    assert.equal(label.textContent, 'first')
    assert.equal(input.value, 'first')

    store.value = 'second'
    await flushMicrotasks()
    assert.equal(root.querySelector('#profile-form'), form)
    assert.equal(root.querySelector('#name-label'), label)
    assert.equal(root.querySelector('#name-input'), input)
    assert.equal(label.textContent, 'second')
    assert.equal(input.value, 'second')

    view.dispose()
    await flushMicrotasks()
  })
})
