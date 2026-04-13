/**
 * Shared symbols re-export.
 *
 * Forwards the runtime symbols plus package-compat aliases used by
 * `@geajs/ui`, `@geajs/ssr`, and `packages/gea/src/store.ts`.
 */
export * from './runtime/symbols'
import { GEA_PROXY_RAW as _RAW } from './runtime/symbols'

// Consolidated proxy identity (both aliases resolve to GEA_PROXY_RAW)
export const GEA_PROXY_GET_TARGET = _RAW
export const GEA_PROXY_GET_RAW_TARGET = _RAW

// Still consumed by @geajs/ssr (types.ts, render.ts)
export const GEA_ATTACH_BINDINGS = Symbol.for('gea.attachBindings')
export const GEA_CHILD_COMPONENTS = Symbol.for('gea.ccs')
export const GEA_INSTANTIATE_CHILD_COMPONENTS = Symbol.for('gea.instantiateChildComponents')
export const GEA_MOUNT_COMPILED_CHILD_COMPONENTS = Symbol.for('gea.mountCompiledChildComponents')
export const GEA_OBSERVER_REMOVERS = Symbol.for('gea.observerRemovers')
export const GEA_RENDERED = Symbol.for('gea.rendered')
export const GEA_SETUP_EVENT_DIRECTIVES = Symbol.for('gea.setupEventDirectives')

// Still consumed by @geajs/ui (zag integration) + compiler's store-analysis
export const GEA_MAPS = Symbol.for('gea.maps')

// Router internals (packages/gea/src/router/{outlet,router-view}.ts)
export const GEA_IS_ROUTER_OUTLET = Symbol.for('gea.isRouterOutlet')
export const GEA_ROUTER_DEPTH = Symbol.for('gea.router.depth')
export const GEA_ROUTER_REF = Symbol.for('gea.router.ref')
export const GEA_DOM_COMPILED_CHILD_ROOT = Symbol.for('gea.domCompiledChildRoot')
export const GEA_COMPILED_CHILD = Symbol.for('gea.compiled.child')
export const GEA_COMPILED = Symbol.for('gea.compiled')
