import assert from 'node:assert/strict'
import { GEA_ON_PROP_CHANGE, GEA_REQUEST_RENDER, GEA_UPDATE_PROPS } from '@geajs/core'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { GEA_RENDERED } from '../../../gea/src/lib/symbols'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('mapped checkbox events resolve live proxy items and refresh completed class', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-todo-checkbox-class`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TodoList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoList extends Component {
          todos = [{ id: 1, text: 'First todo', completed: false }]

          toggle(todo) {
            todo.completed = !todo.completed
          }

          template() {
            return (
              <div class="todo-list">
                <div class="todo-items">
                  {this.todos.map(todo => (
                    <div class={\`todo-item\${todo.completed ? ' completed' : ''}\`} key={todo.id}>
                      <input type="checkbox" checked={todo.completed} change={() => this.toggle(todo)} />
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

  try {
    const seed = `runtime-${Date.now()}-local-click-state`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    let payCount = 0

    const PaymentForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class PaymentForm extends Component {
          template(props) {
            const { value, onPay } = props
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

    const view = new PaymentForm({
      value: 'ok',
      onPay: () => {
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

  try {
    const seed = `runtime-${Date.now()}-prop-jsx-rerender`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const PaymentForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class PaymentForm extends Component {
          template(props) {
            const {
              passengerName,
              cardNumber,
              expiry,
              onPassengerNameChange,
              onCardNumberChange,
              onExpiryChange
            } = props

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
        }
      `,
      '/virtual/PaymentFormConditionalErrors.jsx',
      'PaymentForm',
      { Component },
    )

    const paymentStore = new Store({
      passengerName: '',
      cardNumber: '',
      expiry: '',
    }) as {
      passengerName: string
      cardNumber: string
      expiry: string
      setPassengerName: (e: Event) => void
      setCardNumber: (e: Event) => void
      setExpiry: (e: Event) => void
    }
    paymentStore.setPassengerName = (e: Event) => {
      const target = e.target as HTMLInputElement
      paymentStore.passengerName = target.value
    }
    paymentStore.setCardNumber = (e: Event) => {
      const target = e.target as HTMLInputElement
      paymentStore.cardNumber = target.value
    }
    paymentStore.setExpiry = (e: Event) => {
      const target = e.target as HTMLInputElement
      paymentStore.expiry = target.value
    }

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
                  onPassengerNameChange={paymentStore.setPassengerName}
                  onCardNumberChange={paymentStore.setCardNumber}
                  onExpiryChange={paymentStore.setExpiry}
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

    assert.equal(document.activeElement, root.querySelector('input[placeholder="Passenger name"]'))
    assert.equal(root.querySelector('.error-msg')?.textContent?.trim(), 'At least 2 characters')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('rerender preserves focused input and selection', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-preserve-focus`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    class FocusComponent extends Component {
      constructor(props: any = {}) {
        super(props)
      }

      template(props: { value: string }) {
        return `<div id="${this.id}" class="focus-wrap"><input id="${this.id}-field" value="${props.value}" /></div>`
      }

      [GEA_ON_PROP_CHANGE]() {
        if ((this as any)[GEA_RENDERED]) (this as any)[GEA_REQUEST_RENDER]()
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new FocusComponent({ value: 'abc' })
    view.render(root)
    await flushMicrotasks()

    const input = view.el.querySelector('input') as HTMLInputElement | null
    assert.ok(input)
    input!.focus()
    input!.setSelectionRange(1, 2)
    ;(view as any)[GEA_UPDATE_PROPS]({ value: 'abcd' })
    await flushMicrotasks()

    const rerendered = view.el.querySelector('input') as HTMLInputElement | null
    assert.ok(rerendered)
    assert.equal((document.activeElement as HTMLElement | null)?.id, `${view.id}-field`)
    assert.equal(rerendered!.selectionStart, 1)
    assert.equal(rerendered!.selectionEnd, 2)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('rerender adjusts caret when formatted value grows before cursor', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-preserve-formatted-caret`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    class FocusComponent extends Component {
      constructor(props: any = {}) {
        super(props)
      }

      template(props: { value: string }) {
        return `<div id="${this.id}" class="focus-wrap"><input id="${this.id}-field" value="${props.value}" /></div>`
      }

      [GEA_ON_PROP_CHANGE]() {
        if ((this as any)[GEA_RENDERED]) (this as any)[GEA_REQUEST_RENDER]()
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new FocusComponent({ value: '42424' })
    view.render(root)
    await flushMicrotasks()

    const input = view.el.querySelector('input') as HTMLInputElement | null
    assert.ok(input)
    input!.focus()
    input!.setSelectionRange(5, 5)
    ;(view as any)[GEA_UPDATE_PROPS]({ value: '4242 4' })
    await flushMicrotasks()

    const rerendered = view.el.querySelector('input') as HTMLInputElement | null
    assert.ok(rerendered)
    assert.equal(rerendered!.selectionStart, 6)
    assert.equal(rerendered!.selectionEnd, 6)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('input in form with conditional error spans does not rerender when condition is stable', async () => {
  const restoreDom = installDom()

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

    const paymentStore = new Store({
      passengerName: '',
      cardNumber: '',
      expiry: '',
    }) as {
      passengerName: string
      cardNumber: string
      expiry: string
    }

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

    const paymentFormChild = (view as any)._paymentForm
    assert.ok(paymentFormChild, 'PaymentForm child must exist')

    // Type "A" — showErrors flips false→true, passengerNameValid is false
    // All three error conditions flip: [false,false,false] → [true,true,true]
    // A rerender is expected here (first condition change)
    paymentStore.passengerName = 'A'
    await flushMicrotasks()

    assert.ok(root.querySelector('.name-error'), 'name error should appear')
    assert.ok(root.querySelector('.card-error'), 'card error should appear')
    assert.ok(root.querySelector('.expiry-error'), 'expiry error should appear')

    // Now install spies AFTER the initial condition flip
    let formRerenders = 0
    const origRender = paymentFormChild[GEA_REQUEST_RENDER].bind(paymentFormChild)
    paymentFormChild[GEA_REQUEST_RENDER] = () => {
      formRerenders++
      return origRender()
    }

    let parentRerenders = 0
    const origParentRender = view[GEA_REQUEST_RENDER].bind(view)
    view[GEA_REQUEST_RENDER] = () => {
      parentRerenders++
      return origParentRender()
    }

    const formElBefore = paymentFormChild.el

    // Type "A" → "B" (single char, still invalid, conditions remain [true,true,true])
    paymentStore.passengerName = 'B'
    await flushMicrotasks()

    assert.equal(formRerenders, 0, `PaymentForm must NOT rerender when conditions are stable (got ${formRerenders})`)
    assert.equal(parentRerenders, 0, `ParentView must NOT rerender (got ${parentRerenders})`)
    assert.equal(paymentFormChild.el, formElBefore, 'PaymentForm DOM element must be the same object')
    assert.ok(root.querySelector('.name-error'), 'name error should persist')
    assert.equal((root.querySelector('input[placeholder="Passenger name"]') as HTMLInputElement)?.value, 'B')

    // Type "B" → "C" (another single char, still invalid, same stable conditions)
    formRerenders = 0
    paymentStore.passengerName = 'C'
    await flushMicrotasks()

    assert.equal(formRerenders, 0, `PaymentForm must NOT rerender on third stable keystroke (got ${formRerenders})`)
    assert.equal(paymentFormChild.el, formElBefore, 'PaymentForm DOM element must remain the same')

    // Now type a valid name "CD" — passengerNameValid flips to true
    // Condition 0 flips: true→false. DOM patching removes the error span without a full rerender.
    formRerenders = 0
    paymentStore.passengerName = 'CD'
    await flushMicrotasks()

    assert.equal(
      formRerenders,
      0,
      `PaymentForm should NOT rerender — conditional DOM patching handles the flip (got ${formRerenders})`,
    )
    assert.equal(root.querySelector('.name-error'), null, 'name error should disappear when name becomes valid')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('click handler on inline child inside compiled child component fires on parent', async () => {
  const restoreDom = installDom()

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
    assert.ok(btn.getAttribute('data-ge'), 'button should have data-ge for event delegation')

    // Simulate Zag's spreadProps overwriting the id — data-ge should survive.
    // In real usage, our Dialog override replaces Zag's onclick (which calls stopPropagation)
    // with a version that doesn't — so the spread here omits stopPropagation.
    const { spreadProps } = await import('@zag-js/vanilla')
    spreadProps(btn, {
      'data-scope': 'dialog',
      'data-part': 'close-trigger',
      id: 'dialog:overwrite:close-trigger',
      type: 'button',
      onclick() {},
    })
    assert.equal(btn.id, 'dialog:overwrite:close-trigger', 'spreadProps overwrites the id')
    assert.ok(btn.getAttribute('data-ge'), 'data-ge survives spreadProps')

    btn.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(
      view.el.querySelector('.result')?.textContent,
      'clicked',
      'click handler fires even after spreadProps overwrites id (uses data-ge)',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional textarea value binding: textarea.value must reflect state set before conditional flip', async () => {
  const restoreDom = installDom()

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
