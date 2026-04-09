export { handleRequest } from './handle-request'
export { createSSRRootProxyHandler, SSR_DELETED } from './ssr-proxy-handler'
export type { SSROptions } from './handle-request'
export type {
  GeaComponentConstructor,
  GeaComponentInstance,
  GeaStore,
  StoreRegistry,
  RouteMap,
  RouteEntry,
  RouteGroup,
  RouteGuard,
  SSRContext,
  JsonSerializable,
  JsonPrimitive,
  StoreSnapshot,
  StoreSnapshotEntry,
  NodeResponseWriter,
} from './types'
export { isRecord, isComponentConstructor, isRouteGroup, flattenHeaders } from './types'
export { escapeHtml } from './head'
