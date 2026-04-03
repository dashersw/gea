import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { transformComponentSource, transformWithPlugin, geaPlugin } from './plugin-helpers'

test('conditional child components are instantiated lazily', () => {
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

  assert.match(output, /this\._childView/)
  assert.match(output, /store\.show && store\.payload && `\$\{this\._childView\}`/)
  // Conditional children use lazy getters instead of eager constructor assignment
  assert.match(output, /get _childView\(\)/, 'should generate a lazy getter for conditional child')
  assert.match(output, /__lazy_childView/, 'lazy getter should use a backing field')
  assert.match(output, /this\[GEA_CHILD\]\(ChildView/, 'lazy getter should call [GEA_CHILD] on first access')
  assert.doesNotMatch(output, /__ensureChild_childView/)
})

test('conditional imported map state subscriptions include edit-mode flags', () => {
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

  assert.match(output, /(?:store|this\.__rawStore|__rs)\.editingId/)
  assert.match(output, /(?:store|this\.__rawStore|__rs)\.editingValue/)
})

test('generated observer and buildProps methods include early-return guard from template', () => {
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

  const buildPropsMatch = output.match(/__buildProps_\w+\([^)]*\)\s*\{[\s\S]*?\n {2}\}/)

  assert.ok(buildPropsMatch, '__buildProps method should be generated')
  assert.match(buildPropsMatch![0], /issue/, 'buildProps method should reference issue')
  assert.match(
    buildPropsMatch![0],
    /(!issue|issue\s*==\s*null|issue\s*===\s*null|\?\.)/,
    'buildProps method must include a null guard for issue',
  )
})

test('early-return guard in __buildProps re-derives template-local variable from store', () => {
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

  const buildPropsMatch = output.match(/__buildProps_\w+\([^)]*\)\s*\{[\s\S]*?\n {2}\}/)
  assert.ok(buildPropsMatch, '__buildProps method should be generated')

  const body = buildPropsMatch![0]
  assert.match(
    body,
    /const project = projectStore\.project/,
    'buildProps must re-derive the template-local variable before the guard',
  )
  assert.match(body, /if \(!project\)/, 'buildProps must include the null guard using the local variable')

  const deriveLine = body.indexOf('const project')
  const guardLine = body.indexOf('if (!project)')
  assert.ok(deriveLine < guardLine, 'variable derivation must come before the guard that uses it')
})

test('early-return guard works with destructured store variables in __buildProps', () => {
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

  const buildPropsMatch = output.match(/__buildProps_\w+\([^)]*\)\s*\{[\s\S]*?\n {2}\}/)
  assert.ok(buildPropsMatch, '__buildProps method should be generated')

  const body = buildPropsMatch![0]
  assert.match(
    body,
    /const \{\s*project\s*\} = projectStore/,
    'buildProps must re-derive the destructured variable before the guard',
  )
  assert.match(body, /if \(!project\)/, 'buildProps must include the null guard')
})

test('__buildProps_* omits early-return guard when props do not reference guard variable', () => {
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

  const buildPropsMatch = output.match(/__buildProps_\w+\([^)]*\)\s*\{[\s\S]*?\n {2}\}/)
  assert.ok(buildPropsMatch, '__buildProps method should be generated')

  const body = buildPropsMatch![0]
  assert.doesNotMatch(
    body,
    /if \(!project\)/,
    'guard must NOT be injected when props are static and do not reference the guard variable',
  )
  assert.match(body, /type: "settings"/, 'static props should always be returned')
})

