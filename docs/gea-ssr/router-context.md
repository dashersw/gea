# Router Context

The `router` singleton in `@geajs/core` is lazily instantiated and depends on browser APIs (`window`, `document`). During SSR, accessing `router.path` or `router.params` in a component would crash with `ReferenceError: window is not defined`.

`@geajs/ssr` solves this with per-request router state using `AsyncLocalStorage`. Each request gets a lightweight router state object pre-populated from the server-side route resolution. Components reading `router.path`, `router.params`, `router.query`, etc. get correct per-request values without the real Router ever being instantiated.

## How It Works

1. `handleRequest` resolves the route via `createServerRouter(url, routes)`
2. A plain state object is created from the result via `createSSRRouterState(routeResult)`
3. The state is stored in an `AsyncLocalStorage` context via `runWithSSRRouter(state, fn)`
4. The `router` singleton Proxy checks `Router._ssrRouterResolver` before instantiating the real Router — if it returns an object, reads are delegated to it
5. After the request completes, the state is garbage collected

This is automatic. If you use `handleRequest` with a `routes` option, router context is enabled.

## What's Available During SSR

Components can read these properties from the `router` singleton during server rendering:

| Property | Type | Description |
|---|---|---|
| `path` | `string` | Current request pathname (e.g., `/users/1`) |
| `route` | `string` | Matched route pattern (e.g., `/users/:id`) |
| `params` | `Record<string, string>` | Route parameters (e.g., `{ id: '1' }`) |
| `query` | `Record<string, string \| string[]>` | Query string parameters |
| `hash` | `string` | URL hash fragment |
| `matches` | `string[]` | Matched route patterns (for nested routes) |
| `error` | `null` | Always null during SSR |
| `page` | `Component \| null` | Resolved route component |

## What's NOT Available During SSR

Navigation methods are no-ops on the server:

- `router.push()`, `router.replace()`, `router.navigate()` — do nothing
- `router.back()`, `router.forward()`, `router.go()` — do nothing
- `router.dispose()` — does nothing

Layout-related properties return defaults:

- `router.layoutCount` — returns `0`
- `router.getComponentAtDepth()` — returns `null`

## Route Matching Helpers

`router.isActive(path)` and `router.isExact(path)` work during SSR with the resolved request path:

```tsx
// In a component template during SSR:
const activeClass = router.isActive('/about') ? 'active' : ''
```

- `isActive('/')` — exact match only (prevents root matching everything)
- `isActive('/users')` — prefix match (`/users`, `/users/1`, `/users/1/edit`)
- `isExact('/users/1')` — exact match only

## Guard Handling

Route guards are **skipped during SSR** (`createServerRouter` passes `skipGuards: true`). Guards may depend on browser-only APIs (localStorage, cookies via `document.cookie`, etc.). Protect sensitive routes at the server level using `onBeforeRender` or middleware instead.

## Manual Usage

For custom SSR pipelines outside of `handleRequest`:

```ts
import { Router } from '@geajs/core'
import { resolveSSRRouter, runWithSSRRouter, createSSRRouterState } from '@geajs/ssr'
import { createServerRouter } from '@geajs/ssr'

// Register the resolver once at startup
Router._ssrRouterResolver = resolveSSRRouter

// Per request:
const routeResult = createServerRouter(request.url, routes, true)
const state = createSSRRouterState(routeResult)

const html = runWithSSRRouter(state, () => {
  // router.path, router.params, etc. return this request's values
  return renderToString(App)
})
```

## Concurrency

Each request runs in its own `AsyncLocalStorage` context. Concurrent requests cannot interfere with each other's router state — the same isolation model used for stores.

## Relationship to Store Isolation

Router context and store isolation are independent `AsyncLocalStorage` contexts, nested inside `handleRequest`:

```
runInSSRContext(stores, () =>          // store overlays
  runWithSSRRouter(routerState, () =>  // router state
    renderToString(App)                // components read both
  )
)
```

Both are per-request and garbage collected after the handler returns.
