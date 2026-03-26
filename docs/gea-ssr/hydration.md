# Hydration

`hydrate` restores server-rendered state and attaches reactivity to existing DOM. No full re-render — it adopts the server HTML and wires up event listeners and reactive bindings.

## Import

```ts
import { hydrate } from '@geajs/ssr/client'
```

## Basic Usage

```ts
import App from './App'
import myStore from './store'

hydrate(App, document.getElementById('app'), {
  storeRegistry: { MyStore: myStore },
})
```

Throws if `element` is `null`.

## Hydration Sequence

1. Restore store state from `window.__GEA_STATE__`
2. Reset UID counter to `0` to match server-generated component IDs
3. Adopt existing DOM — set `element_` to the first child element, mark as rendered
4. Attach reactive bindings (`attachBindings_`)
5. Mount compiled child components (`mountCompiledChildComponents_`)
6. Instantiate child components (`instantiateChildComponents_`)
7. Set up event directives (`setupEventDirectives_`)
8. Fire `onAfterRender` and `onAfterRenderHooks` lifecycle hooks

## Fallback to Client Render

If the target element has no children (no server HTML), `hydrate` falls back to a full client-side render by calling `app.render(element)`. This means the same client entry works whether the page was server-rendered or not.

## Store State Restoration

`restoreStoreState` reads from `window.__GEA_STATE__` (set by the server's `<script>` tag) and writes each property back to the matching store instance.

```ts
import { restoreStoreState } from '@geajs/ssr/client'

restoreStoreState(storeRegistry, {
  preserveNull: false,  // default
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `preserveNull` | `boolean` | `false` | If `true`, null values from SSR overwrite client-initialized values. By default, client values are preserved over SSR nulls. |

Properties that are skipped:
- Internal props (prefixed or suffixed with `_`)
- `constructor` and `__proto__`
- Read-only properties (caught silently)

The store registry key names must match between server and client:

```ts
// server.ts
storeRegistry: { TodoStore: todoStore }

// src/main.ts
storeRegistry: { TodoStore: todoStore }
```

## Dev-Mode Mismatch Detection

In development (`import.meta.env.DEV`), `hydrate` re-renders the component after mounting and compares the output to the server HTML. If they differ, a warning is logged:

```
[gea-ssr] Hydration mismatch detected.
Server HTML: <div class="app"><h1>Hello</h1>...
Client HTML: <div class="app"><h1>World</h1>...
```

The check:
- Runs in a `setTimeout(0)` after all lifecycle hooks complete
- Uses dynamic `import()` for `renderToString` and `detectHydrationMismatch` — these modules are not included in the production client bundle
- Compares normalized HTML (whitespace-collapsed)
- Truncates output to 200 characters per side

Common causes of mismatches:
- Store state differs between server and client initialization
- Components use `Date.now()`, `Math.random()`, or other non-deterministic values in `template()`
- Server and client see different environment variables

## Options Reference

```ts
hydrate(App, element, {
  storeRegistry?: StoreRegistry,
})
```

## Recommendations

- Use `hydrate` instead of `app.render()` for SSR pages. It preserves the server HTML and avoids a flash of empty content.
- Keep store registries identical between server and client. Mismatched keys mean state won't restore.
- Fix hydration mismatch warnings immediately. They indicate the client will produce different HTML than the server, which causes layout shifts and broken event handlers.
