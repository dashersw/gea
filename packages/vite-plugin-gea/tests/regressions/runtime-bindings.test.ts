import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE } from '../../../gea/src/symbols'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'

test('runtime-only bindings update when state changes after render', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-binding`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const RuntimeBindingComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class RuntimeBindingComponent extends Component {
          count = 0

          template() {
            return <div class="count">{this.count}</div>
          }
        }
      `,
      '/virtual/RuntimeBindingComponent.jsx',
      'RuntimeBindingComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new RuntimeBindingComponent()
    component.render(root)

    assert.equal(component.el.textContent?.trim(), '0')

    component.count = 1
    await flushMicrotasks()

    assert.equal(component.el.textContent?.trim(), '1')
    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('simple conditional class bindings toggle on and off', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-simple-class-toggle`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ToggleClassComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ToggleClassComponent extends Component {
          active = false

          template() {
            return <div class={this.active ? 'panel active' : 'panel'}>Panel</div>
          }
        }
      `,
      '/virtual/ToggleClassComponent.jsx',
      'ToggleClassComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ToggleClassComponent()
    component.render(root)

    assert.equal(component.el.className, 'panel')

    component.active = true
    await flushMicrotasks()
    assert.equal(component.el.className, 'panel active')

    component.active = false
    await flushMicrotasks()
    assert.equal(component.el.className, 'panel')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped transition style attributes update when array is replaced with new keys', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mapped-transition-style`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const AnimatedList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class AnimatedList extends Component {
          items = [{ id: 'toast-hidden', label: 'toast', visible: false }]

          template() {
            return (
              <div class="items">
                {this.items.map(item => (
                  <div
                    key={item.id}
                    class="toast"
                    style={
                      item.visible
                        ? 'opacity: 1; transform: translateY(0); transition: opacity 150ms ease, transform 150ms ease;'
                        : null
                    }
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/AnimatedList.jsx',
      'AnimatedList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new AnimatedList()
    component.render(root)
    await flushMicrotasks()

    const rowBefore = component.el.querySelector('.toast') as HTMLElement
    assert.equal(rowBefore.getAttribute('style'), null)

    // Replace array with new key to force new row creation (v2 keyed lists
    // capture item references in closures at creation time)
    component.items = [{ id: 'toast-visible', label: 'toast', visible: true }]
    await flushMicrotasks()

    const rowVisible = component.el.querySelector('.toast') as HTMLElement
    assert.match(rowVisible.getAttribute('style') || '', /transition:\s*opacity 150ms ease, transform 150ms ease;/)
    assert.match(rowVisible.getAttribute('style') || '', /opacity:\s*1/)
    assert.match(rowVisible.getAttribute('style') || '', /transform:\s*translateY\(0\)/)

    component.items = [{ id: 'toast-hidden-2', label: 'toast', visible: false }]
    await flushMicrotasks()

    const rowAfter = component.el.querySelector('.toast') as HTMLElement
    assert.equal(rowAfter.getAttribute('style'), null)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('single array item property updates refresh mapped class bindings via array replacement', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-todo-completed-class`
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
      '/virtual/TodoListCompletedClass.jsx',
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

    // Trigger toggle via array replacement with new key (v2 keyed lists
    // capture item references in closures at creation time)
    view.toggle(0)
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

test('store-dependent class binding on root element patches without full rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-store-class-no-rerender`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const HighlightStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class HighlightStore extends Store {
          highlightedId = null as string | null
        }
      `,
      '/virtual/highlight-store.ts',
      'HighlightStore',
      { Store },
    )
    const store = new HighlightStore()

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ id, title }) {
            const isHighlighted = store.highlightedId === id
            return (
              <div class={\`column \${isHighlighted ? 'highlighted' : ''}\`}>
                <h2>{title}</h2>
                <p>Static content</p>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new MyColumn()
    view[GEA_SET_PROPS]({ id: () => 'col1', title: () => 'Column One' })
    view.render(root)

    const elBefore = view.el
    const h2Before = view.el.querySelector('h2')
    assert.ok(elBefore)
    assert.ok(h2Before)
    assert.match(elBefore.className, /column/)
    assert.doesNotMatch(elBefore.className, /highlighted/)

    store.highlightedId = 'col1'
    await flushMicrotasks()

    assert.match(view.el.className, /highlighted/)
    assert.equal(view.el, elBefore, 'root element must be preserved (no full rerender)')
    assert.equal(view.el.querySelector('h2'), h2Before, 'child h2 must be preserved')

    store.highlightedId = 'col2'
    await flushMicrotasks()

    assert.doesNotMatch(view.el.className, /highlighted/)
    assert.equal(view.el, elBefore, 'root element must still be preserved after un-highlighting')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('disabled={false} on a <button> must NOT produce a disabled attribute in the DOM', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-button-disabled-false`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Button = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Button extends Component {
          template({ disabled, variant }) {
            return (
              <button disabled={disabled} class={variant || 'default'}>
                Click me
              </button>
            )
          }
        }
      `,
      '/virtual/Button.jsx',
      'Button',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const btn = new Button()
    btn[GEA_SET_PROPS]({ disabled: () => false, variant: () => 'default' })
    btn.render(root)
    await flushMicrotasks()

    const el = btn.el as HTMLElement
    assert.ok(el, 'button element must exist')
    assert.equal(
      el.hasAttribute('disabled'),
      false,
      'button with disabled={false} must NOT have the disabled attribute',
    )

    btn.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('static style object renders as inline CSS on the DOM element', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-static-style-obj`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const StyledBox = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class StyledBox extends Component {
          template() {
            return <div style={{ backgroundColor: 'red', padding: '10px', fontSize: '14px' }}>Box</div>
          }
        }
      `,
      '/virtual/StyledBox.jsx',
      'StyledBox',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new StyledBox()
    component.render(root)
    await flushMicrotasks()

    const el = component.el as HTMLElement
    assert.ok(el, 'Component element should exist')
    assert.ok(!el.getAttribute('style')?.includes('[object Object]'), 'Style should not be [object Object]')
    assert.ok(
      el.style.backgroundColor === 'red' || el.getAttribute('style')?.includes('background-color'),
      'background-color should be applied',
    )

    component.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('dynamic style object renders and updates CSS on state change', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-dyn-style-obj`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const DynStyle = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class DynStyle extends Component {
          textColor = 'blue'

          template() {
            return <div style={{ color: this.textColor }}>Colorful</div>
          }
        }
      `,
      '/virtual/DynStyle.jsx',
      'DynStyle',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new DynStyle()
    component.render(root)
    await flushMicrotasks()

    const el = component.el as HTMLElement
    assert.ok(el, 'Component element should exist')
    assert.ok(!el.getAttribute('style')?.includes('[object Object]'), 'Style should not be [object Object]')

    component.textColor = 'green'
    await flushMicrotasks()

    const styleAfter = el.getAttribute('style') || el.style.cssText
    assert.ok(
      styleAfter.includes('green') || el.style.color === 'green',
      `Style should reflect updated color "green", got style: "${styleAfter}", color: "${el.style.color}"`,
    )

    component.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
