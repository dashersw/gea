import {
  GEA_ATTACH_BINDINGS,
  GEA_ELEMENT,
  GEA_INSTANTIATE_CHILD_COMPONENTS,
  GEA_MOUNT_COMPILED_CHILD_COMPONENTS,
  GEA_RENDERED,
  GEA_SETUP_EVENT_DIRECTIVES,
} from '@geajs/core'

// ---------------------------------------------------------------------------
// GEA SSR – Shared type definitions
// ---------------------------------------------------------------------------
// Strategy: define base interfaces that describe the *contract* SSR needs,
// then extend / compose them for each use-case.
// No `any`. No `as` type assertions. Only type narrowing.
// ---------------------------------------------------------------------------

// ── JSON-serializable values ────────────────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null

export type JsonSerializable = JsonPrimitive | JsonSerializable[] | { [key: string]: JsonSerializable }

// ── Store types ─────────────────────────────────────────────────────────────

/**
 * The minimal shape SSR expects from a reactive store instance.
 * Stores are plain objects whose *own* enumerable properties hold serializable data.
 */
export interface GeaStore {
  [key: string]: unknown
}

/** A named map of store instances, keyed by their registry name. */
export type StoreRegistry = Record<string, GeaStore>

/** A snapshot entry: the store instance paired with a deep copy of its data. */
export type StoreSnapshotEntry = [store: GeaStore, data: Record<string, unknown>]

/** Full snapshot array returned by `snapshotStores`. */
export type StoreSnapshot = StoreSnapshotEntry[]

/** Own keys on @geajs/core `Store` that are implementation details (not user data). */
export const STORE_IMPL_OWN_KEYS = new Set([
  // _selfProxy and most internals live on WeakMap / symbol keys — not enumerable string keys
  '_pendingChanges',
  '_pendingChangesPool',
  '_flushScheduled',
  '_nextArrayOpId',
  '_observerRoot',
  '_proxyCache',
  '_arrayIndexProxyCache',
  '_internedArrayPaths',
  '_topLevelProxies',
  '_pathPartsCache',
  '_pendingBatchKind',
  '_pendingBatchArrayPathParts',
])

// ── Component types ─────────────────────────────────────────────────────────

/**
 * The instance-side contract SSR needs from a GEA component.
 * `P` is the props shape — defaults to a generic string-keyed record.
 */
export interface GeaComponentInstance<P extends Record<string, unknown> = Record<string, unknown>> {
  props: P
  [GEA_ELEMENT]?: Element | null
  [GEA_RENDERED]?: boolean

  /** Must return an HTML string (or something coercible to string). */
  template(props?: P): string

  /** Full client-side render into a DOM element. */
  render?(element: Element): void

  // Hydration lifecycle hooks (all optional; engine uses well-known symbols)
  [GEA_ATTACH_BINDINGS]?: () => void
  [GEA_MOUNT_COMPILED_CHILD_COMPONENTS]?: () => void
  [GEA_INSTANTIATE_CHILD_COMPONENTS]?: () => void
  [GEA_SETUP_EVENT_DIRECTIVES]?: () => void
  onAfterRender?(): void
  onAfterRenderAsync?(): void
  onAfterRenderHooks?(): void
  __geaRequestRender?(): void
}

/**
 * Constructor side — what you `new` to get a `GeaComponentInstance`.
 * `P` flows through so call-sites can narrow the props shape.
 */
export interface GeaComponentConstructor<P extends Record<string, unknown> = Record<string, unknown>> {
  new (props?: P): GeaComponentInstance<P>
}

// ── Route types ─────────────────────────────────────────────────────────────

export type RouteGuard = () => boolean | string

export interface RouteGroup {
  children: RouteMap
  guard?: RouteGuard
  component?: GeaComponentConstructor
}

/** A single route entry: component constructor, redirect string, or group. */
export type RouteEntry = GeaComponentConstructor | string | RouteGroup

/** The full route definition map passed to the SSR handler. */
export type RouteMap = Record<string, RouteEntry>

// ── Head management ─────────────────────────────────────────────────────────

export interface HeadConfig {
  title?: string
  meta?: Array<Record<string, string>>
  link?: Array<Record<string, string>>
}

// ── SSR context ─────────────────────────────────────────────────────────────

export interface SSRContext {
  request: Request
  params: Record<string, string>
  query: Record<string, string | string[]>
  hash: string
  route: string
  head?: HeadConfig
  deferreds?: import('./stream').DeferredChunk[]
}

// ── Type guards ─────────────────────────────────────────────────────────────

/** Narrows `unknown` to a string-keyed record (plain object). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Narrows a `RouteEntry` to a component constructor. */
export function isComponentConstructor(value: RouteEntry): value is GeaComponentConstructor {
  return typeof value === 'function'
}

/** Narrows a `RouteEntry` to a route group with children. */
export function isRouteGroup(entry: RouteEntry): entry is RouteGroup {
  return typeof entry === 'object' && entry !== null && 'children' in entry
}

// ── Window augmentation (hydration state) ───────────────────────────────────

declare global {
  interface Window {
    __GEA_STATE__?: Record<string, Record<string, unknown>>
  }
}

// ── Node interop helpers ────────────────────────────────────────────────────
// Defined in `./node-stream` so they don't transitively pull `@geajs/core` into
// the Vite plugin's config-load path. Re-exported here for backward compat.

export { flattenHeaders, copyHeadersToNodeResponse } from './node-stream'
export type { NodeResponseWriter } from './node-stream'
