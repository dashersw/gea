# Getting Started

## Install

```bash
npm install @geajs/ssr
```

You need `@geajs/core` and `@geajs/vite-plugin` already set up. See the main [Getting Started](../getting-started.md) guide if you haven't done that.

## Four Files

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

The server entry exports a request handler. `handleRequest` takes your root component and options, returns a function that accepts a Fetch `Request` and returns a `Response`.

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

## Run It

```bash
npx vite
```

Your app renders on the server and hydrates on the client.

## File Structure

```
my-app/
  index.html              HTML shell with <div id="app">
  server.ts               SSR request handler
  vite.config.ts          Vite + geaPlugin + geaSSR
  src/
    main.ts               Client entry — hydrate()
    App.tsx                Root component
    store.ts               Application store
```

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

## Custom Server Entry

If your server file isn't `./server.ts`:

```ts
geaSSR({ serverEntry: './src/server.ts' })
```

## Next Steps

- [Handle Request](handle-request.md) — routing, data loading, head management, error handling
- [Hydration](hydration.md) — client-side store restoration and DOM adoption
- [Node Integration](node-integration.md) — production deployment with Express or Node http
