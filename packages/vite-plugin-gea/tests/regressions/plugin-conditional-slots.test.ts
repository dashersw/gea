/**
 * Conditional slot / child rendering regression tests — v2 edition.
 *
 * In v2, conditional rendering uses:
 *   - `conditional()` for `&&` and ternary patterns
 *   - `mount()` for child component instantiation
 *   - `reactiveContent()` for complex dynamic content (e.g., prop-based render functions)
 *   - `keyedList()` for array maps in conditional branches
 *
 * There are no `[GEA_REGISTER_COND]`, `[GEA_PATCH_COND]`, `[GEA_APPLY_LIST_CHANGES]`,
 * `__ensureChild_*`, or `[GEA_CHILD]` in v2.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { transformComponentSource, transformWithPlugin, geaPlugin } from './plugin-helpers'

test('conditional child components use conditional() + mount()', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './store.ts'
    import ChildView from './ChildView.jsx'

    export default class ParentView extends Component {
      template() {
        return (
          <div>
            {store.show && store.payload && <ChildView payload={store.payload} />}
          </div>
        )
      }
    }
  `)

  // v2 uses conditional() for && patterns and mount for child components
  assert.match(output, /conditional\(/)
  assert.match(output, /mount\(ChildView/)
  assert.match(output, /store\.show && store\.payload/)
})

test('conditional imported map state subscriptions include store access', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <div>
            {store.todos.map(todo => (
              <div key={todo.id}>
                {store.editingId === todo.id ? (
                  <input value={store.editingValue} />
                ) : (
                  <span>{todo.text}</span>
                )}
              </div>
            ))}
          </div>
        )
      }
    }
  `)

  // v2 uses conditional() inside keyedList factory for ternary
  assert.match(output, /keyedList\(/)
  assert.match(output, /conditional\(/)
  assert.match(output, /store\.editingId/)
  assert.match(output, /store\.editingValue/)
})

test('early-return guard in GEA_CREATE_TEMPLATE with child component', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'
    import Spinner from './Spinner.jsx'
    import MySelect from './MySelect.jsx'

    export default class IssueDetails extends Component {
      template() {
        const { issue } = issueStore

        if (!issue) return <Spinner />

        const priority = issue.priority || 'medium'

        return (
          <div>
            <MySelect value={priority} />
          </div>
        )
      }
    }
  `)

  // v2 uses early-return in [GEA_CREATE_TEMPLATE]()
  assert.match(output, /\[GEA_CREATE_TEMPLATE\]\(\)/)
  assert.match(output, /if \(!issueStore\.issue\)/)
  assert.match(output, /mount\(Spinner/)
  assert.match(output, /mount\(MySelect/)
})

test('early-return guard re-derives template-local variable from store in reactive props', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Icon from './Icon.jsx'

    export default class ProjectSettings extends Component {
      template() {
        const project = projectStore.project

        if (!project) return <div>Loading...</div>

        return (
          <div>
            <Icon type={project.icon} size={20} />
          </div>
        )
      }
    }
  `)

  // v2 uses early-return guard
  assert.match(output, /if \(!projectStore\.project\)/)
  // Reactive props reference the store directly for tracking
  assert.match(output, /mount\(Icon/)
  assert.match(output, /projectStore\.project\.icon/)
})

test('early-return guard works with destructured store variables', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Icon from './Icon.jsx'

    export default class ProjectSettings extends Component {
      template() {
        const { project } = projectStore

        if (!project) return <div>Loading...</div>

        return (
          <div>
            <Icon type={project.icon} size={20} />
          </div>
        )
      }
    }
  `)

  // v2 early-return guard
  assert.match(output, /if \(!projectStore\.project\)/)
  assert.match(output, /mount\(Icon/)
})

test('static-only child props do not need guard in v2 (reactive getters handle it)', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Icon from './Icon.jsx'

    export default class ProjectSettings extends Component {
      template() {
        const project = projectStore.project

        if (!project) return <div>Loading...</div>

        return (
          <div>
            <span>{project.name}</span>
            <Icon type="settings" size={20} />
          </div>
        )
      }
    }
  `)

  // v2 uses early-return guard
  assert.match(output, /if \(!projectStore\.project\)/)
  // Static props (type="settings") are still passed as reactive getters
  assert.match(output, /mount\(Icon/)
})

test('conditional slots with self-state use conditional() with signal-backed field', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'

    export default class IssueDetails extends Component {
      isEditing = false

      template() {
        const { issue } = issueStore

        if (!issue) return <div>Loading</div>

        const desc = issue.description || ''

        return (
          <div>
            {this.isEditing && <textarea value={desc} />}
            {!this.isEditing && desc && <p>{desc}</p>}
            {!this.isEditing && !desc && <p>Add a description...</p>}
          </div>
        )
      }
    }
  `)

  // v2 compiles isEditing to signal-backed field and uses conditional()
  assert.match(output, /conditional\(/)
  assert.match(output, /this\.isEditing/)
  // Self-state fields become signals
  assert.match(output, /signal\(false\)/)
})

test('compound || early-return guard uses early return in GEA_CREATE_TEMPLATE', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'

    export default class IssueDetails extends Component {
      isEditing = false

      template() {
        const { isLoading, issue } = issueStore

        if (isLoading || !issue) return <div>Loading</div>

        const desc = issue.description || ''

        return (
          <div>
            {this.isEditing && <textarea value={desc} />}
            {!this.isEditing && desc && <p>{desc}</p>}
          </div>
        )
      }
    }
  `)

  // v2 uses early-return guard
  assert.match(output, /\[GEA_CREATE_TEMPLATE\]\(\)/)
  assert.match(output, /issueStore/)
  assert.match(output, /conditional\(/)
})

test('conditional slot with filtered template local uses keyedList inside conditional', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    export default class T extends Component {
      isOpen = false
      template({ options }) {
        const filtered = options.filter((o) => o.k)
        return (
          <div>
            {this.isOpen && <div class="d">{filtered.map((x) => <span key={x.id}>{x.k}</span>)}</div>}
          </div>
        )
      }
    }
  `)

  // v2 uses conditional() with keyedList inside the truthy branch
  assert.match(output, /conditional\(/)
  assert.match(output, /this\.isOpen/)
  assert.match(output, /keyedList\(/)
  // The filter should be preserved in the keyedList source
  assert.match(output, /\.filter\(/)
})

test('nested JSX ternary: outer ternary uses conditional()', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import authStore from './store'
    export default class C extends Component {
      template() {
        return (
          <div>
            {authStore.isLoading ? (
              <p>Loading</p>
            ) : authStore.isAuthenticated ? (
              <p>Authenticated branch</p>
            ) : (
              <p>Not authenticated branch</p>
            )}
          </div>
        )
      }
    }
  `)

  // v2 uses conditional() for ternary patterns
  assert.match(output, /conditional\(/)
  assert.match(output, /authStore\.isLoading/)
})

test('conditional slot analyze: ternary before sibling && both use conditional()', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    export default class SlotOrder extends Component {
      isOpen = false
      template({ renderValue, value, options }) {
        return (
          <div class="root">
            <div class="inner">
              {renderValue ? renderValue(value, options) : <span class="fallback">x</span>}
            </div>
            {this.isOpen && <div class="dropdown">open</div>}
          </div>
        )
      }
    }
  `)

  // v2 uses reactiveContent for the ternary with render function
  assert.match(output, /reactiveContent\(/)
  // And conditional() for the isOpen && pattern
  assert.match(output, /conditional\(/)
  assert.match(output, /this\.isOpen/)
})

test('conditional slot with imported store boolean uses conditional() + mount()', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-cond-slot-'))
  try {
    const storePath = join(dir, 'store.ts')
    await writeFile(
      storePath,
      `
import { Store } from '@geajs/core'
class MyStore extends Store {
  cart = []
  cartOpen = false
  checkoutOpen = false
  selectedCategory = 'All'
  get cartCount() { return this.cart.reduce((sum, i) => sum + i.quantity, 0) }
  get filteredProducts() { return this.products }
  openCart() { this.cartOpen = true }
  closeCart() { this.cartOpen = false }
}
export default new MyStore()
      `.trim(),
    )

    const drawerPath = join(dir, 'cart-drawer.tsx')
    await writeFile(
      drawerPath,
      `
import { Component } from '@geajs/core'
export default class CartDrawer extends Component {
  template() { return <div class="cart-drawer">Cart</div> }
}
      `.trim(),
    )

    const dialogPath = join(dir, 'checkout-dialog.tsx')
    await writeFile(
      dialogPath,
      `
import { Component } from '@geajs/core'
export default class CheckoutDialog extends Component {
  template() { return <div class="checkout">Checkout</div> }
}
      `.trim(),
    )

    const componentPath = join(dir, 'App.jsx')
    const output = await transformWithPlugin(
      `
import { Component } from '@geajs/core'
import store from './store'
import CartDrawer from './cart-drawer'
import CheckoutDialog from './checkout-dialog'

export default class App extends Component {
  template() {
    return (
      <div>
        <button click={store.openCart}>Open Cart</button>
        <p>{store.cartCount} items</p>
        {store.cartOpen && <CartDrawer />}
        {store.checkoutOpen && <CheckoutDialog />}
      </div>
    )
  }
}
      `,
      componentPath,
    )
    assert.ok(output, 'should produce compiled output')

    // v2 uses conditional() for store-driven conditionals
    assert.match(output!, /conditional\(/, 'should use conditional() for store-driven conditionals')
    assert.match(output!, /store\.cartOpen/, 'should reference store.cartOpen in condition')
    assert.match(output!, /store\.checkoutOpen/, 'should reference store.checkoutOpen in condition')
    // Child components via mount
    assert.match(output!, /mount\(CartDrawer/, 'should mount CartDrawer')
    assert.match(output!, /mount\(CheckoutDialog/, 'should mount CheckoutDialog')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('conditional empty vs store html map: uses conditional() and keyedList()', () => {
  const output = transformComponentSource(`
    import { View } from '@geajs/mobile'
    import appStore from './app-store'

    export default class GestureLogPanel extends View {
      template() {
        return (
          <view>
            <div class="gesture-log">
              {appStore.gestureLog.length === 0 ? (
                <div class="gesture-log-empty">No gestures</div>
              ) : (
                appStore.gestureLog.map((entry) => (
                  <div key={entry.id} class="gesture-log-entry">
                    <span>{entry.gesture}</span>
                  </div>
                ))
              )}
            </div>
          </view>
        )
      }
    }
  `)

  // v2 uses conditional() for the ternary and keyedList for the map
  assert.match(output, /conditional\(/)
  assert.match(output, /keyedList\(/)
  assert.match(output, /appStore\.gestureLog/)
})
