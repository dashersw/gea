# Gea SSR Overview

`@geajs/ssr` renders Gea components on the server and hydrates them on the client. Streams HTML, serializes store state, isolates concurrent requests. No providers, no context, no ceremony.

## Installation

```bash
npm install @geajs/ssr
```

`@geajs/ssr` has a peer dependency on `@geajs/core` ^1.0.0. `vite` ^8.0.0 is optional — needed only for the dev plugin.

## How It Works

1. Browser requests a page
2. `geaSSR()` Vite plugin intercepts the request, loads `server.ts` via Vite's SSR module loader
3. `handleRequest` resolves the route, runs `onBeforeRender`, renders the component to an HTML string, serializes store state
4. Streams the response: shell + head tags, app HTML, `<script>window.__GEA_STATE__={...}</script>`
5. Browser receives HTML, displays it immediately
6. `hydrate()` restores store state from `window.__GEA_STATE__`, adopts the existing DOM, attaches event listeners and reactive bindings

## Components at a Glance

| Export | Entry | Purpose |
|---|---|---|
| [`handleRequest`](handle-request.md) | `@geajs/ssr` | Server-side render pipeline |
| [`hydrate`](hydration.md) | `@geajs/ssr/client` | Client-side hydration |
| [`createNodeHandler`](node-integration.md) | `@geajs/ssr/node` | Express / Node http adapter |
| [`geaSSR`](vite-plugin.md) | `@geajs/ssr/vite` | Vite dev server plugin |
| [`createSSRStream`](streaming.md) | `@geajs/ssr/stream` | Low-level streaming API |

## Quick Example

```ts
// server.ts
import { handleRequest } from '@geajs/ssr'
import App from './src/App'
import todoStore from './src/store'

export default handleRequest(App, {
  storeRegistry: { TodoStore: todoStore },

  routes: {
    '/': HomePage,
    '/about': AboutPage,
    '/todos/:id': TodoPage,
    '*': NotFoundPage,
  },

  async onBeforeRender(context) {
    const res = await fetch('https://api.example.com/todos')
    todoStore.todos = await res.json()
  },
})
```

```ts
// src/main.ts
import { hydrate } from '@geajs/ssr/client'
import App from './App'
import todoStore from './store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: { TodoStore: todoStore },
})
```

Four files total (add `index.html` and `vite.config.ts`). See [Getting Started](getting-started.md) for the full setup.

## Next Steps

- [Getting Started](getting-started.md) — minimal setup, four files
- [Handle Request](handle-request.md) — routing, data loading, head management, error handling
- [Hydration](hydration.md) — client-side hydration and store restoration
- [Store Isolation](store-isolation.md) — per-request state isolation
- [Streaming](streaming.md) — deferred streaming and low-level stream API
- [Node Integration](node-integration.md) — Express, Node http, production deployment
- [Vite Plugin](vite-plugin.md) — dev server setup and options
