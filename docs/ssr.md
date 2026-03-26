# Server-Side Rendering

`@geajs/ssr` renders Gea components on the server and hydrates them on the client. Streams HTML, serializes store state, isolates concurrent requests. No providers, no context, no ceremony.

## Installation

```bash
npm install @geajs/ssr
```

`@geajs/ssr` has a peer dependency on `@geajs/core` ^1.0.0. `vite` ^8.0.0 is optional — needed only for the dev plugin.

## Quick Start

Four files. That's it.

### 1. `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <script type="module" src="./src/main.ts"></script>
</head>
<body>
  <div id="app"></div>
</body>
</html>
```

### 2. `server.ts`

```ts
import { handleRequest } from '@geajs/ssr'
import App from './src/App'
import myStore from './src/store'

export default handleRequest(App, {
  storeRegistry: { MyStore: myStore },
})
```

### 3. `src/main.ts` (client entry)

```ts
import { hydrate } from '@geajs/ssr/client'
import App from './App'
import myStore from './store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: { MyStore: myStore },
})
```

### 4. `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'
import { geaSSR } from '@geajs/ssr/vite'

export default defineConfig({
  plugins: [geaPlugin(), geaSSR()],
})
```

Run it:

```bash
npx vite
```

Your app renders on the server and hydrates on the client.

## How It Works

1. Browser requests a page
2. `geaSSR()` Vite plugin intercepts the request, loads `server.ts` via Vite's SSR module loader
3. `handleRequest` resolves the route, runs `onBeforeRender`, renders the component to an HTML string, serializes store state
4. Streams the response: shell + head tags, app HTML, `<script>window.__GEA_STATE__={...}</script>`
5. Browser receives HTML, displays it immediately
6. `hydrate()` restores store state from `window.__GEA_STATE__`, adopts the existing DOM, attaches event listeners and reactive bindings

## Routing

Pass a route map to `handleRequest`. Keys are URL patterns, values are components, redirect strings, or route groups.

```ts
import HomePage from './src/pages/HomePage'
import AboutPage from './src/pages/AboutPage'
import UserPage from './src/pages/UserPage'
import NotFoundPage from './src/pages/NotFoundPage'

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

Dynamic params (`:id`) are available in `context.params`. Query string in `context.query`. The matched route component is passed to your `App` via `props.__ssrRouteComponent` and `props.__ssrRouteProps`.

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

Unmatched routes return a `404` status. Matched routes return `200`.

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

### Pattern Reference

| Pattern | Example URL | Params |
|---|---|---|
| `/about` | `/about` | `{}` |
| `/users/:id` | `/users/42` | `{ id: '42' }` |
| `/users/:userId/posts/:postId` | `/users/7/posts/99` | `{ userId: '7', postId: '99' }` |
| `*` | `/anything` | `{}` |

Named parameters (`:param`) match a single path segment. Parameter values are URI-decoded. Wildcards (`*`) match any path not matched by other routes.

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

## Deferred Streaming

Stream content that resolves after the initial HTML. The browser shows the page immediately — deferred chunks replace placeholders as they resolve.

Set `context.deferreds` in `onBeforeRender`:

```ts
async onBeforeRender(context) {
  context.deferreds = [
    {
      id: 'slow-data',
      promise: fetchSlowData().then(data =>
        `<div class="loaded">${data}</div>`
      ),
    },
  ]
}
```

In your component, render a placeholder with the matching `id`:

```html
<div id="slow-data">Loading...</div>
```

When the promise resolves, a `<script>` is streamed that replaces the placeholder's content with the resolved HTML. If the promise rejects or times out, the placeholder stays — graceful degradation.

### Stream Timeout

Deferred chunks time out after 10 seconds by default. Set `streamTimeout` on `createSSRStream` to change it.

### CSP Nonce

If your Content Security Policy requires script nonces, pass `nonce` to `createSSRStream`. It is added to all inline `<script>` tags (state injection and deferred replacement scripts).

## After-Response Hook

Runs after the full response has been streamed to the client. Does not fire on errors.

```ts
export default handleRequest(App, {
  async afterResponse(context) {
    await analytics.track('page_view', { route: context.route })
  },
})
```

## Store Isolation

Stores are singletons. During SSR, each request gets an isolated data overlay via `AsyncLocalStorage` so concurrent requests never leak state between each other.

This is automatic. No action needed.

The store registry key names must match between server and client:

```ts
// server.ts
storeRegistry: { TodoStore: todoStore }

// src/main.ts
storeRegistry: { TodoStore: todoStore }
```

### What Gets Serialized

