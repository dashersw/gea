import { resetUidCounter } from '@geajs/core/ssr'
import { GEA_SET_PROPS } from '@geajs/core/compiler-runtime'
import type { GeaComponentConstructor } from './types'
import { parseHTML } from 'linkedom'

const SSR_UID_SEED = 0

/** Reset the UID counter to the deterministic SSR seed.
 *  Call before renderToString and before hydrate to get matching IDs. */
export function resetSSRIds(): void {
  resetUidCounter(SSR_UID_SEED)
}

export interface RenderOptions {
  onRenderError?: (error: Error) => string
}

/** Install a linkedom-backed DOM as globals for the render pass. v2 templates
 *  rely on `document.createElement('template')` at module-top eval time, so
 *  the globals must be in place before the user's module is imported. This
 *  helper also covers template-clone, setAttribute, classList, etc. — the
 *  narrow surface reactive-* and keyedList actually use. */
function installDom(): () => void {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="__gea_ssr_root"></div></body></html>')
  const prev: Record<string, unknown> = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    HTMLElement: (globalThis as any).HTMLElement,
    Element: (globalThis as any).Element,
    Node: (globalThis as any).Node,
    DocumentFragment: (globalThis as any).DocumentFragment,
    Event: (globalThis as any).Event,
    CustomEvent: (globalThis as any).CustomEvent,
  }
  Object.assign(globalThis as any, {
    window,
    document,
    HTMLElement: (window as any).HTMLElement,
    Element: (window as any).Element,
    Node: (window as any).Node,
    DocumentFragment: (window as any).DocumentFragment,
    Event: (window as any).Event,
    CustomEvent: (window as any).CustomEvent,
  })
  return () => {
    Object.assign(globalThis as any, prev)
  }
}

// Install DOM globals at module import so user modules loaded via
// `ssrLoadModule` after this module see `document` at template-eval time.
// (The install is harmless in repeat calls and gets restored when the
// final server shuts down.)
installDom()

export function renderToString(
  ComponentClass: GeaComponentConstructor,
  props?: Record<string, unknown>,
  options?: RenderOptions,
): string {
  resetSSRIds()
  // Fresh DOM per request (linkedom is lightweight — no re-use concerns).
  const restoreDom = installDom()
  try {
    const container = document.getElementById('__gea_ssr_root')!
    const instance: any = new (ComponentClass as any)()
    if (props && Object.keys(props).length > 0) {
      const thunks: Record<string, () => unknown> = {}
      for (const k of Object.keys(props)) {
        const v = props[k]
        thunks[k] = () => v
      }
      const setProps = instance[GEA_SET_PROPS]
      if (typeof setProps === 'function') setProps.call(instance, thunks)
    }
    instance.render(container)
    try {
      return container.innerHTML
    } finally {
      if (typeof instance.dispose === 'function') instance.dispose()
    }
  } catch (error) {
    if (options?.onRenderError) {
      const err = error instanceof Error ? error : new Error(String(error))
      return options.onRenderError(err)
    }
    throw error
  } finally {
    restoreDom()
  }
}
