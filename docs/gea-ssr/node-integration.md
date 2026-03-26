# Node Integration

For production deployment without Vite. `createNodeHandler` converts between Node's `IncomingMessage`/`ServerResponse` and the Fetch API used internally by `handleRequest`.

## Import

```ts
import { createNodeHandler } from '@geajs/ssr/node'
```

## Basic Usage

```ts
import { createNodeHandler } from '@geajs/ssr/node'
import { readFileSync } from 'node:fs'
import App from './App'
import myStore from './store'

const handler = createNodeHandler(App, {
  storeRegistry: { MyStore: myStore },
  indexHtml: readFileSync('./dist/client/index.html', 'utf-8'),
})
```

### Express

```ts
app.use('*', handler)
```

### Node http

```ts
import http from 'node:http'

http.createServer(handler).listen(3000)
```

## What It Does

1. Constructs a full URL from the request's protocol, host header, and path
2. Detects HTTPS from `req.socket.encrypted`
3. Converts Node headers to a flat `Record<string, string>` (array values joined with `, `)
4. Streams request body (for POST/PUT/PATCH) as a `ReadableStream`
5. Passes the Fetch `Request` to `handleRequest`
6. Copies response status, headers, and body back to the Node `ServerResponse`
7. Preserves multiple `Set-Cookie` headers as an array

The handler signature:

```ts
(req: IncomingMessage, res: ServerResponse) => Promise<void>
```

Options are the same as `handleRequest` — see [Handle Request](handle-request.md) for the full reference.

## `pipeToNodeResponse`

Lower-level utility for piping a Fetch `ReadableStream` to a Node response. Handles backpressure and client disconnection.

```ts
import { pipeToNodeResponse } from '@geajs/ssr/node'

const stream = createSSRStream({ ... })
res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
await pipeToNodeResponse(stream, res)
```

Backpressure handling:
- Checks `res.write()` return value
- If the buffer is full, waits for the `drain` event before writing the next chunk
- Cancels the stream reader and stops writing if the client disconnects (`close` event)
- Calls `res.end()` when the stream is fully consumed

The `res` parameter accepts any object matching the `NodeResponseWriter` interface:

| Method | Description |
|---|---|
| `write(chunk: Uint8Array): boolean` | Write a chunk, return `false` if buffer full |
| `end(): void` | Signal end of response |
| `once(event, listener)` | One-time event listener |
| `on(event, listener)` | Event listener |
| `removeListener(event, listener)` | Remove event listener |

## Recommendations

- Always pass `indexHtml` in production. Without it, `handleRequest` uses a minimal fallback template that lacks your CSS, fonts, and client scripts.
- Serve static assets (JS, CSS, images) with a separate middleware or CDN. The SSR handler should only process page requests.
- For Express, mount the handler after static file middleware so asset requests don't hit SSR.
