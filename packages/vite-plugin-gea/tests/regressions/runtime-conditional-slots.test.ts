import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('conditional branches swap rendered elements when state flips', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-branches`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ConditionalBranchComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ConditionalBranchComponent extends Component {
          expanded = false

          template() {
            return (
              <section class="card">
                {this.expanded ? (
                  <p class="details">Details</p>
                ) : (
                  <button class="summary">Open</button>
                )}
              </section>
            )
          }
        }
      `,
      '/virtual/ConditionalBranchComponent.jsx',
      'ConditionalBranchComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ConditionalBranchComponent()
    component.render(root)

    assert.equal(component.el.querySelector('.summary')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)

    component.expanded = true
    await flushMicrotasks()
    assert.equal(component.el.querySelector('.details')?.textContent?.trim(), 'Details')
    assert.equal(component.el.querySelector('.summary'), null)

    component.expanded = false
    await flushMicrotasks()
    assert.equal(component.el.querySelector('.summary')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional branches preserve surrounding siblings across repeated flips', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-sibling-stability`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SiblingStableConditional = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SiblingStableConditional extends Component {
          open = false

          template() {
            return (
              <section class="panel">
                <header class="title">Title</header>
                {this.open ? (
                  <div class="details">
                    <span class="details-copy">Details</span>
                  </div>
                ) : (
                  <button class="trigger">Open</button>
                )}
                <footer class="footer">Footer</footer>
              </section>
            )
          }
        }
      `,
      '/virtual/SiblingStableConditional.jsx',
      'SiblingStableConditional',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new SiblingStableConditional()
    component.render(root)

    assert.equal(component.el.children.length, 3)
    assert.equal(component.el.querySelector('.trigger')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)
    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'trigger', 'footer'],
    )

    component.open = true
    await flushMicrotasks()
    assert.equal(component.el.children.length, 3)
    assert.equal(component.el.querySelectorAll('.title').length, 1)
    assert.equal(component.el.querySelectorAll('.footer').length, 1)
    assert.equal(component.el.querySelector('.trigger'), null)
    assert.equal(component.el.querySelector('.details-copy')?.textContent?.trim(), 'Details')
    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'details', 'footer'],
    )

    component.open = false
    await flushMicrotasks()
    assert.equal(component.el.children.length, 3)
    assert.equal(component.el.querySelectorAll('.title').length, 1)
    assert.equal(component.el.querySelectorAll('.footer').length, 1)
    assert.equal(component.el.querySelector('.trigger')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)
    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'trigger', 'footer'],
    )

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional branches do not leave stale transitioning nodes behind', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-stale-node-cleanup`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TransitionBranchComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TransitionBranchComponent extends Component {
          showToast = false

          template() {
            return (
              <div class="shell">
                {this.showToast ? (
                  <div class="toast" style="opacity: 1; transition: opacity 120ms ease;">Saved</div>
                ) : (
                  <span class="idle">Idle</span>
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/TransitionBranchComponent.jsx',
      'TransitionBranchComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new TransitionBranchComponent()
    component.render(root)

    assert.equal(component.el.querySelectorAll('.toast').length, 0)
    assert.equal(component.el.querySelectorAll('.idle').length, 1)

    component.showToast = true
    await flushMicrotasks()
    assert.equal(component.el.querySelectorAll('.toast').length, 1)
    assert.equal(component.el.querySelectorAll('.idle').length, 0)
    assert.match(component.el.querySelector('.toast')?.getAttribute('style') || '', /transition:\s*opacity 120ms ease;/)

    component.showToast = false
    await flushMicrotasks()
    assert.equal(component.el.querySelectorAll('.toast').length, 0)
    assert.equal(component.el.querySelectorAll('.idle').length, 1)

    component.showToast = true
    await flushMicrotasks()
    assert.equal(component.el.querySelectorAll('.toast').length, 1)
    assert.equal(component.el.querySelectorAll('.idle').length, 0)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('View renders passed children', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-view-children`
    const [{ default: Component }] = await Promise.all([import(`../../../gea/src/lib/base/component.tsx?${seed}`)])

    class View extends Component {
      index = 0

      render(opt_rootEl = document.body, opt_index = 0) {
        this.index = opt_index
        return super.render(opt_rootEl)
      }

      onAfterRender() {
        super.onAfterRender()
        this.el.style.zIndex = String(this.index)
        this.el.style.transform = `translate3d(0, 0, ${this.index}px)`
      }

      constructor(props: any = {}) {
        super(props)
      }

      template(props: Record<string, any> = {}) {
        const children = props.children == null ? '' : props.children
        return `<view>${children}</view>`
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new View({
      children: '<button class="inner-button">Counter</button>',
    })
    view.render(root)
    await flushMicrotasks()

    const button = root.querySelector('button.inner-button')
    assert.ok(button, root.innerHTML)
    assert.equal(button.textContent?.trim(), 'Counter')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional slot with early-return guard does not crash constructor when store value is null', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-early-return-cond`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const dataStore = new Store({
      item: null as { description: string } | null,
    }) as { item: { description: string } | null }

    const DetailView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import dataStore from './data-store'

        export default class DetailView extends Component {
          isEditing = false

          template() {
            const { item } = dataStore

            if (!item) return <div class="loader">Loading</div>

            const desc = item.description || ''

            return (
              <div class="detail">
                {this.isEditing && <textarea value={desc} />}
                {!this.isEditing && desc && <p class="desc">{desc}</p>}
                {!this.isEditing && !desc && <p class="placeholder">Add description</p>}
              </div>
            )
          }
        }
      `,
      '/virtual/DetailView.jsx',
      'DetailView',
      { Component, dataStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    assert.doesNotThrow(
      () => new DetailView(),
      'constructing a component with null store data and an early-return guard must not throw',
    )

    const view = new DetailView()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.textContent?.includes('Loading'), 'should show loader when item is null')

    view.dispose()
    dataStore.item = null
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('store-controlled conditional slot patches without full rerender; branch-only store keys skip rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-slot-store`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const formStore = new Store({
      activeColumnId: null as string | null,
      draftTitle: '',
    }) as {
      activeColumnId: string | null
      draftTitle: string
    }

    const KanbanColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import formStore from './form-store'

        export default class KanbanColumn extends Component {
          template({ column }) {
            const isAdding = formStore.activeColumnId === column.id
            return (
              <div class="col">
                <div class="header">{column.title}</div>
                {isAdding ? (
                  <div class="add-form">
                    <input type="text" value={formStore.draftTitle} />
                  </div>
                ) : (
                  <button class="add-btn">Add task</button>
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/KanbanColumn.jsx',
      'KanbanColumn',
      { Component, formStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new KanbanColumn({ column: { id: 'col-1', title: 'Backlog' } })
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.add-btn'), 'initially shows add button')
    assert.ok(!view.el.querySelector('.add-form'), 'initially no add form')

    let rerenderCount = 0
    const origRender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      rerenderCount++
      return origRender()
    }

    // Toggle conditional slot by changing activeColumnId
    formStore.activeColumnId = 'col-1'
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.add-form'), 'add form should appear after store change')
    assert.ok(!view.el.querySelector('.add-btn'), 'add button should be gone')
    assert.equal(rerenderCount, 0, 'toggling conditional slot via store should NOT trigger full rerender')

    // Type into draft — branch-only store key should not cause rerender
    formStore.draftTitle = 'New task'
    await flushMicrotasks()
    assert.equal(rerenderCount, 0, 'changing draftTitle (branch-only store key) should NOT trigger full rerender')

    // Toggle back
    formStore.activeColumnId = null
    await flushMicrotasks()
    assert.ok(view.el.querySelector('.add-btn'), 'add button should reappear')
    assert.ok(!view.el.querySelector('.add-form'), 'add form should be gone')
    assert.equal(rerenderCount, 0, 'toggling slot back should NOT trigger full rerender')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('local state attribute bindings and conditional slot patch without full rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `local-state-attrs-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const CopyButton = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CopyButton extends Component {
          copied = false

          doCopy() {
            this.copied = true
          }

          resetCopy() {
            this.copied = false
          }

          template() {
            const copied = this.copied
            return (
              <div class="wrapper">
                <button
                  class={\`copy-btn\${copied ? ' copied' : ''}\`}
                  title={copied ? 'Copied!' : 'Copy'}
                  click={() => this.doCopy()}
                >
                  <svg viewBox="0 0 24 24">
                    {copied ? (
                      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="green" />
                    ) : (
                      <path d="M16 1H6v12h2V3h8zm3 4H10v14h9V5z" fill="gray" />
                    )}
                  </svg>
                </button>
              </div>
            )
          }
        }
      `,
      '/virtual/CopyButton.jsx',
      'CopyButton',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new CopyButton()
    view.render(root)
    await flushMicrotasks()

    let rerenders = 0
    const origRender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      rerenders++
      return origRender()
    }

    const btn = root.querySelector('button') as HTMLElement
    assert.ok(btn, 'button exists')
    assert.equal(btn.className, 'copy-btn', 'initial class has no "copied"')
    assert.equal(btn.getAttribute('title'), 'Copy', 'initial title is "Copy"')

    const svgPath = root.querySelector('svg path') as SVGPathElement
    assert.ok(svgPath, 'svg path exists')
    assert.equal(svgPath.getAttribute('fill'), 'gray', 'initial icon is gray')

    const btnRef = btn
    const wrapperRef = root.querySelector('.wrapper') as HTMLElement

    view.doCopy()
    await flushMicrotasks()

    assert.equal(rerenders, 0, 'no full rerender after state change')
    assert.equal(btn.className, 'copy-btn copied', 'class updated to include "copied"')
    assert.equal(btn.getAttribute('title'), 'Copied!', 'title updated to "Copied!"')

    const svgPathAfter = root.querySelector('svg path') as SVGPathElement
    assert.ok(svgPathAfter, 'svg path still exists after state change')
    assert.equal(svgPathAfter.getAttribute('fill'), 'green', 'icon switched to green checkmark')

    assert.equal(root.querySelector('button'), btnRef, 'button DOM node preserved')
    assert.equal(root.querySelector('.wrapper'), wrapperRef, 'wrapper DOM node preserved')

    view.resetCopy()
    await flushMicrotasks()

    assert.equal(rerenders, 0, 'no full rerender after resetting state')
    assert.equal(btn.className, 'copy-btn', 'class back to no "copied"')
    assert.equal(btn.getAttribute('title'), 'Copy', 'title back to "Copy"')

    const svgPathReset = root.querySelector('svg path') as SVGPathElement
    assert.equal(svgPathReset.getAttribute('fill'), 'gray', 'icon back to gray')
    assert.equal(root.querySelector('button'), btnRef, 'button still same DOM node')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional slot with local-state destructured guard renders without ReferenceError', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-local-destr`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const EditableItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class EditableItem extends Component {
          editing = false
          editText = ''

          startEditing() {
            this.editing = true
            this.editText = this.props.label
          }

          handleInput(e) {
            this.editText = e.target.value
          }

          template({ label }) {
            const { editing, editText } = this
            return (
              <li class={\`item \${editing ? 'editing' : ''}\`}>
                <span class="label">{label}</span>
                {editing && <input class="edit-input" type="text" value={editText} input={this.handleInput} />}
              </li>
            )
          }
        }
      `,
      '/virtual/EditableItemCond.jsx',
      'EditableItem',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const item = new EditableItem({ label: 'Buy groceries' })
    item.render(root)
    await flushMicrotasks()

    assert.ok(item.el, 'item rendered without constructor ReferenceError')
    assert.ok(!item.el.querySelector('.edit-input'), 'edit input absent when not editing')

    item.startEditing()
    await flushMicrotasks()

    assert.ok(item.el.className.includes('editing'), 'editing class added')
    const editInput = item.el.querySelector('.edit-input') as any
    assert.ok(editInput, 'edit input appears after startEditing')
    assert.equal(
      editInput.getAttribute('value'),
      'Buy groceries',
      'edit input value must reflect the label set in startEditing',
    )

    item.editText = 'Buy milk'
    await flushMicrotasks()

    const updatedInput = item.el.querySelector('.edit-input') as any
    assert.ok(updatedInput, 'edit input still present after editText change')
    assert.equal(
      updatedInput.getAttribute('value'),
      'Buy milk',
      'edit input value must update when editText changes while slot is visible',
    )

    item.dispose()
  } finally {
    restoreDom()
  }
})

test('conditional slot index mismatch: local-var conditional must not be toggled by this.xxx conditional', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-slot-index`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class ItemStore extends Store {
      item = { description: 'A real description' }
    }

    const itemStore = new ItemStore()

    const Panel = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Panel extends Component {
          openDropdown = null

          template() {
            const item = itemStore.item
            const desc = item.description || ''

            return (
              <div class="panel">
                <div class="left">
                  {desc && <div class="desc">{desc}</div>}
                  {!desc && <p class="no-desc">No description</p>}
                </div>
                <div class="right">
                  {this.openDropdown && <div class="overlay">overlay</div>}
                  {this.openDropdown === 'status' && <div class="dropdown">dropdown</div>}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/Panel.jsx',
      'Panel',
      { Component, itemStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const comp = new Panel()
    comp.render(root)
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.desc'), 'description must be visible initially')
    assert.ok(!comp.el.querySelector('.no-desc'), 'placeholder must be hidden initially')
    assert.ok(!comp.el.querySelector('.overlay'), 'overlay must be hidden initially')
    assert.ok(!comp.el.querySelector('.dropdown'), 'dropdown must be hidden initially')

    comp.openDropdown = 'status'
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.overlay'), 'overlay must appear when dropdown opens')
    assert.ok(comp.el.querySelector('.dropdown'), 'dropdown must appear when dropdown opens')
    assert.ok(
      comp.el.querySelector('.desc'),
      'description must STILL be visible after opening dropdown (slot index mismatch bug)',
    )

    comp.openDropdown = null
    await flushMicrotasks()

    assert.ok(!comp.el.querySelector('.overlay'), 'overlay must disappear when dropdown closes')
    assert.ok(!comp.el.querySelector('.dropdown'), 'dropdown must disappear when dropdown closes')
    assert.ok(comp.el.querySelector('.desc'), 'description must STILL be visible after closing dropdown (toggle bug)')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('conditional slot updates attributes from non-condition props (alt attribute bug)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-slot-attr`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ImgCard = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ImgCard extends Component {
          template({ src, name, title }: any) {
            return (
              <div class="card">
                <p class="title">{title}</p>
                {src ? <img src={src} alt={name || ''} class="avatar" /> : ''}
              </div>
            )
          }
        }
      `,
      '/virtual/ImgCard.tsx',
      'ImgCard',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const card = new ImgCard({ src: 'baby-yoda.jpg', name: 'Baby Yoda', title: 'Character' })
    card.render(root)
    await flushMicrotasks()

    const imgBefore = card.el.querySelector('img')
    assert.ok(imgBefore, 'img element must exist')
    assert.equal(imgBefore.getAttribute('src'), 'baby-yoda.jpg')
    assert.equal(imgBefore.getAttribute('alt'), 'Baby Yoda')

    card.__geaUpdateProps({ src: 'gaben.jpg', name: 'Lord Gaben', title: 'Character' })
    await flushMicrotasks()

    const imgAfter = card.el.querySelector('img')
    assert.ok(imgAfter, 'img element must still exist after prop update')
    assert.equal(imgAfter.getAttribute('src'), 'gaben.jpg', 'src must update')
    assert.equal(imgAfter.getAttribute('alt'), 'Lord Gaben', 'alt must update when name prop changes')

    card.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('ecommerce sibling pattern: single action flips cart drawer off and checkout dialog on', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cart-checkout-sibling`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class CartStore extends Store {
      cartOpen = false
      checkoutOpen = false
      openCheckout() {
        this.cartOpen = false
        this.checkoutOpen = true
      }
    }
    const store = new CartStore()

    const CartDrawer = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CartDrawer extends Component {
          template() {
            return <div class="cart-drawer">Cart</div>
          }
        }
      `,
      '/virtual/CartDrawer.jsx',
      'CartDrawer',
      { Component },
    )

    const CheckoutDialog = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CheckoutDialog extends Component {
          template() {
            return <div class="modal-box checkout">Checkout</div>
          }
        }
      `,
      '/virtual/CheckoutDialog.jsx',
      'CheckoutDialog',
      { Component },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'
        import CartDrawer from './CartDrawer.jsx'
        import CheckoutDialog from './CheckoutDialog.jsx'

        export default class App extends Component {
          template() {
            return (
              <div class="store-layout">
                {store.cartOpen && <CartDrawer />}
                {store.checkoutOpen && <CheckoutDialog />}
              </div>
            )
          }
        }
      `,
      '/virtual/CartCheckoutApp.jsx',
      'App',
      { Component, store, CartDrawer, CheckoutDialog },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = new App()
    app.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.cart-drawer'), null)
    assert.equal(root.querySelector('.modal-box'), null)

    store.cartOpen = true
    await flushMicrotasks()
    assert.ok(root.querySelector('.cart-drawer'), 'cart should mount when cartOpen')
    assert.equal(root.querySelector('.modal-box'), null)

    store.openCheckout()
    await flushMicrotasks()

    assert.equal(root.querySelector('.cart-drawer'), null, 'cart should unmount when opening checkout')
    assert.ok(root.querySelector('.modal-box'), 'checkout dialog should mount after openCheckout')

    app.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
