# Handle Request

`handleRequest` is the main SSR entry point. It takes a root component and options, returns an async handler that accepts a Fetch `Request` and produces a streaming `Response`.

## Import

```ts
import { handleRequest } from '@geajs/ssr'
```

## Basic Usage

```ts
import App from './src/App'
import myStore from './src/store'

export default handleRequest(App, {
  storeRegistry: { MyStore: myStore },
})
```

The returned handler signature:

```ts
(request: Request, context?: { indexHtml?: string }) => Promise<Response>
```

## Routing

Pass a route map. Keys are URL patterns, values are components, redirect strings, or route groups.

```ts
export default handleRequest(App, {
  routes: {
    '/': HomePage,
    '/about': AboutPage,
    '/users/:id': UserPage,
    '*': NotFoundPage,
  },
  storeRegistry: { MyStore: myStore },
})
```

The matched route component is passed to your `App` via `props.__ssrRouteComponent` and `props.__ssrRouteProps`:

```tsx
export default class App extends Component {
  template() {
    const RouteComponent = this.props?.__ssrRouteComponent || HomePage
    const routeProps = this.props?.__ssrRouteProps || {}
    const view = new RouteComponent(routeProps)
    return view.template(routeProps)
  }
}
```

Unmatched routes return `404`. Matched routes return `200`.

### Pattern Reference

| Pattern | Example URL | Params |
|---|---|---|
| `/about` | `/about` | `{}` |
| `/users/:id` | `/users/42` | `{ id: '42' }` |
| `/users/:userId/posts/:postId` | `/users/7/posts/99` | `{ userId: '7', postId: '99' }` |
| `*` | `/anything` | `{}` |

Named parameters (`:param`) match a single path segment. Parameter values are URI-decoded. Wildcards (`*`) match any path not matched by other routes.

### Route Guards

Guards control access to route groups. A guard returns `true` to allow or a redirect path string.

```ts
routes: {
  '/dashboard': {
    component: DashboardPage,
    guard: () => isAuthenticated() || '/login',
    children: {
      '/settings': SettingsPage,
    },
  },
}
```

Guard redirects produce a `302` response with a `Location` header. Guards on nested groups stack — the parent guard runs first. The child guard only runs if the parent passes.

### Redirects

A string value instead of a component triggers a redirect.

```ts
routes: {
  '/old-path': '/new-path',
}
```

## Data Loading

`onBeforeRender` runs before rendering. Use it to populate stores with server-side data.

```ts
export default handleRequest(App, {
  storeRegistry: { TodoStore: todoStore },

  async onBeforeRender(context) {
    const data = await fetch(`https://api.example.com/todos`)
    todoStore.todos = await data.json()
  },
})
```

### SSRContext

The `context` object passed to `onBeforeRender` and `afterResponse`:

| Property | Type | Description |
|---|---|---|
| `request` | `Request` | The incoming Fetch API request |
| `params` | `Record<string, string>` | Route params (`:id`) |
| `query` | `Record<string, string \| string[]>` | Query string values |
| `hash` | `string` | URL hash |
| `route` | `string` | Matched route pattern |
| `head` | `HeadConfig` | Set to inject `<head>` tags |
| `deferreds` | `DeferredChunk[]` | Set to stream deferred content |

## Head Management

Set `context.head` in `onBeforeRender` to inject tags before `</head>`:

```ts
async onBeforeRender(context) {
  context.head = {
    title: 'My Page Title',
    meta: [
      { name: 'description', content: 'Page description' },
      { property: 'og:title', content: 'OG Title' },
    ],
    link: [
      { rel: 'canonical', href: 'https://example.com/page' },
    ],
  }
}
```

All attribute values are HTML-escaped.

## Error Handling

Two error paths, two handlers.

### Render Errors

A component throws during `template()`. The page still renders — the error is replaced with fallback HTML:

```ts
export default handleRequest(App, {
  onRenderError(error) {
    return `<div class="error">${error.message}</div>`
  },
})
```

The response status is still `200`. The fallback HTML is inlined where the component would have rendered.

### Data/Routing Errors

Thrown in `onBeforeRender` or during routing. You control the full response:

```ts
export default handleRequest(App, {
  onError(error, request) {
    return new Response(`<html><body>Error: ${error.message}</body></html>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  },
})
```

Errors get a deterministic digest (`gea-[hash]`) attached as `error.digest`. If `onError` is not provided, a plain `500 Internal Server Error` is returned.

## After-Response Hook

Runs after the full response has been streamed. Does not fire on errors.

```ts
export default handleRequest(App, {
  async afterResponse(context) {
    await analytics.track('page_view', { route: context.route })
  },
})
```

## Options Reference

```ts
handleRequest(App, {
  routes?: RouteMap,
  storeRegistry?: StoreRegistry,
  indexHtml?: string,
  shell?: { appElementId?: string },
  onBeforeRender?: (context: SSRContext) => Promise<void> | void,
  onRenderError?: (error: Error) => string,
  onError?: (error: Error, request: Request) => Response | Promise<Response>,
  afterResponse?: (context: SSRContext) => Promise<void> | void,
})
```

Returns `(request: Request, context?: { indexHtml?: string }) => Promise<Response>`.

## Recommendations

- Always include a `'*'` catch-all route. Without it, unmatched URLs produce no component output.
- Put data fetching in `onBeforeRender`, not in component `created()` hooks. Components should render synchronously from store state.
- Use `onRenderError` for graceful degradation. Without it, render errors bubble up to `onError` and produce a full error page.
- Keep guards simple. A guard should check a condition and return. Async work belongs in stores, triggered from `onBeforeRender`.
