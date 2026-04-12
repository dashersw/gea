import type Component from '../base/component'

// ── Route config types ──────────────────────────────────────────

export type RouteComponent = new (props?: any, ...args: any[]) => Component<any>

export type LazyComponent = () => Promise<{ default: RouteComponent } | RouteComponent>

export type ComponentOrLazy = RouteComponent | LazyComponent

export type GuardResult = true | string | RouteComponent

/** Guards are intentionally synchronous — they check store state, not async APIs.
 *  For async checks, use created() in the component. */
export type GuardFn = () => GuardResult

export type RedirectFn = (params: Record<string, string>, path: string) => string

export interface RedirectConfig {
  redirect: string | RedirectFn
  method?: 'push' | 'replace'
  status?: number
}

export type QueryMode = { type: 'query'; param: string }

export interface RouteGroupConfig {
  layout?: RouteComponent
  guard?: GuardFn
  mode?: QueryMode
  children: RouteMap
}

export type RouteEntry =
  | ComponentOrLazy // direct component or lazy
  | string // static redirect
  | RedirectConfig // full redirect control
  | RouteGroupConfig // nested group with layout/guard/children

// Note: dynamic redirects (functions returning strings) are expressed as RedirectConfig
// with redirect as a function, NOT as bare functions. This avoids ambiguity with LazyComponent.

export type RouteMap = {
  readonly [path: string]: RouteEntry
}

// ── Router options ──────────────────────────────────────────────

export interface RouterOptions {
  base?: string
  scroll?: boolean
}

// ── Resolved route (internal) ───────────────────────────────────

export interface ResolvedRoute {
  /** The leaf component to render */
  component: RouteComponent | null
  /** Guard component to render instead (if guard returned a Component) */
  guardComponent: RouteComponent | null
  /** Layout chain from outermost to innermost */
  layouts: RouteComponent[]
  /** Guards collected from the match chain (parent → child order) */
  guards: GuardFn[]
  /** Matched route pattern */
  pattern: string
  /** Extracted path params */
  params: Record<string, string>
  /** Match chain patterns */
  matches: string[]
  /** Redirect target if the matched entry is a redirect */
  redirect?: string
  /** Redirect method */
  redirectMethod?: 'push' | 'replace'
  /** Redirect status hint for SSR */
  redirectStatus?: number
  /** Whether the matched entry is a lazy component */
  isLazy?: boolean
  /** The lazy loader function */
  lazyLoader?: LazyComponent
  /** Query-mode metadata per layout */
  queryModes: Map<number, { activeKey: string; keys: string[]; param: string }>
}

// ── Navigation target ───────────────────────────────────────────

export interface NavigationTarget {
  path: string
  query?: Record<string, string | string[]>
  hash?: string
}

// ── Type inference helpers ───────────────────────────────────────

/** Extract :param names from a route pattern string */
export type ExtractParams<T extends string> = T extends `${string}:${infer Param}/${infer Rest}`
  ? { [K in Param]: string } & ExtractParams<Rest>
  : T extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : {}

// ── Child component extraction ──────────────────────────────────

/** Extract the component types from a children map into a union */
type ExtractChildComponents<Children> =
  Children extends Record<string, infer V> ? (V extends RouteComponent ? V : never) : never

// ── Child params extraction ─────────────────────────────────────

/** Extract params from all child path keys, merged with Partial */
type ExtractChildParams<Children> =
  Children extends Record<infer K, any> ? (K extends string ? Partial<ExtractParams<K>> : {}) : {}

/** Merge an intersection of objects into a single flat object */
type Simplify<T> = { [K in keyof T]: T[K] }

// ── Query mode detection ────────────────────────────────────────

/** Check if a mode config is QueryMode */
type IsQueryMode<Mode> = Mode extends { type: 'query'; param: string } ? true : false

// ── Layout props assembly ───────────────────────────────────────

/** Base props that every layout receives */
interface BaseLayoutProps<Children> {
  page: ExtractChildComponents<Children>
  route: string
  params: Simplify<ExtractChildParams<Children>>
}

/** Extra props for query-mode layouts */
interface QueryModeProps {
  activeKey: string
  keys: string[]
  navigate: (key: string) => void
}

/** Assemble props for a route group based on its children and mode */
type LayoutPropsForGroup<Group> = Group extends { children: infer C; mode: infer M }
  ? IsQueryMode<M> extends true
    ? BaseLayoutProps<C> & QueryModeProps
    : BaseLayoutProps<C>
  : Group extends { children: infer C }
    ? BaseLayoutProps<C>
    : never

// ── Router config extraction ────────────────────────────────────

/** Walk the route map and produce a mapped type of layout props per path */
type InferRoutePropsFromMap<T extends RouteMap> = {
  [K in keyof T as T[K] extends { children: any } ? K : never]: LayoutPropsForGroup<T[K]>
}

/** Infer layout props from a Router instance or RouteMap */
export type InferRouteProps<R> = R extends { routeConfig: infer T extends RouteMap }
  ? InferRoutePropsFromMap<T>
  : R extends RouteMap
    ? InferRoutePropsFromMap<R>
    : never
