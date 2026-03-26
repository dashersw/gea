# Vite Plugin

`geaSSR` is a Vite plugin that integrates `@geajs/ssr` into the dev server. It intercepts page requests, loads your server entry via Vite's SSR module loader, and streams the response.

## Import

```ts
import { geaSSR } from '@geajs/ssr/vite'
```

## Configuration

```ts
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'
import { geaSSR } from '@geajs/ssr/vite'

export default defineConfig({
  plugins: [geaPlugin(), geaSSR()],
})
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `serverEntry` | `string` | `'./server.ts'` | Path to the server entry file |

```ts
geaSSR({ serverEntry: './src/server.ts' })
```

## What It Does

### Dev Server

1. Sets `appType: 'custom'` to disable Vite's built-in SPA fallback (history API fallback), so `req.url` is not rewritten to `/index.html`
2. Registers a middleware that intercepts non-asset requests
3. Loads the server entry via `server.ssrLoadModule()`
4. Reads and transforms `index.html` with `server.transformIndexHtml()` (injects Vite's client scripts)
5. Calls the exported handler with a Fetch `Request` and the transformed `indexHtml`
6. Pipes the `Response` body to the Node response

### Asset Passthrough

These requests skip SSR and pass through to Vite's static handler:

- Paths starting with `/@` (Vite internals)
- Paths starting with `/node_modules`
- Files with static asset extensions (`.js`, `.css`, `.ts`, `.tsx`, `.jsx`, `.json`, `.map`, `.png`, `.jpg`, `.gif`, `.svg`, `.ico`, `.webp`, `.avif`, `.woff2`, `.ttf`, `.eot`, `.mp3`, `.mp4`, `.webm`, `.ogg`, `.wav`)

### Build

When `build.ssr` is set in Vite config, the plugin configures Rollup's input to the server entry path. This is used for production SSR builds:

```bash
vite build --ssr
```

## Server Entry Contract

The server entry must export a default function that accepts a Fetch `Request` and returns a `Response`:

```ts
// server.ts
import { handleRequest } from '@geajs/ssr'
import App from './src/App'

export default handleRequest(App, { ... })
```

The plugin passes an additional `{ indexHtml }` context object as the second argument. `handleRequest` uses this to parse the shell template.

## Error Handling

If the server entry throws during SSR, the plugin:

1. Fixes the stack trace with `server.ssrFixStacktrace(error)` for accurate source maps
2. Logs the error to the console
3. Passes the error to Vite's error overlay via `next(error)`

## Recommendations

- Place `geaSSR()` after `geaPlugin()` in the plugins array. The compiler plugin must process JSX before SSR runs.
- Use the default `./server.ts` convention. It keeps the project structure predictable.
- For production, build the client and server separately, then use `createNodeHandler` from `@geajs/ssr/node` — the Vite plugin is for development only.
