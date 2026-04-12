import assert from 'node:assert/strict'
import test from 'node:test'
import { transformComponentSource } from './plugin-helpers'

test('root prop callback events use delegateEvent, not html attributes', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class OptionItem extends Component {
      template({ label, onSelect }) {
        return <div class="option-item" click={onSelect}>{label}</div>
      }
    }
  `)

  // v2 uses delegateEvent for click handlers
  assert.match(output, /delegateEvent\(/)
  assert.match(output, /__props\.onSelect/)
  // Should not produce setAttribute for events
  assert.doesNotMatch(output, /setAttribute\("click"/)
  assert.doesNotMatch(output, /removeAttribute\("click"/)
})

test('prop text uses reactiveText runtime helper', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class CheckoutButton extends Component {
      template({ totalPrice }) {
        return (
          <button class="btn">
            Pay $\${totalPrice}
          </button>
        )
      }
    }
  `)

  // v2 uses reactiveText() for dynamic text nodes
  assert.match(output, /reactiveText/)
  assert.match(output, /__props\.totalPrice/)
})

test('prop member access uses computation with itemSignal', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Row extends Component {
      template({ item }) {
        return (
          <span class="label">
            {item.displayName}
          </span>
        )
      }
    }
  `)

  // v2 uses itemSignal for deep property access on props
  assert.match(output, /itemSignal/)
  assert.match(output, /displayName/)
})

test('generated walkers distinguish repeated typed inputs', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class InputPair extends Component {
      constructor() {
        super()
        this.first = 'one'
        this.second = 'two'
      }

      template() {
        return (
          <form>
            <input type="text" value={this.first} />
            <input type="text" value={this.second} />
          </form>
        )
      }
    }
  `)

  // v2 uses separate walker variables (__walk0, __walk1) for distinct elements
  assert.match(output, /reactiveAttr\(__walk0, "value"/)
  assert.match(output, /reactiveAttr\(__walk1, "value"/)
  // Both must reference different state
  assert.match(output, /this\.first/)
  assert.match(output, /this\.second/)
})

test('multiple handlers on one element in map share the same DOM node', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './store.ts'

    export default class TodoList extends Component {
      template() {
        return (
          <div>
            {store.todos.map(todo => (
              <input
                key={todo.id}
                type="text"
                value={todo.text}
                input={store.setEditingValue}
                keydown={e => {
                  if (e.key === 'Enter') store.updateTodo(todo)
                }}
              />
            ))}
          </div>
        )
      }
    }
  `)

  // v2 uses keyedList for .map()
  assert.match(output, /keyedList\(/)
  // Both event handlers target the same element (__el1) via delegateEvent
  assert.match(output, /delegateEvent\(__el1, "input"/)
  assert.match(output, /delegateEvent\(__el1, "keydown"/)
})

test('conditional root html event handlers are preserved inside conditional branches', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class BackButtonView extends Component {
      template({ showBack, onBack }) {
        return (
          <div>
            {showBack && <button class="btn btn-secondary" click={onBack}>Back</button>}
          </div>
        )
      }
    }
  `)

  // v2 uses conditional() for && patterns
  assert.match(output, /conditional\(/)
  // The condition reads showBack from props
  assert.match(output, /__props\.showBack/)
  // The click handler uses delegateEvent
  assert.match(output, /delegateEvent\(/)
  assert.match(output, /__props\.onBack/)
})

test('inline event handlers are emitted as delegateEvent closures', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class PaymentForm extends Component {
      template(props) {
        const { value, onPay } = props
        const isValid = value.trim().length > 0
        return <button click={() => isValid && onPay()}>Pay</button>
      }
    }
  `)

  // v2 emits [GEA_CREATE_TEMPLATE]() with props destructuring and delegateEvent
  assert.match(output, /\[GEA_CREATE_TEMPLATE\]\(\)/)
  assert.match(output, /delegateEvent\(__el0, "click", \(\) => isValid && onPay\(\)\)/)
})

test('template-scoped prop variables inside .map() use __props reference', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class SelectOption extends Component {
      template({ options, value, isMulti }) {
        return (
          <div>
            {options.map(opt => (
              <div
                key={opt.value}
                class={\`option \${isMulti ? 'multi' : ''} \${opt.value === value ? 'selected' : ''}\`}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )
      }
    }
  `)

  // v2 uses keyedList for .map()
  assert.match(output, /keyedList\(/)
  // Inside the map callback, props are accessed via __props
  assert.match(output, /__props\.isMulti/)
  assert.match(output, /__props\.value/)
})

test('map callback with store-local setup references store directly', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'

    export default class IssueDetails extends Component {
      template() {
        const issue = issueStore.issue
        if (!issue) return <div>Loading</div>
        return (
          <div>
            {issue.comments.map(comment => (
              <div key={comment.id} data-issue={issue.id}>{comment.body}</div>
            ))}
          </div>
        )
      }
    }
  `)

  // v2 uses keyedList; the map item factory should have access to issue via issueStore
  assert.match(output, /keyedList\(/)
  assert.match(output, /issueStore/)
})

test('map event handler using only index provides index through __indexGetter', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class ItemList extends Component {
      constructor() {
        super()
        this.items = []
      }

      removeAt(idx) {
        this.items.splice(idx, 1)
      }

      template() {
        return (
          <ul>
            {this.items.map((item, index) => (
              <li key={item.id} click={() => this.removeAt(index)}>
                {item.label}
              </li>
            ))}
          </ul>
        )
      }
    }
  `)

  // v2 passes __itemGetter and __indexGetter to the keyedList factory
  assert.match(output, /keyedList\(/)
  assert.match(output, /__indexGetter/)
  assert.doesNotMatch(output, /const index = __indexGetter\(\)/)
  assert.match(output, /this\.removeAt\(__indexGetter\(\)\)/)
})

test('map event handler using only item provides item through __itemGetter', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class ItemList extends Component {
      constructor() {
        super()
        this.items = []
      }

      remove(item) {}

      template() {
        return (
          <ul>
            {this.items.map((item, index) => (
              <li key={item.id} click={() => this.remove(item)}>
                {item.label}
              </li>
            ))}
          </ul>
        )
      }
    }
  `)

  // v2 passes __itemGetter; item is derived from it
  assert.match(output, /keyedList\(/)
  assert.match(output, /__itemGetter/)
  assert.match(output, /const item = __itemGetter\(\)/)
  assert.match(output, /this\.remove\(item\)/)
})

test('map event handler using both item and index receives both getters', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class ItemList extends Component {
      constructor() {
        super()
        this.items = []
      }

      update(item, idx) {}

      template() {
        return (
          <ul>
            {this.items.map((item, index) => (
              <li key={item.id} click={() => this.update(item, index)}>
                {item.label}
              </li>
            ))}
          </ul>
        )
      }
    }
  `)

  // v2 passes both __itemGetter and __indexGetter
  assert.match(output, /keyedList\(/)
  assert.match(output, /__itemGetter/)
  assert.match(output, /__indexGetter/)
  assert.match(output, /this\.update\(item, __indexGetter\(\)\)/)
})
