# Server-Side Routing

`handleRequest` resolves routes automatically. For custom SSR pipelines, `createServerRouter` provides the same route resolution as a standalone function.

## Import

```ts
import { createServerRouter } from '@geajs/ssr'
```

## Usage

```ts
const result = createServerRouter(request.url, routes, skipGuards)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | required | Full request URL |
| `routes` | `RouteMap` | required | Route map (same format as `handleRequest`) |
| `skipGuards` | `boolean` | `false` | Skip guard evaluation (set `true` during SSR) |

Returns a `ServerRouteResult`:

```ts
interface ServerRouteResult {
  path: string                          // Pathname (e.g., '/users/1')
  route: string                         // Matched pattern (e.g., '/users/:id')
  params: Record<string, string>        // Extracted route params
  query: Record<string, string | string[]>  // Query string values
  hash: string                          // URL hash fragment
  matches: string[]                     // All matched patterns (for nested routes)
  component: GeaComponentConstructor | null // Resolved component
  guardRedirect: string | null          // Redirect target from guard
  isNotFound: boolean                   // True if no route matched or wildcard matched
}
```

## Route Resolution Order

Routes are checked in definition order:

1. **String redirects** — If the entry value is a string, a match triggers `guardRedirect` with that string
2. **Route groups** — If the entry has `children`, a prefix match is attempted. The remaining path is resolved against children recursively. Guards are evaluated (unless `skipGuards` is true)
3. **Component routes** — An exact pattern match resolves to the component
4. **Wildcard** — `'*'` is checked last as a fallback. Sets `isNotFound: true`

If nothing matches, the result has empty fields and `isNotFound: true`.

## Pattern Matching

| Pattern | Matches | Params |
|---|---|---|
| `/about` | `/about` exactly | `{}` |
| `/users/:id` | `/users/42` | `{ id: '42' }` |
| `/posts/:postId/comments/:commentId` | `/posts/7/comments/3` | `{ postId: '7', commentId: '3' }` |
| `*` | Anything not matched above | `{}` |

Named parameters (`:param`) match a single path segment. Values are URI-decoded. Pattern and path must have the same number of segments for an exact match.

## Nested Routes

Route groups create nested resolution. The parent pattern is a prefix match — the remaining path resolves against children:

```ts
const routes = {
  '/dashboard': {
    guard: () => isAuthenticated() || '/login',
    children: {
      '/': DashboardHome,       // /dashboard
      '/settings': Settings,    // /dashboard/settings
      '/profile': Profile,      // /dashboard/profile
    },
  },
  '*': NotFound,
}

const result = createServerRouter('http://localhost/dashboard/settings', routes, true)
// result.route = '/settings'
// result.matches = ['/dashboard', '/settings']
// result.component = Settings
// result.params = {}
```

Parent params merge with child params:

```ts
const routes = {
  '/users/:userId': {
    children: {
      '/posts/:postId': PostPage,
    },
  },
}

const result = createServerRouter('http://localhost/users/5/posts/42', routes, true)
// result.params = { userId: '5', postId: '42' }
```

## Guard Handling

When `skipGuards` is `false`, guards are evaluated during resolution. A guard that returns a string sets `guardRedirect`. A guard that returns a non-`true` falsy value sets `guardRedirect` to `null` (blocks without redirect).

During SSR, always pass `skipGuards: true`. Guards may depend on browser APIs (localStorage, document.cookie). `handleRequest` does this automatically.

## Query String Handling

Duplicate query keys are coalesced into arrays:

```ts
// URL: /search?tag=js&tag=ts&page=1
const result = createServerRouter('http://localhost/search?tag=js&tag=ts&page=1', routes, true)
// result.query = { tag: ['js', 'ts'], page: '1' }
```

## Example: Custom SSR Pipeline

```ts
import { createServerRouter } from '@geajs/ssr'
import { renderToString } from '@geajs/ssr'
import { runWithSSRRouter, createSSRRouterState } from '@geajs/ssr'

const routes = {
  '/': HomePage,
  '/about': AboutPage,
  '*': NotFoundPage,
}

async function handleSSR(request: Request): Promise<Response> {
  const routeResult = createServerRouter(request.url, routes, true)

  if (routeResult.guardRedirect) {
    return new Response(null, {
      status: 302,
      headers: { Location: routeResult.guardRedirect },
    })
  }

  const ssrRouterState = createSSRRouterState(routeResult)
  const html = runWithSSRRouter(ssrRouterState, () => {
    return renderToString(App, {
      __ssrRouteComponent: routeResult.component,
      __ssrRouteProps: routeResult.params,
    })
  })

  return new Response(html, {
    status: routeResult.isNotFound ? 404 : 200,
    headers: { 'Content-Type': 'text/html' },
  })
}
```
