import assert from 'node:assert/strict'
import test from 'node:test'
import { transformComponentSource } from './plugin-helpers'

test('root prop callback events do not leak as html attributes', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class OptionItem extends Component {
      template({ label, onSelect }) {
        return <div class="option-item" click={onSelect}>{label}</div>
      }
    }
  `)

  assert.match(output, /get events\(\)/)
  assert.match(output, /this\.props\["onSelect"\]|this\.props\.onSelect/)
  assert.doesNotMatch(output, /setAttribute\("click"/)
  assert.doesNotMatch(output, /removeAttribute\("click"/)
  assert.doesNotMatch(output, / click="\$\{/)
})

test('prop text patch preserves surrounding template text', () => {
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

  assert.match(output, /const __boundValue = `[\s\S]*Pay \$\$\$\{value\}[\s\S]*`;/)
  // `${value}` does not read properties off value; nullish guard would skip clearing text when value becomes null.
  assert.doesNotMatch(output, /if \(!\(value === null \|\| value === undefined\)\)/)
  assert.match(output, /textContent = __boundValue/)
  assert.doesNotMatch(output, /__geaPatchProp_totalPrice\(value\)[\s\S]*textContent = value/)
})

test('prop text patch keeps nullish guard when derived expr reads properties of value', () => {
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

  assert.match(output, /__onPropChange/)
  assert.match(output, /if \(!\(value === null \|\| value === undefined\)\)/)
})

test('generated selectors distinguish repeated typed inputs', () => {
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

  const selectors = Array.from(output.matchAll(/this\.\$\("([^"]+)"\)/g)).map((match) => match[1])
  const bindingIds = Array.from(output.matchAll(/getElementById\([^+]*\+\s*["']-([^"']+)["']\)/g)).map(
    (match) => match[1],
  )
  assert.equal(new Set(selectors).size >= 2 || new Set(bindingIds).size >= 2, true)
})

test('multiple handlers on one element reuse a single generated selector id', () => {
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

  const selectorIds = output.match(/input:\s*\{[\s\S]*?ev(\d+)[\s\S]*?keydown:\s*\{[\s\S]*?ev(\d+)/)
  assert.ok(selectorIds, 'expected both event handlers to be emitted')
  assert.equal(selectorIds[1], selectorIds[2], 'same element should reuse one generated selector across handlers')
  assert.doesNotMatch(output, /id="\$\{this\.id \+ "-ev\d+"\}"\s+id="\$\{this\.id \+ "-ev\d+"\}"/)
  assert.doesNotMatch(output, /data-gea-event="ev\d+"\s+data-gea-event="ev\d+"/)
})

test('conditional root html event handlers are preserved inside logical branches', () => {
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

  assert.match(output, /showBack && `<button class="btn btn-secondary" id="\$\{this\.id \+ "-ev\d+"\}">/)
  assert.match(output, /get events\(\)\s*\{[\s\S]*click:\s*\{/)
})

test('inline event handlers capture template-local setup statements', () => {
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

  assert.match(output, /template\(props\) \{[\s\S]*return `<button/)
  assert.doesNotMatch(
    output,
    /template\(props\) \{[\s\S]*onPay[\s\S]*return `<button/,
    'onPay should be pruned from template',
  )
  assert.match(
    output,
    /__event_click_0\(e, targetComponent\) \{[\s\S]*const \{\s*value,\s*onPay\s*\} = this\.props;[\s\S]*const isValid = value\.trim\(\)\.length > 0;[\s\S]*isValid && onPay\(\);/,
  )
})

test('template-scoped prop variables inside .map() are rewritten to this.props', () => {
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

  const renderMethod = output.match(/render\w*Item\(opt\)\s*\{([\s\S]*?)\n  \}/)
  assert.ok(renderMethod, 'render item method must be generated')
  const renderBody = renderMethod[1]
  assert.match(renderBody, /=\s*this\.props;/, 'map item render must read props from this.props')
  assert.match(renderBody, /\bvalue\b/, 'value must be in map item render')
  assert.match(renderBody, /\bisMulti\b/, 'isMulti must be in map item render')
  assert.match(renderBody, /\.trim\(\)\}/, 'dynamic class in map item should be trimmed')
})

test('map callback render method includes template-local setup statements for free variables', () => {
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

  const renderMethod = output.match(/render\w+Item\(comment\)\s*\{([\s\S]*?)\n  \}/)
  assert.ok(renderMethod, 'render item method must be generated')
  const renderBody = renderMethod![1]
  assert.match(renderBody, /issueStore\.issue/, 'render method must re-derive issue from store')
})
