import { resetUidCounter, GEA_OBSERVER_REMOVERS, GEA_CHILD_COMPONENTS } from '@geajs/core'
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

function _teardownObservers(instance: any): void {
  const or = instance?.[GEA_OBSERVER_REMOVERS]
  if (or?.length) {
    for (const fn of or) fn()
    instance[GEA_OBSERVER_REMOVERS] = []
  }
  const cc = instance?.[GEA_CHILD_COMPONENTS]
  if (cc?.length) {
    for (const child of cc) _teardownObservers(child)
  }
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
    _teardownObservers(instance)
  }
}
