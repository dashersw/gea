import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'

test('input value binding updates DOM .value when store changes programmatically', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-input-value-store`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const FormStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class FormStore extends Store {
          name = 'Alice'
          email = 'alice@example.com'
        }
      `,
      '/virtual/form-store.ts',
      'FormStore',
      { Store },
    )
    const store = new FormStore()

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
  resetDelegation()

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
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-textarea-value`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const BioStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class BioStore extends Store {
          bio = 'Hello world'
        }
      `,
      '/virtual/bio-store.ts',
      'BioStore',
      { Store },
    )
    const store = new BioStore()

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
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-rerender-value`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const FormDataStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class FormDataStore extends Store {
          name = 'Alice'
          showExtra = false
        }
      `,
      '/virtual/form-data-store.ts',
      'FormDataStore',
      { Store },
    )
    const store = new FormDataStore()

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

test('mapped list items with inputs sync .value on data replacement', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-map-value-sync`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const ItemsStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class ItemsStore extends Store {
          items = [
            { id: '1', name: 'Alice' },
            { id: '2', name: 'Bob' },
          ]
        }
      `,
      '/virtual/items-store.ts',
      'ItemsStore',
      { Store },
    )
    const store = new ItemsStore()

    const ListForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class ListForm extends Component {
          template() {
            return (
              <div class="list-form">
                {store.items.map((item) => (
                  <div class="item" key={item.id}>
                    <input type="text" class="item-name" value={item.name} />
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/ListForm.jsx',
      'ListForm',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ListForm()
    component.render(root)
    await flushMicrotasks()

    const inputs = component.el.querySelectorAll('.item-name') as NodeListOf<HTMLInputElement>
    assert.equal(inputs.length, 2, 'should have 2 inputs')
    assert.equal(inputs[0].value, 'Alice', 'first input should show Alice')
    assert.equal(inputs[1].value, 'Bob', 'second input should show Bob')

    // Replace items with new keys to trigger new row creation
    store.items = [
      { id: '10', name: 'Charlie' },
      { id: '20', name: 'Diana' },
    ]
    await flushMicrotasks()

    const updatedInputs = component.el.querySelectorAll('.item-name') as NodeListOf<HTMLInputElement>
    assert.equal(updatedInputs[0].value, 'Charlie', 'first input .value must update after data replacement')
    assert.equal(updatedInputs[1].value, 'Diana', 'second input .value must update after data replacement')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped list full replacement syncs input .value for new items', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-map-replace-value`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const ItemsStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class ItemsStore extends Store {
          items = [{ id: '1', name: 'Alice' }]
        }
      `,
      '/virtual/items-store.ts',
      'ItemsStore',
      { Store },
    )
    const store = new ItemsStore()

    const ListForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class ListForm extends Component {
          template() {
            return (
              <div class="list-form">
                {store.items.map((item) => (
                  <div class="item" key={item.id}>
                    <input type="text" class="item-name" value={item.name} />
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/ListForm.jsx',
      'ListForm',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ListForm()
    component.render(root)
    await flushMicrotasks()

    const inputs = component.el.querySelectorAll('.item-name') as NodeListOf<HTMLInputElement>
    assert.equal(inputs.length, 1, 'should have 1 input')
    assert.equal(inputs[0].value, 'Alice', 'first input should show Alice')

    store.items = [
      { id: '10', name: 'Xavier' },
      { id: '20', name: 'Yolanda' },
      { id: '30', name: 'Zach' },
    ]
    await flushMicrotasks()

    const newInputs = component.el.querySelectorAll('.item-name') as NodeListOf<HTMLInputElement>
    assert.equal(newInputs.length, 3, 'should now have 3 inputs')
    assert.equal(newInputs[0].value, 'Xavier', 'first input .value must match after full list replace')
    assert.equal(newInputs[1].value, 'Yolanda', 'second input .value must match after full list replace')
    assert.equal(newInputs[2].value, 'Zach', 'third input .value must match after full list replace')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('textarea initial value is set from store on first render', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-textarea-initial`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const SummaryStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class SummaryStore extends Store {
          summary = 'Experienced developer'
        }
      `,
      '/virtual/summary-store.ts',
      'SummaryStore',
      { Store },
    )
    const store = new SummaryStore()

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
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-select-value`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const LangStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class LangStore extends Store {
          language = 'en'
        }
      `,
      '/virtual/lang-store.ts',
      'LangStore',
      { Store },
    )
    const store = new LangStore()

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
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-bulk-form-update`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const CVStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class CVStore extends Store {
          firstName = ''
          lastName = ''
          email = ''
          phone = ''
        }
      `,
      '/virtual/cv-store.ts',
      'CVStore',
      { Store },
    )
    const store = new CVStore()

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
