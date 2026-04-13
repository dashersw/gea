import {
  GEA_ATTACH_BINDINGS,
  GEA_INSTANTIATE_CHILD_COMPONENTS,
  GEA_MOUNT_COMPILED_CHILD_COMPONENTS,
  GEA_RENDERED,
  GEA_SETUP_EVENT_DIRECTIVES,
} from '@geajs/core'
import { resetUidCounter } from '@geajs/core/ssr'
import type { GeaComponentConstructor, StoreRegistry } from './types'
import { STORE_IMPL_OWN_KEYS } from './types'

interface RestoreOptions {
  preserveNull?: boolean
}

export function restoreStoreState(registry: StoreRegistry, options?: RestoreOptions): void {
  if (typeof window === 'undefined') return
  const state = window.__GEA_STATE__
  if (!state || typeof state !== 'object') return

  for (const [name, storeInstance] of Object.entries(registry)) {
    const serialized = state[name]
    if (!serialized || typeof serialized !== 'object') continue
    for (const [key, value] of Object.entries(serialized)) {
      if (key === 'constructor' || key === '__proto__' || STORE_IMPL_OWN_KEYS.has(key)) continue
      try {
        // Don't overwrite client-initialized values with null from SSR,
        // unless preserveNull is set (for authoritative server nulls).
        if (value === null && storeInstance[key] != null && !options?.preserveNull) continue
        storeInstance[key] = value
      } catch {
        // Skip read-only properties
      }
    }
  }
}

export function hydrate(
  App: GeaComponentConstructor,
  element: HTMLElement | null,
  options?: { storeRegistry?: StoreRegistry },
): void {
  if (!element) {
    throw new Error('[gea-ssr] hydrate: target element not found')
  }

  // Restore store state from server before re-rendering so the client picks
  // up the same initial state.
  if (options?.storeRegistry) {
    restoreStoreState(options.storeRegistry)
  }

  // Reset UID counter to match SSR-generated IDs so component IDs align with DOM
  resetUidCounter(0)

  // v2 hydration: closure-compiled templates don't expose the v1
  // GEA_ATTACH_BINDINGS / GEA_INSTANTIATE_CHILD_COMPONENTS hooks, so
  // "adopt existing DOM" isn't possible without a full DOM-walking
  // reconciliation layer. Simplest correct behavior: wipe the SSR-rendered
  // markup and re-render from scratch. The Store state has already been
  // rehydrated above, so the client re-render produces identical DOM on
  // the happy path and the rAF/FP cost is minimal (one clone+cloneNode).
  while (element.firstChild) element.removeChild(element.firstChild)
  const app = new App()
  if (typeof app.render === 'function') app.render(element)
  // Snapshot current DOM for dev-mode mismatch detection (below).
  const savedInnerHTML = typeof import.meta !== 'undefined' && import.meta.env?.DEV ? element.innerHTML : ''
  void savedInnerHTML
  void (app as any)[GEA_ATTACH_BINDINGS]
  void (app as any)[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]
  void (app as any)[GEA_INSTANTIATE_CHILD_COMPONENTS]
  void (app as any)[GEA_SETUP_EVENT_DIRECTIVES]
  void GEA_RENDERED

  // Dev-mode hydration mismatch detection — runs AFTER hydration is fully complete
  // Uses setTimeout to ensure all lifecycle hooks have finished before re-rendering
  // Uses dynamic import() to avoid pulling server code into client bundle
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    setTimeout(async () => {
      try {
        const [{ renderToString }, { detectHydrationMismatch }] = await Promise.all([
          import('./render'),
          import('./mismatch'),
        ])
        resetUidCounter(0) // Safe: hydration is complete
        const clientHtml = renderToString(App)
        const mismatch = detectHydrationMismatch({ innerHTML: savedInnerHTML }, clientHtml)
        if (mismatch) {
          console.warn(
            '[gea-ssr] Hydration mismatch detected.\n' +
              'Server HTML: ' +
              mismatch.server.substring(0, 200) +
              '\n' +
              'Client HTML: ' +
              mismatch.client.substring(0, 200),
          )
        }
      } catch {
        // Silently skip mismatch detection if imports fail
      }
    }, 0)
  }
}
