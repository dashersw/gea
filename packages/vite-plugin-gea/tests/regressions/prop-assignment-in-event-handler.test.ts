import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

// Regression for the taurus-display `unresolved-binding-cell` census family
// (docs/campaign/findings/module-export-binding-cells-20260819.md, Cluster B):
// a component's `template({ app })` destructures a prop and an event handler
// WRITES through it -- `onClick={() => app.selectedPreset = 0}` -- instead of
// only reading it. The codegen's prop-substitution pass
// (`closure-codegen/emit/emit-substitution.ts`'s `substituteBindings`) rewrites
// every read of the destructured `app` to `this.props.app`, but its
// `AssignmentExpression` case only ever recursed into `expr.right`, never
// `expr.left` -- so a WRITE target left `app` as a bare, un-substituted
// identifier while a READ of the exact same property two lines away
// (`app.selectedPreset == 0`) correctly became `this.props.app.selectedPreset
// == 0`. The bare identifier has no binding in the compiled class body at
// all, so geatsc's checker resolves it to nothing
// (`binding-blocker: unresolved-binding-cell` / `binding-candidate:
// read:unresolved-symbol`) -- and at plain JS runtime it throws
// `ReferenceError: app is not defined` the instant the handler fires.
describe('prop assignment inside an event handler', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('writes through the substituted this.props.<name>, not a bare destructured identifier', async () => {
    const seed = `prop-assignment-event-handler-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    // Bound into the compiled module's eval scope under a DIFFERENT name than
    // the destructured template parameter (`app`). This is deliberate: if the
    // compiled handler body left the parameter name as a bare, un-substituted
    // identifier, it would (without this precaution) silently resolve through
    // JS's own lexical scoping to an accidental same-named outer binding --
    // masking the exact bug this test exists to catch. With no `app` binding
    // anywhere in scope, a bare reference can only fail closed with a
    // `ReferenceError`, exactly like the real compiled component (no such
    // outer binding exists there either).
    const appState = { selectedPreset: 0 }

    const mod = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        class PresetsView extends Component {
          template({ app }) {
            return (
              <button class="preset" onClick={() => app.selectedPreset = 1}>
                {app.selectedPreset == 0 ? 'unselected' : 'selected'}
              </button>
            )
          }
        }

        export default class App extends Component {
          template() {
            return (
              <section>
                <PresetsView app={appState} />
              </section>
            )
          }
        }
      `,
      '/virtual/PresetAssignment.tsx',
      ['PresetsView', 'App'],
      { Component, appState },
    )

    const AppClass = mod.App as { new (): { render: (n: Node) => void; dispose: () => void } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new AppClass()
    view.render(root)
    await flushMicrotasks()

    const button = root.querySelector('.preset') as HTMLButtonElement
    assert.equal(button.textContent, 'unselected')

    // Before the fix this throws `ReferenceError: app is not defined` --
    // the compiled handler body referenced the destructured parameter name
    // directly instead of `this.props.app`, and no such binding exists in
    // the compiled class.
    assert.doesNotThrow(() => button.click())
    await flushMicrotasks()

    // The write must land on the SAME object the parent passed down, proving
    // the compiled handler resolved `app` to `this.props.app` and not to a
    // bare, unbound identifier (which would have thrown above) or a
    // disconnected local. `app` here is a plain object, not a reactive
    // Store, so the DOM text binding is not expected to re-render on its own
    // -- this assertion is about where the write landed, not about
    // reactivity.
    assert.equal(appState.selectedPreset, 1)
  })
})
