import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

/** Matches repro `setTimeout(..., 1000)` — wait past the async boundary. */
async function sleepAuthDelay(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 1500))
}

async function pause(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 100))
}

/**
 * Text after `<hr>` in Details / DetailsEarlyReturn (the ternary / branch body).
 */
function conditionalParagraphText(detailsRoot: HTMLElement): string {
  const hr = detailsRoot.querySelector('hr')
  const after = hr?.nextElementSibling
  return after?.textContent?.trim() ?? ''
}

function detailsUnderTernaryColumn(appEl: HTMLElement): HTMLElement {
  const n = appEl.querySelector('div[style*="flex"] > div:nth-child(1) > div:nth-child(2)')
  assert.ok(n)
  return n as HTMLElement
}

function detailsUnderEarlyReturnColumn(appEl: HTMLElement): HTMLElement {
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
  }
}

/**
 * Mounts the exact repro app (repro/src/*.tsx sources inlined).
 * Auth store is inline (same as repro/src/auth-store.ts) — Store-only files are not passed through the JSX plugin.
 */
async function mountRepro(seed: string): Promise<ReproMount> {
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

  // --- Exact repro: repro/src/auth-store.ts ---
  class AuthStore extends Store {
    isAuthenticated = false
    isLoading = true

    init() {
      // Simulate async session check (like getUser() returning null)
      setTimeout(() => {
        this.isAuthenticated = false
        this.isLoading = false
      }, 1000)
    }

    signIn() {
      this.isLoading = true
      setTimeout(() => {
        this.isAuthenticated = true
        this.isLoading = false
      }, 1000)
    }

    signOut() {
      this.isLoading = true
      setTimeout(() => {
        this.isAuthenticated = false
        this.isLoading = false
      }, 1000)
    }
  }

  const authStore = new AuthStore()
  authStore.init()

  // --- Exact repro: repro/src/details.tsx ---
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
                {authStore.isLoading ? (
                  <p>Loading...</p>
                ) : authStore.isAuthenticated ? (
                  <p>Authenticated content here</p>
                ) : (
                  <p>Not authenticated - sign in required</p>
                )}
              </div>
            )
          }
        }
      `,
    '/virtual/repro-details.tsx',
    'Details',
    { Component, authStore },
  )

  // --- Exact repro: repro/src/details-early-return.tsx ---
  const DetailsEarlyReturn = await compileJsxComponent(
    `
        import { Component } from '@geajs/core'
        import authStore from './auth-store'

        export default class DetailsEarlyReturn extends Component {
          template() {
            if (authStore.isLoading) {
              return (
                <div>
                  <p>isLoading: {String(authStore.isLoading)}</p>
                  <p>isAuthenticated: {String(authStore.isAuthenticated)}</p>
                  <hr />
                  <p>Loading...</p>
                </div>
              )
            }

            if (!authStore.isAuthenticated) {
              return (
                <div>
                  <p>isLoading: {String(authStore.isLoading)}</p>
                  <p>isAuthenticated: {String(authStore.isAuthenticated)}</p>
                  <hr />
                  <p>Not authenticated - sign in required</p>
                </div>
              )
            }

            return (
              <div>
                <p>isLoading: {String(authStore.isLoading)}</p>
                <p>isAuthenticated: {String(authStore.isAuthenticated)}</p>
                <hr />
                <p>Authenticated content here</p>
              </div>
            )
          }
        }
      `,
    '/virtual/repro-details-early-return.tsx',
    'DetailsEarlyReturn',
    { Component, authStore },
  )

  // --- Exact repro: repro/src/app.tsx ---
  const App = await compileJsxComponent(
    `
        import { Component } from '@geajs/core'
        import authStore from './auth-store'
        import Details from './details'
        import DetailsEarlyReturn from './details-early-return'

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
                    <h2>Early Return</h2>
                    <DetailsEarlyReturn />
                  </div>
                </div>
              </div>
            )
          }
        }
      `,
    '/virtual/repro-app.tsx',
    'App',
    { Component, authStore, Details, DetailsEarlyReturn },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)

  const app = new App()
  app.render(root)

  return { app, authStore }
}

test('repro: DetailsEarlyReturn column tracks auth store (init, sign in, sign out)', async () => {
  const restoreDom = installDom()

  try {
    const { app, authStore } = await mountRepro(`runtime-${Date.now()}-auth-early`)

    assert.equal(conditionalParagraphText(detailsUnderEarlyReturnColumn(app.el)), 'Loading...')

    await sleepAuthDelay()

    assert.equal(authStore.isLoading, false)
    assert.equal(authStore.isAuthenticated, false)
    assert.equal(
      conditionalParagraphText(detailsUnderEarlyReturnColumn(app.el)),
      'Not authenticated - sign in required',
    )

    authStore.signIn()
    await pause()
    assert.equal(conditionalParagraphText(detailsUnderEarlyReturnColumn(app.el)), 'Loading...')

    await sleepAuthDelay()

    assert.equal(authStore.isAuthenticated, true)
    assert.equal(authStore.isLoading, false)
    assert.equal(conditionalParagraphText(detailsUnderEarlyReturnColumn(app.el)), 'Authenticated content here')

    authStore.signOut()
    await pause()
    assert.equal(conditionalParagraphText(detailsUnderEarlyReturnColumn(app.el)), 'Loading...')

    await sleepAuthDelay()

    assert.equal(authStore.isAuthenticated, false)
    assert.equal(authStore.isLoading, false)
    assert.equal(
      conditionalParagraphText(detailsUnderEarlyReturnColumn(app.el)),
      'Not authenticated - sign in required',
    )

    app.dispose()
  } finally {
    restoreDom()
  }
})

/**
 * Nested ternary under `<hr>`: the compiler must register the full inner `c ? d : e` as the outer
 * slot falsy HTML (see `extractHtmlTemplatesFromConditional` in transform-jsx). Store updates are
 * delivered after the current synchronous call stack (microtask flush), same as other Gea tests.
 */
test('repro: Details ternary column tracks auth store (init, sign in, sign out)', async () => {
  const restoreDom = installDom()

  try {
    const { app, authStore } = await mountRepro(`runtime-${Date.now()}-auth-ternary`)

    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Loading...')

    await sleepAuthDelay()

    assert.equal(authStore.isLoading, false)
    assert.equal(authStore.isAuthenticated, false)
    assert.equal(
      conditionalParagraphText(detailsUnderTernaryColumn(app.el)),
      'Not authenticated - sign in required',
      'ternary branch after <hr> must match store when !isLoading && !isAuthenticated',
    )

    authStore.signIn()
    await pause()
    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Loading...')

    await sleepAuthDelay()

    assert.equal(authStore.isAuthenticated, true)
    assert.equal(authStore.isLoading, false)
    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Authenticated content here')

    authStore.signOut()
    await pause()
    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Loading...')

    await sleepAuthDelay()

    assert.equal(authStore.isAuthenticated, false)
    assert.equal(authStore.isLoading, false)
    assert.equal(conditionalParagraphText(detailsUnderTernaryColumn(app.el)), 'Not authenticated - sign in required')

    app.dispose()
  } finally {
    restoreDom()
  }
})
