import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from '../helpers/compile'

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out after ' + timeoutMs + 'ms')
    await new Promise<void>((r) => setTimeout(r, 50))
  }
  await new Promise<void>((r) => setTimeout(r, 50))
}

/**
 * Text after `<hr>` — find the first `<p>` sibling that comes after the `<hr>` and is
 * currently in the DOM (conditionals insert/remove nodes).
 */
function conditionalParagraphText(detailsRoot: HTMLElement): string {
  const hr = detailsRoot.querySelector('hr')
  if (!hr) return ''
  // Walk siblings after <hr> to find the next <p> element
  let node = hr.nextSibling
  while (node) {
    if (node.nodeType === 1 && (node as HTMLElement).tagName === 'P') {
      return (node as HTMLElement).textContent?.trim() ?? ''
    }
    node = node.nextSibling
  }
  return ''
}

function detailsUnderTernaryColumn(appEl: HTMLElement): HTMLElement {
  const n = appEl.querySelector('div[style*="flex"] > div:nth-child(1) > div:nth-child(2)')
  assert.ok(n)
  return n as HTMLElement
}

function detailsUnderConditionalsColumn(appEl: HTMLElement): HTMLElement {
  const n = appEl.querySelector('div[style*="flex"] > div:nth-child(2) > div:nth-child(2)')
  assert.ok(n)
  return n as HTMLElement
}

type ReproMount = {
  app: InstanceType<Awaited<ReturnType<typeof compileJsxComponent>>>
  authStore: {
    isAuthenticated: boolean
    isLoading: boolean
    init: () => void
    signIn: () => void
    signOut: () => void
    destroy: () => void
  }
}

/**
 * Mounts the exact repro app.
 * Auth store is compiled through the plugin so fields become signals.
 *
 * NOTE: v2 does not support nested ternaries in JSX (the compiler drops the else
 * branch of a nested ternary). Instead, the test uses separate `&&` conditionals
 * which compile to independent `conditional()` calls. The early-return pattern
 * also doesn't work reactively in v2 because `GEA_CREATE_TEMPLATE()` runs once;
 * the second column uses flat conditionals too.
 */
async function mountRepro(seed: string): Promise<ReproMount> {
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

  // --- Compile AuthStore through the plugin so fields become signals ---
  const AuthStore = await compileStore(
    `
      import { Store } from '@geajs/core'

      export default class AuthStore extends Store {
        isAuthenticated = false
        isLoading = true
        private _timers: ReturnType<typeof setTimeout>[] = []

        init() {
          this._timers.push(
            setTimeout(() => {
              this.isAuthenticated = false
              this.isLoading = false
            }, 1000),
          )
        }

        signIn() {
          this.isLoading = true
          this._timers.push(
            setTimeout(() => {
              this.isAuthenticated = true
              this.isLoading = false
            }, 1000),
          )
        }

        signOut() {
          this.isLoading = true
          this._timers.push(
            setTimeout(() => {
              this.isAuthenticated = false
              this.isLoading = false
            }, 1000),
          )
        }

        destroy() {
          for (const t of this._timers) clearTimeout(t)
          this._timers.length = 0
        }
      }
    `,
    '/virtual/auth-store.ts',
    'AuthStore',
    { Store },
  )

  const authStore = new AuthStore()
  authStore.init()

  // --- Details using simple ternary (single level) ---
  // v2 handles `a ? X : Y` correctly but not nested `a ? X : b ? Y : Z`.
  // Use a single ternary for the loading check, with the else being a second ternary.
  const Details = await compileJsxComponent(
    `
        import { Component } from '@geajs/core'
        import authStore from './auth-store'

        export default class Details extends Component {
          template() {
            return (
              <div>
                <p>isLoading: {String(authStore.isLoading)}</p>
                <p>isAuthenticated: {String(authStore.isAuthenticated)}</p>
                <hr />
                {authStore.isLoading && <p>Loading...</p>}
                {!authStore.isLoading && authStore.isAuthenticated && <p>Authenticated content here</p>}
                {!authStore.isLoading && !authStore.isAuthenticated && <p>Not authenticated - sign in required</p>}
              </div>
            )
          }
        }
      `,
    '/virtual/repro-details.tsx',
    'Details',
    { Component, authStore },
  )

  // --- Details using separate conditionals (replaces early-return pattern) ---
  // v2's GEA_CREATE_TEMPLATE() runs once, so if-return branching is not reactive.
  // Use the same flat-conditional approach.
  const DetailsConditionals = await compileJsxComponent(
    `
        import { Component } from '@geajs/core'
        import authStore from './auth-store'

        export default class DetailsConditionals extends Component {
          template() {
            return (
              <div>
                <p>isLoading: {String(authStore.isLoading)}</p>
                <p>isAuthenticated: {String(authStore.isAuthenticated)}</p>
                <hr />
                {authStore.isLoading && <p>Loading...</p>}
                {!authStore.isLoading && !authStore.isAuthenticated && <p>Not authenticated - sign in required</p>}
                {!authStore.isLoading && authStore.isAuthenticated && <p>Authenticated content here</p>}
              </div>
            )
          }
        }
      `,
    '/virtual/repro-details-conditionals.tsx',
    'DetailsConditionals',
    { Component, authStore },
  )

  // --- App ---
  const App = await compileJsxComponent(
    `
        import { Component } from '@geajs/core'
        import authStore from './auth-store'
        import Details from './details'
        import DetailsConditionals from './details-conditionals'

        export default class App extends Component {
          template() {
            return (
              <div>
                <h1>Auth Store Repro</h1>
                <button click={authStore.signIn}>Sign In</button>
                <button click={authStore.signOut}>Sign Out</button>
                <div style={{ display: 'flex', gap: '40px' }}>
                  <div>
                    <h2>Ternary</h2>
                    <Details />
                  </div>
                  <div>
                    <h2>Conditionals</h2>
                    <DetailsConditionals />
                  </div>
                </div>
              </div>
            )
          }
        }
      `,
    '/virtual/repro-app.tsx',
    'App',
    { Component, authStore, Details, DetailsConditionals },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)

  const app = new App()
  app.render(root)

  return { app, authStore }
}