test('constructor-inlined conditional slot init is guarded when template has early return', () => {
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

  assert.match(output, /\[GEA_REGISTER_COND\]/, 'should generate [GEA_REGISTER_COND] calls')

  const ctorStart = output.indexOf('constructor(')
  const templateStart = output.indexOf('  template()')
  assert.ok(ctorStart >= 0 && templateStart > ctorStart, 'expected constructor before template()')
  const ctorBody = output.slice(ctorStart, templateStart)
  assert.match(
    ctorBody,
    /issue\?\.description/,
    'constructor-inlined cond-slot setup must optionalize store reads that precede the template early-return guard',
  )
  assert.doesNotMatch(
    ctorBody,
    /\btry\s*\{/,
    'constructor must not swallow init errors with try/catch; use safe reads instead',
  )
})

test('compound || early-return guard optionalizes constructor-inlined conditional slot init', () => {
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

  assert.match(output, /\[GEA_REGISTER_COND\]/, 'should generate [GEA_REGISTER_COND] calls')

  const ctorStart = output.indexOf('constructor(')
  const templateStart = output.indexOf('  template()')
  assert.ok(ctorStart >= 0 && templateStart > ctorStart, 'expected constructor before template()')
  const ctorBody = output.slice(ctorStart, templateStart)
  assert.match(
    ctorBody,
    /issue\?\.description/,
    'compound || guard must still optionalize store reads in constructor-inlined cond-slot setup',
  )
})

test('conditional slot getTruthyHtml includes template locals used by branch (e.g. filtered)', async () => {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  assert.ok(transform)
  const src = `
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
`
  const result = await transform!.call({} as never, src, '/T.jsx')
  const code = typeof result === 'string' ? result : (result as { code: string }).code
  assert.match(
    code,
    /\[GEA_REGISTER_COND\]\(0, "c0"[\s\S]*?const filtered[\s\S]*?return[\s\S]*?filtered\.map/,
    'dropdown branch HTML must hoist const filtered from template into getTruthyHtml closure',
  )
})

test('nested JSX ternary: outer falsy HTML keeps full inner conditional (compiler extractHtmlTemplatesFromConditional)', () => {
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
  const slotIdx = output.indexOf('[GEA_REGISTER_COND](0')
  assert.ok(slotIdx >= 0, 'expected one conditional slot')
  const slotRegion = output.slice(slotIdx, slotIdx + 5000)
  assert.match(
    slotRegion,
    /authStore\.isAuthenticated\s*\?/,
    'outer falsy branch must be the entire inner ternary, not only the inner consequent HTML',
  )
  assert.match(slotRegion, /Not authenticated branch/, 'inner falsy branch must appear in slot HTML')
  assert.match(slotRegion, /Authenticated branch/, 'inner truthy branch must appear in slot HTML')
})

test('conditional slot analyze order matches transform (nested ternary before sibling &&)', async () => {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  assert.ok(transform)
  const src = `
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
`
  const result = await transform!.call({} as never, src, '/SlotOrder.jsx')
  const code = typeof result === 'string' ? result : (result as { code: string }).code
  assert.match(
    code,
    /\[GEA_REGISTER_COND\]\(0, "c0",\s*\(\)\s*=>\s*\{[^}]*return this\.props\.renderValue;/,
    'slot c0 must be the inner renderValue ternary, not the outer isOpen &&',
  )
  assert.match(
    code,
    /\[GEA_REGISTER_COND\]\(1, "c1",\s*\(\)\s*=>\s*\{[^}]*return this\.isOpen;/,
    'slot c1 must be isOpen && dropdown',
  )
})

test('conditional slot with imported store boolean registers observer', async () => {
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

    // The compiled output should use conditional slot patching for store-driven conditionals
    assert.match(output!, /\[GEA_REGISTER_COND\]/, 'should register conditional slots for store-driven conditionals')
    assert.match(output!, /\[GEA_PATCH_COND\]/, 'should patch conditional slots reactively')
    // Must register an observer for cartOpen on the store
    assert.match(output!, /\[GEA_OBSERVE\]\(store, \["cartOpen"\]/, 'should register observer for cartOpen')
    assert.match(output!, /\[GEA_OBSERVE\]\(store, \["checkoutOpen"\]/, 'should register observer for checkoutOpen')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('conditional empty vs store html map: template() must not embed gestureLog.map (list DOM is [GEA_APPLY_LIST_CHANGES] only)', () => {
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

  assert.match(output, /\[GEA_REGISTER_COND\]\(/)
  assert.match(output, /\[GEA_APPLY_LIST_CHANGES\]/)
  const tmpl = output.match(/template\([^)]*\)\s*\{([\s\S]*)\n {2}\}/)
  assert.ok(tmpl, 'template method should exist')
  assert.doesNotMatch(
    tmpl![1],
    /gestureLog\.map\(/,
    'store-backed list inside conditional slot must not serialize .map() into template() (duplicates [GEA_APPLY_LIST_CHANGES] rows)',
  )
})
