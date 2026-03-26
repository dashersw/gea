# Store Isolation

Stores are singletons. During SSR, multiple requests share the same process. Without isolation, one request's data loading would overwrite another request's store state.

`@geajs/ssr` solves this with per-request data overlays using `AsyncLocalStorage`. Each request gets a deep clone of store data. All reads and writes within that request see the clone, not the original.

## How It Works

1. `handleRequest` calls `runInSSRContext(stores, fn)`
2. Each store's serializable data is deep-cloned into a `WeakMap<object, Record<string, unknown>>`
3. The `WeakMap` is stored in an `AsyncLocalStorage` context
4. The Store Proxy's get/set/delete traps call `resolveOverlay(target)` — if an overlay exists for this request, it reads/writes the clone instead of the original
5. After the request completes, the overlay is garbage collected

This is automatic. No action needed. If you pass a `storeRegistry` to `handleRequest`, isolation is enabled for those stores.

## What Gets Cloned

Only serializable data properties are cloned per request:

| Supported | Not Supported |
|---|---|
| Primitives (string, number, boolean, null, undefined) | Functions |
| Plain objects | Class instances |
| Arrays | Symbols |
| Dates | BigInts |
| | Getters (computed properties) |
| | Internal props (`_`-prefixed or suffixed) |

Unsupported types in store properties throw at clone time with a descriptive error:

```
[GEA SSR] Store property "user" contains an unsupported type (User).
Only primitives, plain objects, arrays, and Dates are supported in SSR store data.
```

## What Gets Serialized

Serialization (server → client transfer via `window.__GEA_STATE__`) uses [devalue](https://github.com/Rich-Harris/devalue) (`uneval`), which supports a broader set of types than cloning:

- Everything cloning supports, plus:
- Maps, Sets, BigInts, RegExps, URLs
- Circular and repeated references

Functions and internal properties are excluded from serialization.

## Proxy Unwrapping

Store instances are Proxy objects. The SSR context needs the raw target (not the Proxy) as the `WeakMap` key, because the Proxy handler passes `target` (not `this`) to `resolveOverlay`. The context uses `Reflect.get(store, '__getRawTarget')` to unwrap the Proxy before cloning.

## Manual Usage

For custom SSR pipelines outside of `handleRequest`:

```ts
import { runInSSRContext } from '@geajs/ssr'

const stores = [todoStore, userStore]

const html = await runInSSRContext(stores, async () => {
  // All store reads/writes here are isolated
  todoStore.todos = await fetchTodos()
  return renderToString(App)
})
```

`runInSSRContext` accepts both sync and async functions.

## Recommendations

- Keep store data serializable. If a store property holds a class instance, SSR will throw at clone time. Use plain objects.
- Don't rely on store state persisting after a request. The overlay is discarded after the handler returns.
- If you need non-serializable state (WebSocket connections, timers), keep it outside of stores or in properties prefixed with `_` — those are excluded from cloning and serialization.