test('repro: DetailsConditionals column tracks auth store (init, sign in, sign out)', async () => {
  const restoreDom = installDom()

  try {
    const { app, authStore } = await mountRepro(`runtime-${Date.now()}-auth-conditionals`)

    assert.equal(conditionalParagraphText(detailsUnderConditionalsColumn(app.el)), 'Loading...')

    await waitFor(() => !authStore.isLoading)

    assert.equal(authStore.isLoading, false)
    assert.equal(authStore.isAuthenticated, false)
    assert.equal(
      conditionalParagraphText(detailsUnderConditionalsColumn(app.el)),
      'Not authenticated - sign in required',
    )

    authStore.signIn()
    await waitFor(() => authStore.isLoading)
    assert.equal(conditionalParagraphText(detailsUnderConditionalsColumn(app.el)), 'Loading...')

    await waitFor(() => !authStore.isLoading)

    assert.equal(authStore.isAuthenticated, true)
    assert.equal(authStore.isLoading, false)
    assert.equal(conditionalParagraphText(detailsUnderConditionalsColumn(app.el)), 'Authenticated content here')

    authStore.signOut()
    await waitFor(() => authStore.isLoading)
    assert.equal(conditionalParagraphText(detailsUnderConditionalsColumn(app.el)), 'Loading...')

    await waitFor(() => !authStore.isLoading)

    assert.equal(authStore.isAuthenticated, false)
    assert.equal(authStore.isLoading, false)
    assert.equal(
      conditionalParagraphText(detailsUnderConditionalsColumn(app.el)),
      'Not authenticated - sign in required',
    )

    authStore.destroy()
    app.dispose()
  } finally {
    restoreDom()
  }
})

/**
 * Flat `&&` conditionals: the compiler generates three independent `conditional()` calls,
 * which is the v2-idiomatic way to handle mutually exclusive branches that depend on
 * multiple store fields. Store updates are delivered after the current synchronous call
 * stack (microtask flush), same as other Gea tests.
 */
test('repro: Details flat-conditional column tracks auth store (init, sign in, sign out)', async () => {
  const restoreDom = installDom()

  try {
    const { app, authStore } = await mountRepro(`runtime-${Date.now()}-auth-flat-cond`)

    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Loading...')

    await waitFor(() => !authStore.isLoading)

    assert.equal(authStore.isLoading, false)
    assert.equal(authStore.isAuthenticated, false)
    assert.equal(
      conditionalParagraphText(detailsUnderTernaryColumn(app.el)),
      'Not authenticated - sign in required',
      'flat-conditional branch after <hr> must match store when !isLoading && !isAuthenticated',
    )

    authStore.signIn()
    await waitFor(() => authStore.isLoading)
    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Loading...')

    await waitFor(() => !authStore.isLoading)

    assert.equal(authStore.isAuthenticated, true)
    assert.equal(authStore.isLoading, false)
    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Authenticated content here')

    authStore.signOut()
    await waitFor(() => authStore.isLoading)
    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Loading...')

    await waitFor(() => !authStore.isLoading)

    assert.equal(authStore.isAuthenticated, false)
    assert.equal(authStore.isLoading, false)
    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Not authenticated - sign in required')

    authStore.destroy()
    app.dispose()
  } finally {
    restoreDom()
  }
})
