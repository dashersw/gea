import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE } from '../../../gea/src/symbols'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'

test('mapped checkbox events resolve live items and refresh completed class via array replacement', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-todo-checkbox-class`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TodoList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        let __nextId = 100

        export default class TodoList extends Component {
          todos = [{ id: 1, text: 'First todo', completed: false }]

          toggle(index) {
            this.todos = this.todos.map((t, i) =>
              i === index ? { ...t, id: __nextId++, completed: !t.completed } : t
            )
          }

          template() {
            return (
              <div class="todo-list">
                <div class="todo-items">
                  {this.todos.map((todo, index) => (
                    <div class={\`todo-item\${todo.completed ? ' completed' : ''}\`} key={todo.id}>
                      <input type="checkbox" checked={todo.completed} change={() => this.toggle(index)} />
                      <span>{todo.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/TodoListCheckboxClass.jsx',
      'TodoList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoList()
    view.render(root)
    await flushMicrotasks()

    const rowBefore = view.el.querySelector('.todo-item') as HTMLElement | null
    const checkboxBefore = view.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null

    assert.ok(rowBefore)
    assert.ok(checkboxBefore)
    assert.equal(rowBefore?.className, 'todo-item')
    assert.equal(checkboxBefore?.checked, false)

    // Dispatch change event — the toggle handler replaces the array with new keys
    checkboxBefore?.dispatchEvent(new window.Event('change', { bubbles: true }))
    await flushMicrotasks()

    const rowAfter = view.el.querySelector('.todo-item') as HTMLElement | null
    const checkboxAfter = view.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null

    assert.ok(rowAfter)
    assert.ok(checkboxAfter)
    assert.equal(rowAfter?.className, 'todo-item completed')
    assert.equal(checkboxAfter?.checked, true)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('inline event handlers can use template-local validation state', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-local-click-state`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    let payCount = 0

    const PaymentForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class PaymentForm extends Component {
          template({ value, onPay }) {
            const isValid = value.trim().length > 0
            return (
              <div class="payment-form">
                <button class="pay-btn" click={() => isValid && onPay()}>Pay</button>
              </div>
            )
          }
        }
      `,
      '/virtual/LocalStatePaymentForm.jsx',
      'PaymentForm',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new PaymentForm()
    view[GEA_SET_PROPS]({
      value: () => 'ok',
      onPay: () => () => {
        payCount++
      },
    })
    view.render(root)
    await flushMicrotasks()

    view.el.querySelector('.pay-btn')?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()
    assert.equal(payCount, 1)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('prop-driven conditional jsx children rerender to show validation messages while preserving focus', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-prop-jsx-rerender`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    // Use a function component so the v2 compiler accesses props reactively
    // (class components destructure props once at creation time)
    const PaymentForm = await compileJsxComponent(
      `
        export default function PaymentForm({
          passengerName,
          cardNumber,
          expiry,
          onPassengerNameChange,
          onCardNumberChange,
          onExpiryChange
        }) {
          const passengerNameValid = passengerName.trim().length >= 2
          const cardNumberValid = cardNumber.replace(/\\D/g, '').length === 16
          const expiryValid = /^\\d{2}\\/\\d{2}$/.test(expiry)
          const showErrors = passengerName !== '' || cardNumber !== '' || expiry !== ''

          return (
            <div class="payment-form">
              <div class="form-group">
                <input
                  value={passengerName}
                  input={onPassengerNameChange}
                  type="text"
                  placeholder="Passenger name"
                  class={showErrors && !passengerNameValid ? 'error' : ''}
                />
                {showErrors && !passengerNameValid && <span class="error-msg">At least 2 characters</span>}
              </div>
              <div class="form-group">
                <input
                  value={cardNumber}
                  input={onCardNumberChange}
                  type="text"
                  placeholder="Card number"
                  class={showErrors && !cardNumberValid ? 'error' : ''}
                />
              </div>
              <div class="form-group">
                <input
                  value={expiry}
                  input={onExpiryChange}
                  type="text"
                  placeholder="MM/YY"
                  class={showErrors && !expiryValid ? 'error' : ''}
                />
              </div>
            </div>
          )
        }
      `,
      '/virtual/PaymentFormConditionalErrors.jsx',
      'PaymentForm',
      { Component },
    )

    const PaymentStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class PaymentStore extends Store {
          passengerName = ''
          cardNumber = ''
          expiry = ''
        }
      `,
      '/virtual/payment-store.ts',
      'PaymentStore',
      { Store },
    )
    const paymentStore = new PaymentStore()

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import paymentStore from './payment-store.ts'
        import PaymentForm from './PaymentFormConditionalErrors.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent-view">
                <PaymentForm
                  passengerName={paymentStore.passengerName}
                  cardNumber={paymentStore.cardNumber}
                  expiry={paymentStore.expiry}
                  onPassengerNameChange={e => { paymentStore.passengerName = e.target.value }}
                  onCardNumberChange={e => { paymentStore.cardNumber = e.target.value }}
                  onExpiryChange={e => { paymentStore.expiry = e.target.value }}
                />
              </div>
            )
          }
        }
      `,
      '/virtual/ParentPaymentFormConditionalErrors.jsx',
      'ParentView',
      { Component, PaymentForm, paymentStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    const input = root.querySelector('input[placeholder="Passenger name"]') as HTMLInputElement | null
    assert.ok(input)

    input.focus()
    input.value = 'A'
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(root.querySelector('.error-msg')?.textContent?.trim(), 'At least 2 characters')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('input in form with conditional error spans updates correctly', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-stable-conditional-input`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const PaymentForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default function PaymentForm({
          passengerName, cardNumber, expiry,
          onPassengerNameChange, onCardNumberChange, onExpiryChange
        }) {
          const passengerNameValid = passengerName.trim().length >= 2
          const cardNumberValid = cardNumber.replace(/\\D/g, '').length === 16
          const expiryValid = /^\\d{2}\\/\\d{2}$/.test(expiry)
          const showErrors = passengerName !== '' || cardNumber !== '' || expiry !== ''

          return (
            <div class="payment-form">
              <div class="form-group">
                <input
                  value={passengerName}
                  input={onPassengerNameChange}
                  type="text"
                  placeholder="Passenger name"
                  class={showErrors && !passengerNameValid ? 'error' : ''}
                />
                {showErrors && !passengerNameValid && <span class="error-msg name-error">At least 2 characters</span>}
              </div>
              <div class="form-group">
                <input
                  value={cardNumber}
                  input={onCardNumberChange}
                  type="text"
                  placeholder="Card number"
                  class={showErrors && !cardNumberValid ? 'error' : ''}
                />
                {showErrors && !cardNumberValid && <span class="error-msg card-error">16 digits required</span>}
              </div>
              <div class="form-group">
                <input
                  value={expiry}
                  input={onExpiryChange}
                  type="text"
                  placeholder="MM/YY"
                  class={showErrors && !expiryValid ? 'error' : ''}
                />
                {showErrors && !expiryValid && <span class="error-msg expiry-error">Format: MM/YY</span>}
              </div>
            </div>
          )
        }
      `,
      '/virtual/StableCondPaymentForm.jsx',
      'PaymentForm',
      { Component },
    )

    const PaymentStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class PaymentStore extends Store {
          passengerName = ''
          cardNumber = ''
          expiry = ''
        }
      `,
      '/virtual/payment-store.ts',
      'PaymentStore',
      { Store },
    )
    const paymentStore = new PaymentStore()

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import paymentStore from './payment-store.ts'
        import PaymentForm from './PaymentForm.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent-view">
                <PaymentForm
                  passengerName={paymentStore.passengerName}
                  cardNumber={paymentStore.cardNumber}
                  expiry={paymentStore.expiry}
                  onPassengerNameChange={e => { paymentStore.passengerName = e.target.value }}
                  onCardNumberChange={e => { paymentStore.cardNumber = e.target.value }}
                  onExpiryChange={e => { paymentStore.expiry = e.target.value }}
                />
              </div>
            )
          }
        }
      `,
      '/virtual/StableCondParentView.jsx',
      'ParentView',
      { Component, PaymentForm, paymentStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    // Type "A" — showErrors flips false->true, passengerNameValid is false
    paymentStore.passengerName = 'A'
    await flushMicrotasks()

    assert.ok(root.querySelector('.name-error'), 'name error should appear')
    assert.ok(root.querySelector('.card-error'), 'card error should appear')
    assert.ok(root.querySelector('.expiry-error'), 'expiry error should appear')

    // Type "B" — still invalid, conditions remain stable
    paymentStore.passengerName = 'B'
    await flushMicrotasks()

    assert.ok(root.querySelector('.name-error'), 'name error should persist')
    assert.equal((root.querySelector('input[placeholder="Passenger name"]') as HTMLInputElement)?.value, 'B')

    // Now type a valid name "CD" — passengerNameValid flips to true
    paymentStore.passengerName = 'CD'
    await flushMicrotasks()

    assert.equal(root.querySelector('.name-error'), null, 'name error should disappear when name becomes valid')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('click handler on inline child inside compiled child component fires on parent', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-inline-child-click`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Wrapper = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Wrapper extends Component {
        template(props) {
          return (
            <div class="wrapper">
              <div class="wrapper-body">{props.children}</div>
            </div>
          )
        }
      }
    `,
      '/virtual/Wrapper.jsx',
      'Wrapper',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Wrapper from './Wrapper'
      export default class Parent extends Component {
        lastAction = 'none'
        template() {
          return (
            <div class="parent">
              <Wrapper>
                <button class="action-btn" click={() => (this.lastAction = 'clicked')}>
                  Do it
                </button>
              </Wrapper>
              <span class="result">{this.lastAction}</span>
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Wrapper },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.result')?.textContent, 'none')

    const btn = view.el.querySelector('.action-btn') as HTMLElement
    assert.ok(btn, 'inline button should exist inside the wrapper')

    btn.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(
      view.el.querySelector('.result')?.textContent,
      'clicked',
      'click handler fires on parent component',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional textarea value binding: textarea.value must reflect state set before conditional flip', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-cond-textarea-value`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const EditableTitle = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class EditableTitle extends Component {
          isEditing = false
          editTitle = ''

          startEditing() {
            this.editTitle = 'Hello World'
            this.isEditing = true
          }

          startEditingFlagFirst() {
            this.isEditing = true
            this.editTitle = 'Flag First'
          }

          template() {
            return (
              <div class="wrapper">
                {!this.isEditing && (
                  <h2 class="title-display">Some Title</h2>
                )}
                {this.isEditing && (
                  <textarea class="title-input" value={this.editTitle}></textarea>
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/EditableTitle.jsx',
      'EditableTitle',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const comp = new EditableTitle()
    comp.render(root)
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.title-display'), 'h2 visible initially')
    assert.ok(!comp.el.querySelector('.title-input'), 'textarea absent initially')

    comp.startEditing()
    await flushMicrotasks()

    assert.ok(!comp.el.querySelector('.title-display'), 'h2 hidden after startEditing')
    const textarea = comp.el.querySelector('.title-input') as HTMLTextAreaElement
    assert.ok(textarea, 'textarea appears after startEditing')
    assert.equal(
      textarea.value,
      'Hello World',
      'textarea.value must equal editTitle set in startEditing (data before flag)',
    )

    // Reset and test the other assignment order (flag first, then data)
    comp.isEditing = false
    await flushMicrotasks()

    comp.startEditingFlagFirst()
    await flushMicrotasks()

    const textarea2 = comp.el.querySelector('.title-input') as HTMLTextAreaElement
    assert.ok(textarea2, 'textarea appears after startEditingFlagFirst')
    assert.equal(
      textarea2.value,
      'Flag First',
      'textarea.value must work regardless of assignment order (flag before data)',
    )

    comp.dispose()
  } finally {
    restoreDom()
  }
})
