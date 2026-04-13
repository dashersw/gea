import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('textarea initial value is set from store on first render', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-textarea-initial`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ summary: 'Experienced developer' })

    const FormComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class FormComponent extends Component {
          template() {
            return (
              <form class="cv-form">
                <textarea class="summary" value={store.summary}></textarea>
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

    const textarea = component.el.querySelector('.summary') as HTMLTextAreaElement
    assert.ok(textarea, 'textarea should exist')
    assert.equal(textarea.value, 'Experienced developer', 'textarea .value must reflect store value on initial render')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('select element value binding syncs .value from store', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-select-value`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ language: 'en' })

    const FormComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class FormComponent extends Component {
          template() {
            return (
              <form class="cv-form">
                <select class="lang-select" value={store.language}>
                  <option value="tr">Turkish</option>
                  <option value="en">English</option>
                  <option value="de">German</option>
                </select>
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

    const select = component.el.querySelector('.lang-select') as HTMLSelectElement
    assert.ok(select, 'select should exist')
    assert.equal(select.value, 'en', 'select .value must reflect store value on initial render')

    store.language = 'de'
    await flushMicrotasks()

    assert.equal(select.value, 'de', 'select .value must update after store change')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('bulk store update (simulating JSON import) repopulates all form fields', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-bulk-form-update`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    })

    const CVForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class CVForm extends Component {
          template() {
            return (
              <form class="cv-form">
                <input type="text" class="first-name" value={store.firstName} input={(e) => store.firstName = e.target.value} />
                <input type="text" class="last-name" value={store.lastName} input={(e) => store.lastName = e.target.value} />
                <input type="email" class="email" value={store.email} input={(e) => store.email = e.target.value} />
                <input type="tel" class="phone" value={store.phone} input={(e) => store.phone = e.target.value} />
              </form>
            )
          }
        }
      `,
      '/virtual/CVForm.jsx',
      'CVForm',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new CVForm()
    component.render(root)
    await flushMicrotasks()

    // Verify empty initial state
    const firstName = component.el.querySelector('.first-name') as HTMLInputElement
    const lastName = component.el.querySelector('.last-name') as HTMLInputElement
    const email = component.el.querySelector('.email') as HTMLInputElement
    const phone = component.el.querySelector('.phone') as HTMLInputElement

    assert.equal(firstName.value, '', 'firstName starts empty')
    assert.equal(lastName.value, '', 'lastName starts empty')
    assert.equal(email.value, '', 'email starts empty')
    assert.equal(phone.value, '', 'phone starts empty')

    // Simulate importing cv.json — bulk update all fields
    store.firstName = 'John'
    store.lastName = 'Doe'
    store.email = 'john@example.com'
    store.phone = '+1234567890'
    await flushMicrotasks()

    assert.equal(firstName.value, 'John', 'firstName input should show imported value')
    assert.equal(lastName.value, 'Doe', 'lastName input should show imported value')
    assert.equal(email.value, 'john@example.com', 'email input should show imported value')
    assert.equal(phone.value, '+1234567890', 'phone input should show imported value')

    // Verify fields remain editable after import
    store.firstName = 'Jane'
    await flushMicrotasks()
    assert.equal(firstName.value, 'Jane', 'firstName should update after further edit')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