Serialization uses [devalue](https://github.com/Rich-Harris/devalue) (`uneval`). Supported types:

- Primitives, plain objects, arrays, Dates
- Circular and repeated references
- Maps, Sets, BigInts, RegExps, URLs

Functions and internal properties (prefixed or suffixed with `_`) are excluded.

### What Gets Cloned Per Request

Store data is deep-cloned into the per-request overlay. Only primitives, plain objects, arrays, and Dates are supported in SSR store data. Class instances, Symbols, and BigInts in store properties throw at clone time.

## Hydration

`hydrate()` restores server-rendered state and attaches reactivity to existing DOM.

```ts
import { hydrate } from '@geajs/ssr/client'
import App from './App'
import myStore from './store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: { MyStore: myStore },
})
```

The hydration sequence:

1. Restore store state from `window.__GEA_STATE__`
2. Reset UID counter to `0` to match server-generated component IDs
3. Adopt existing DOM — set `element_` to the first child, mark as rendered
4. Attach reactive bindings, event handlers, and child components
5. Fire `onAfterRender` lifecycle hooks

If the target element is empty (no server HTML), `hydrate` falls back to a full client-side render.

### Dev-Mode Mismatch Detection

In development, `hydrate` re-renders the component after mounting and compares the output to the server HTML. If they differ, a warning is logged with both versions (truncated to 200 characters). This check runs in a `setTimeout` after all lifecycle hooks complete and uses dynamic `import()` to avoid pulling server code into the production client bundle.

## Node.js Integration

For production without Vite:

```ts
import { createNodeHandler } from '@geajs/ssr/node'
import App from './App'
import myStore from './store'

const handler = createNodeHandler(App, {
  storeRegistry: { MyStore: myStore },
  indexHtml: readFileSync('./dist/client/index.html', 'utf-8'),
})

// Express
app.use('*', handler)

// Node http
http.createServer(handler).listen(3000)
```

`createNodeHandler` converts between Node's `IncomingMessage`/`ServerResponse` and the Fetch API internally. It handles HTTPS detection, header flattening, request body streaming, and response backpressure.

### `pipeToNodeResponse`

Lower-level utility for piping a `ReadableStream` to a Node response. Handles backpressure (waits for `drain` events) and cancels the stream reader if the client disconnects.

```ts
import { pipeToNodeResponse } from '@geajs/ssr/node'

const stream = createSSRStream({ ... })
res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
await pipeToNodeResponse(stream, res)
```

## Vite Plugin Options

```ts
geaSSR({
  serverEntry: './server.ts',  // default: './server.ts'
})
```

The plugin sets `appType: 'custom'` to disable Vite's SPA fallback. In dev, it intercepts non-asset requests, loads the server module, transforms `index.html`, and pipes the SSR response. Asset requests (JS, CSS, images, fonts) pass through to Vite's static handler.

## Custom App Element ID

If your `<div>` uses a different `id` than `"app"`:

```html
<div id="root"></div>
```

```ts
export default handleRequest(App, {
  shell: { appElementId: 'root' },
})
```

## Low-Level API

For custom streaming setups outside of `handleRequest`.

### `createSSRStream`

```ts
import { createSSRStream } from '@geajs/ssr/stream'

const stream = createSSRStream({
  shellBefore: string,                                 // HTML before app element
  shellAfter: string,                                  // HTML after app element
  headHtml?: string,                                   // Tags to inject before </head>
  headEnd?: number,                                    // Position of </head> in shellBefore
  render: () => Promise<{ appHtml, stateJson }>,       // Render function
  deferreds?: DeferredChunk[],                         // Deferred chunks
  streamTimeout?: number,                              // Default: 10_000 (10s)
  nonce?: string,                                      // CSP nonce for inline scripts
})
```

Produces a `ReadableStream<Uint8Array>` with this chunk sequence:

1. Shell HTML with injected head tags (flushed immediately)
2. Rendered app HTML
3. `<script>window.__GEA_STATE__={...}</script>` + closing tags
4. One `<script>` per resolved deferred (streamed as they resolve)

### `renderToString`

```ts
import { renderToString } from '@geajs/ssr/render'

const html = renderToString(App, props?, {
  onRenderError?: (error: Error) => string,
})
```

Resets the UID counter, instantiates the component, calls `template()`, returns the trimmed HTML string.

### `parseShell`

```ts
import { parseShell } from '@geajs/ssr/shell'

const { before, after, headEnd } = parseShell(indexHtml, 'app')
```

Splits `index.html` at the app element. Throws if the element is not found.

## Options Reference

### `handleRequest(App, options?)`

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

### `hydrate(App, element, options?)`

```ts
hydrate(App, element, {
  storeRegistry?: StoreRegistry,
})
```

Throws if `element` is `null`.

### `createNodeHandler(App, options?)`

```ts
createNodeHandler(App, {
  // Same options as handleRequest
})
```

Returns `(req: IncomingMessage, res: ServerResponse) => Promise<void>`.

### `geaSSR(options?)`

```ts
geaSSR({
  serverEntry?: string,  // default: './server.ts'
})
```

Returns a Vite `Plugin`.
