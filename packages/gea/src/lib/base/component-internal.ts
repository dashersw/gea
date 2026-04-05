import { GEA_PROXY_GET_RAW_TARGET } from '../symbols'

/** @internal Engine-owned state — not on `this`, so user classes may use any property names (e.g. `__childComponents`). */
export type ComponentEngineState = {
  bindings: any[]
  selfListeners: Array<() => void>
  childComponents: any[]
  geaPropBindings: Map<string, any>
  observerRemovers: Array<() => void>
  rawProps: Record<string, any>
  elCache: Map<string, HTMLElement>
  geaMaps?: Record<number, Record<string, any>>
  geaConds?: Record<number, Record<string, any>>
  geaCompiledChild?: boolean
  geaItemKey?: string
  /** __observeList registrations for __geaRequestRender refresh */
  listConfigs: Array<{ store: any; path: string[]; config: any }>
  /** Compiler: clear cached `__eN` element refs on full re-render */
  resetEls?: () => void
  /** Conditional slot: last committed cond value per slot index (patch guard) */
  condPatchPrev?: Record<number, boolean>
}

function createEngineState(): ComponentEngineState {
  return {
    bindings: [],
    selfListeners: [],
    childComponents: [],
    geaPropBindings: new Map(),
    observerRemovers: [],
    rawProps: {},
    elCache: new Map(),
    listConfigs: [],
  }
}

const engineStateByRawInstance = new WeakMap<object, ComponentEngineState>()

export function engineThis(c: object): any {
  return (c as any)[GEA_PROXY_GET_RAW_TARGET] ?? c
}

/**
 * Returns per-component engine state (WeakMap, not on `this`).
 * Safe to call after `super()` in Component constructors.
 */
export function getComponentInternals(component: object): ComponentEngineState {
  const key = engineThis(component)
  let s = engineStateByRawInstance.get(key)
  if (!s) {
    s = createEngineState()
    engineStateByRawInstance.set(key, s)
  }
  return s
}

/** @internal Raw props object (not the proxy). Used by @geajs/ui when DOM patches must match `this.props`. */
export function getComponentRawProps(component: object): Record<string, unknown> {
  return getComponentInternals(component).rawProps as Record<string, unknown>
}
