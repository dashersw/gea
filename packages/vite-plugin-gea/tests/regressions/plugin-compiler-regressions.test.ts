import assert from 'node:assert/strict'
import test from 'node:test'
import { transformComponentSource } from './plugin-helpers'

// Bug 1: Static array .map() with child components inside a child component's
// children prop produces an empty container. The compiler replaces .map() with
// .join('') only in the template() method, missing the case where the .map()
// is inside a __buildProps_* method (child component's children prop).
test('static array .map() with child components inside child component children includes items in props', () => {
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
    new Set(['Card', 'ListItem']),
  )

  // The compiled output should include the items array in constructor:
  assert.match(output, /_ITEMSItems/, 'should create _ITEMSItems in constructor')
  // A refresh method should exist:
  assert.match(output, /__refreshITEMSItems/, 'should have __refreshITEMSItems method')

  // When the .map() is inside a child component's children (not directly in template),
  // the compiler must call __refreshITEMSItems() in onAfterRenderHooks to populate
  // the container after the component is mounted (not in createdHooks which runs too early).
  assert.match(
    output,
    /onAfterRenderHooks\(\)\s*\{[\s\S]*__refreshITEMSItems/,
    'onAfterRenderHooks should call __refreshITEMSItems() to populate items after mount',
  )
})

// Bug 2: Observer for a store property unconditionally accesses a lazy child
// component getter, pre-creating it with stale/null props. When the child is
// inside a conditional (lazy getter), the observer should guard the
// __geaUpdateProps call to avoid premature creation.
test('observer for store prop guarding a lazy conditional child does not eagerly access getter', () => {
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
    new Set(['BoardingPass']),
  )

  // The observer for store.boardingPass should NOT unconditionally call
  // this._boardingPass.__geaUpdateProps(...) because _boardingPass is a
  // lazy getter (inside a conditional). It should guard with the backing field.

  // Verify the lazy child pattern exists
  assert.match(output, /__lazy_boardingPass/, 'should have lazy backing field for _boardingPass')
  assert.match(output, /__geaUpdateProps/, 'should have __geaUpdateProps call somewhere')

  // The __geaUpdateProps call for _boardingPass must be guarded by the
  // lazy backing field existence check to prevent premature creation.
  // Bad:  this._boardingPass.__geaUpdateProps(this.__buildProps_boardingPass())
  // Good: if (this.__lazy_boardingPass) { this._boardingPass.__geaUpdateProps(...) }
  assert.match(
    output,
    /if\s*\(this\.__lazy_boardingPass\)/,
    'observer should guard lazy child __geaUpdateProps with __lazy backing field check',
  )
})

test('user createdHooks is merged: compiler prepends __observe, user body remains', () => {
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
    new Set(),
  )

  const createdHooksDecls = output.match(/createdHooks\s*\([^)]*\)\s*\{/g)
  assert.ok(createdHooksDecls, 'expected createdHooks in output')
  assert.equal(createdHooksDecls!.length, 1, 'must not emit duplicate createdHooks methods')

  assert.match(
    output,
    /createdHooks\s*\([^)]*\)\s*\{[\s\S]*__observe\([\s\S]*__userCreatedHooksRan/s,
    'generated store setup should run before user createdHooks body',
  )
})

// Template class like `kanban-card ${cond ? 'dragging' : ''}` leaves a trailing space when falsy;
// compiler wraps dynamic `class` with String(...).trim() so the DOM attribute stays clean.
test('dynamic class expression is coerced and trimmed in template output', () => {
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
    new Set(),
  )

  assert.match(output, /\.trim\(\)/, 'compiled output should trim dynamic class strings')
})
