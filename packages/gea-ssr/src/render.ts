import { resetUidCounter } from '@geajs/core'
import type { GeaComponentConstructor } from './types'

const SSR_UID_SEED = 0

/** Reset the UID counter to the deterministic SSR seed.
 *  Call before renderToString and before hydrate to get matching IDs. */
export function resetSSRIds(): void {
  resetUidCounter(SSR_UID_SEED)
}

export interface RenderOptions {
  onRenderError?: (error: Error) => string
}

export function renderToString(
  ComponentClass: GeaComponentConstructor,
  props?: Record<string, unknown>,
  options?: RenderOptions,
): string {
  resetSSRIds()
  const instance = new ComponentClass(props)
  try {
    const html = instance.template(instance.props)
    return String(html ?? '').trim()
  } catch (error) {
    if (options?.onRenderError) {
      const err = error instanceof Error ? error : new Error(String(error))
      return options.onRenderError(err)
    }
    throw error
  } finally {
    // Remove observers registered by the temporary instance's constructor
    // (createdHooks) to prevent polluting shared store observer trees.
    // Only clean up observers — a full dispose() would also remove children
    // from shared stores and potentially break the live hydrated app.
    const removers = (instance as Record<string, unknown>).__observer_removers__
    if (Array.isArray(removers)) {
      for (const remover of removers) {
        if (typeof remover === 'function') try { (remover as Function)() } catch { /* ignore */ }
      }
    }
  }
}
