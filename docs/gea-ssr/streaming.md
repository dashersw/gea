# Streaming

`@geajs/ssr` streams HTML in chunks. The browser displays the shell immediately while the app renders. Deferred content replaces placeholders as it resolves — no client-side JavaScript needed for the swap.

## Default Streaming (via handleRequest)

When you use `handleRequest`, streaming is automatic. The response is a `ReadableStream` with this chunk sequence:

1. **Shell** — HTML up to the app element, with injected `<head>` tags (flushed immediately)
2. **App HTML** — rendered component output
3. **State** — `<script>window.__GEA_STATE__={...}</script>` + closing HTML tags
4. **Deferreds** — one `<script>` per resolved deferred chunk (streamed individually as they resolve)

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
    {
      id: 'recommendations',
      promise: fetchRecommendations().then(items =>
        items.map(i => `<li>${i.name}</li>`).join('')
      ),
    },
  ]
}
```

In your component, render placeholders with matching `id` attributes:

```jsx
template() {
  return (
    <div>
      <h1>Dashboard</h1>
      <div id="slow-data">Loading...</div>
      <ul id="recommendations"><li>Loading...</li></ul>
    </div>
  )
}
```

When a promise resolves, a `<script>` tag is streamed that replaces the placeholder element with the resolved HTML using `document.getElementById` + `replaceWith`. If the promise rejects or times out, the placeholder stays — graceful degradation.

### DeferredChunk

```ts
interface DeferredChunk {
  id: string              // Element ID to replace
  promise: Promise<string> // Resolves to HTML content
}
```

### Stream Timeout

Deferreds time out after 10 seconds by default. Timed-out deferreds are silently skipped — the fallback HTML remains.

### CSP Nonce

If your Content Security Policy requires script nonces, pass `nonce` to `createSSRStream`. It is added as a `nonce` attribute to all inline `<script>` tags — both the state injection script and deferred replacement scripts.

## Low-Level API: `createSSRStream`

For custom streaming setups outside of `handleRequest`.

```ts
import { createSSRStream } from '@geajs/ssr/stream'
import { renderToString } from '@geajs/ssr/render'
import { parseShell } from '@geajs/ssr/shell'

const shell = parseShell(indexHtml, 'app')
const appHtml = renderToString(App)

const stream = createSSRStream({
  shellBefore: shell.before,
  shellAfter: shell.after,
  headHtml: '<title>My Page</title>',
  headEnd: shell.headEnd,
  render: async () => ({ appHtml, stateJson: '{}' }),
  deferreds: [
    { id: 'slow', promise: fetchSlow().then(html => html) },
  ],
  streamTimeout: 5000,
  nonce: 'abc123',
})

return new Response(stream, {
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
})
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `shellBefore` | `string` | required | HTML before the app element |
| `shellAfter` | `string` | required | HTML after the app element |
| `headHtml` | `string` | `undefined` | Tags to inject before `</head>` |
| `headEnd` | `number` | `undefined` | Character position of `</head>` in `shellBefore` |
| `render` | `() => Promise<{ appHtml, stateJson }>` | required | Async render function |
| `deferreds` | `DeferredChunk[]` | `undefined` | Deferred chunks to stream |
| `streamTimeout` | `number` | `10_000` | Milliseconds before deferreds time out |
| `nonce` | `string` | `undefined` | CSP nonce for inline scripts |

Returns `ReadableStream<Uint8Array>`.

## Helper: `renderToString`

```ts
import { renderToString } from '@geajs/ssr/render'

const html = renderToString(App, props?, {
  onRenderError?: (error: Error) => string,
})
```

Resets the UID counter, instantiates the component, calls `template()`, returns the trimmed HTML string. If the component throws and `onRenderError` is provided, the error handler's return value is used instead.

## Helper: `parseShell`

```ts
import { parseShell } from '@geajs/ssr/shell'

const { before, after, headEnd } = parseShell(indexHtml, 'app')
```

Splits `index.html` at the app element. Returns the HTML before the element, after the element, and the character position of `</head>` for head injection. Throws if the element is not found.

## Recommendations

- Use `context.deferreds` through `handleRequest` for most use cases. The low-level `createSSRStream` is for custom pipelines.
- Keep deferred content independent. Each deferred resolves on its own — one slow promise doesn't block others.
- Set realistic timeouts. A 10-second default is generous. For critical content, lower it. For truly optional content, the default is fine.
- Don't defer above-the-fold content. The initial HTML should contain everything the user sees on first paint. Defer below-the-fold or supplementary data.
