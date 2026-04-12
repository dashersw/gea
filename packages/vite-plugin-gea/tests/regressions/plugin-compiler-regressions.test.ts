import assert from 'node:assert/strict'
import test from 'node:test'
import { transformComponentSource } from './plugin-helpers'

// Bug 1 (v2 equivalent): Static array .map() with child components inside a child component's
// children prop should produce keyedList for the items.
test('static array .map() with child components inside child component children uses keyedList', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import Card from './Card'
    import ListItem from './ListItem'

    const ITEMS = ['a', 'b', 'c']

    export default class App extends Component {
      template() {
        return (
          <div>
            <Card>
              <div class="list">
                {ITEMS.map((item) => (
                  <ListItem key={item} value={item} />
                ))}
              </div>
            </Card>
          </div>
        )
      }
    }
  `,
  )

  // v2 compiles .map() to keyedList
  assert.match(output, /keyedList/, 'should use keyedList for .map() with keyed items')
  // v2 uses mount for child components
  assert.match(output, /mount\(Card/, 'should mount Card component')
  assert.match(output, /mount\(ListItem/, 'should mount ListItem component')
})

// Bug 2 (v2 equivalent): Store observer with conditional child component should use
// conditional() to lazily render the child component.
test('store prop with conditional child uses conditional() for lazy rendering', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import store from './flight-store'
    import BoardingPass from './BoardingPass'

    export default class FlightCheckin extends Component {
      template() {
        const { step } = store
        const bp = store.boardingPass
        return (
          <div>
            {step === 1 && <div>Step 1</div>}
            {step === 2 && bp && <BoardingPass data={bp} />}
          </div>
        )
      }
    }
  `,
  )

  // v2 uses conditional() for && expressions
  assert.match(output, /conditional/, 'should use conditional() for && expressions')
  // v2 uses mount for child component
  assert.match(output, /mount\(BoardingPass/, 'should mount BoardingPass inside conditional')
})

// v2 no longer merges createdHooks with [GEA_OBSERVE] — user createdHooks remains as-is,
// and store observers are set up via computation() in GEA_CREATE_TEMPLATE.
test('user createdHooks is preserved: store observers are in GEA_CREATE_TEMPLATE, user body in createdHooks', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import store from './store'

    export default class WithUserCreatedHooks extends Component {
      template() {
        return (
          <div>
            <span class="count">{store.count}</span>
          </div>
        )
      }

      createdHooks() {
        this.__userCreatedHooksRan = true
      }
    }
  `,
  )

  // v2 uses computation() in GEA_CREATE_TEMPLATE for store reads
  assert.match(output, /computation\(.*store\.count/, 'store.count should be observed via computation()')

  // User createdHooks body should be preserved
  assert.match(output, /__userCreatedHooksRan/, 'user createdHooks body should be preserved')

  // Should not have duplicate createdHooks
  const createdHooksDecls = output.match(/createdHooks\s*\([^)]*\)\s*\{/g)
  assert.ok(createdHooksDecls, 'expected createdHooks in output')
  assert.equal(createdHooksDecls!.length, 1, 'must not emit duplicate createdHooks methods')
})

// v2 uses reactiveAttr for dynamic class expressions — no need for .trim()
test('dynamic class expression uses reactiveAttr in v2 output', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'

    export default class Col extends Component {
      template() {
        const flag = false
        return <div class={\`kanban-card \${flag ? 'dragging' : ''}\`} />
      }
    }
  `,
  )

  assert.match(output, /reactiveAttr/, 'compiled output should use reactiveAttr for dynamic class')
  assert.match(output, /className/, 'compiled output should use className for dynamic class attribute')
})

// v2 handles style objects via reactiveAttr and uses reactiveText for list content
test('style object uses reactiveAttr, list content uses reactiveText', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'

    const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]

    export default class Bar extends Component {
      pct = 50

      template() {
        return (
          <div class="wrap">
            <div class="bar" style={{ width: this.pct + '%' }}></div>
            <ul>{options.map(o => '<li>' + o.label + '</li>')}</ul>
          </div>
        )
      }
    }
  `,
  )

  // v2 uses reactiveAttr for style objects
  assert.match(output, /reactiveAttr\([^,]+,\s*"style"/, 'style object should use reactiveAttr with "style"')
  // v2 uses reactiveText for the list content
  assert.match(output, /reactiveText/, 'list .map() should use reactiveText')
})
