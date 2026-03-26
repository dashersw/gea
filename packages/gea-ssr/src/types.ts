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
 * Stores are plain objects whose *own* enumerable properties hold
 * serializable data alongside internal (underscore-prefixed) bookkeeping.
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

// ── Component types ─────────────────────────────────────────────────────────

/**
 * The instance-side contract SSR needs from a GEA component.
 * `P` is the props shape — defaults to a generic string-keyed record.
 */
export interface GeaComponentInstance<P extends Record<string, unknown> = Record<string, unknown>> {
  props: P
  element_?: Element | null
  rendered_?: boolean

  /** Must return an HTML string (or something coercible to string). */
  template(props?: P): string

  /** Full client-side render into a DOM element. */
  render?(element: Element): void

  // Hydration lifecycle hooks (all optional)
  attachBindings_?(): void
  mountCompiledChildComponents_?(): void
  instantiateChildComponents_?(): void
  setupEventDirectives_?(): void
  onAfterRender?(): void
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

/** Check if a property key is internal (starts or ends with underscore). */
export function isInternalProp(key: string): boolean {
  return key.charCodeAt(0) === 95 || key.charCodeAt(key.length - 1) === 95
}

// ── Window augmentation (hydration state) ───────────────────────────────────

declare global {
  interface Window {
    __GEA_STATE__?: Record<string, Record<string, unknown>>
  }
}

// ── Node interop helpers ────────────────────────────────────────────────────

/**
 * Minimal interface for piping a stream to a Node-style response.
 * `ServerResponse` satisfies this structurally.
 */
export interface NodeResponseWriter {
  write(chunk: Uint8Array): boolean
  end(): void
  once(event: string, listener: () => void): void
  on(event: string, listener: () => void): void
  removeListener(event: string, listener: () => void): void
}

/**
 * Convert IncomingHttpHeaders (values may be string | string[] | undefined)
 * to a flat Record<string, string> suitable for the Fetch API `Headers`.
 */
export function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(headers)) {
    const value = headers[key]
    if (typeof value === 'string') {
      result[key] = value
    } else if (Array.isArray(value)) {
      result[key] = value.join(', ')
    }
  }
  return result
}

/**
 * Copy headers from a Fetch Response to a Node ServerResponse,
 * preserving multiple Set-Cookie headers as an array.
 */
export function copyHeadersToNodeResponse(
  from: Headers,
  to: { setHeader(name: string, value: string | string[]): void },
): void {
  const cookies = from.getSetCookie()
  from.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    to.setHeader(key, value)
  })
  if (cookies.length > 0) {
    to.setHeader('set-cookie', cookies)
  }
}
