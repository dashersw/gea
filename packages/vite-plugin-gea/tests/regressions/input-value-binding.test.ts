import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('input value binding updates DOM .value when store changes programmatically', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-input-value-store`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ name: 'Alice', email: 'alice@example.com' })

    const FormComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class FormComponent extends Component {
          template() {
            return (
              <form class="cv-form">
                <input type="text" class="name-input" value={store.name} input={(e) => store.name = e.target.value} />
                <input type="email" class="email-input" value={store.email} input={(e) => store.email = e.target.value} />
              </form>
            )
          }
        }
      `,
      '/virtual/FormComponent.jsx',
      'FormComponent',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new FormComponent()
    component.render(root)
    await flushMicrotasks()

    const nameInput = component.el.querySelector('.name-input') as HTMLInputElement
    const emailInput = component.el.querySelector('.email-input') as HTMLInputElement

    assert.ok(nameInput, 'name input should exist')
    assert.ok(emailInput, 'email input should exist')
    assert.equal(nameInput.value, 'Alice', 'name input should have initial value')
    assert.equal(emailInput.value, 'alice@example.com', 'email input should have initial value')

    // Simulate JSON import: programmatically update all store fields
    store.name = 'Bob'
    store.email = 'bob@example.com'
    await flushMicrotasks()

    assert.equal(nameInput.value, 'Bob', 'name input .value should update after store change')
    assert.equal(emailInput.value, 'bob@example.com', 'email input .value should update after store change')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('input value binding updates DOM .value when local state changes programmatically', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-input-value-local`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const FormComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class FormComponent extends Component {
          name = 'Alice'
          email = 'alice@example.com'

          template() {
            return (
              <form class="cv-form">
                <input type="text" class="name-input" value={this.name} input={(e) => this.name = e.target.value} />
                <input type="email" class="email-input" value={this.email} input={(e) => this.email = e.target.value} />
              </form>
            )
          }
        }
      `,
      '/virtual/FormComponent.jsx',
      'FormComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new FormComponent()
    component.render(root)
    await flushMicrotasks()

    const nameInput = component.el.querySelector('.name-input') as HTMLInputElement
    const emailInput = component.el.querySelector('.email-input') as HTMLInputElement

    assert.ok(nameInput, 'name input should exist')
    assert.ok(emailInput, 'email input should exist')
    assert.equal(nameInput.value, 'Alice', 'name input should have initial value')
    assert.equal(emailInput.value, 'alice@example.com', 'email input should have initial value')

    // Simulate JSON import: programmatically update all local state fields
    component.name = 'Bob'
    component.email = 'bob@example.com'
    await flushMicrotasks()

    assert.equal(nameInput.value, 'Bob', 'name input .value should update after local state change')
    assert.equal(emailInput.value, 'bob@example.com', 'email input .value should update after local state change')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('textarea value binding updates DOM .value when store changes', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-textarea-value`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ bio: 'Hello world' })

    const FormComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class FormComponent extends Component {
          template() {
            return (
              <form class="cv-form">
                <textarea class="bio-input" value={store.bio} input={(e) => store.bio = e.target.value}></textarea>
              </form>
            )
          }
        }
      `,
      '/virtual/FormComponent.jsx',
      'FormComponent',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new FormComponent()
    component.render(root)
    await flushMicrotasks()

    const textarea = component.el.querySelector('.bio-input') as HTMLTextAreaElement

    assert.ok(textarea, 'textarea should exist')
    assert.equal(textarea.value, 'Hello world', 'textarea should have initial value')

    store.bio = 'Updated bio from JSON import'
    await flushMicrotasks()

    assert.equal(textarea.value, 'Updated bio from JSON import', 'textarea .value should update after store change')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('full re-render syncs input .value from HTML attribute', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-rerender-value`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ name: 'Alice', showExtra: false })

    const FormComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class FormComponent extends Component {
          template() {
            return (
              <form class="cv-form">
                <input type="text" class="name-input" value={store.name} input={(e) => store.name = e.target.value} />
                {store.showExtra && <span class="extra">Extra content</span>}
              </form>
            )
          }
        }
      `,
      '/virtual/FormComponent.jsx',
      'FormComponent',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new FormComponent()
    component.render(root)
    await flushMicrotasks()

    const nameInput = component.el.querySelector('.name-input') as HTMLInputElement
    assert.ok(nameInput, 'name input should exist')
    assert.equal(nameInput.value, 'Alice', 'name input should have initial value')

    store.name = 'Bob'
    store.showExtra = true
    await flushMicrotasks()

    const updatedInput = component.el.querySelector('.name-input') as HTMLInputElement
    assert.ok(updatedInput, 'name input should still exist after re-render')
    assert.equal(updatedInput.value, 'Bob', 'input .value must be synced after full re-render')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
