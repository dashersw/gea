# @geajs/ssr

## 1.0.4

### Patch Changes

- [`79acc51`](https://github.com/dashersw/gea/commit/79acc5191a7e8d58557cd88376623f06bb98b7d3) Thanks [@dashersw](https://github.com/dashersw)! - Fix `@geajs/ssr` build after the layout-chain router update: the no-routes fallback in `handleRequest` now includes `layouts: []` and `queryModes: new Map()` so it satisfies `ServerRouteResult` and `tsup` DTS generation succeeds.

## 1.0.3

### Patch Changes

- [#74](https://github.com/dashersw/gea/pull/74) [`5d22388`](https://github.com/dashersw/gea/commit/5d22388c223fca35ee4bd00dc4834d03c8c40305) Thanks [@murerkinn](https://github.com/murerkinn)! - ### @geajs/ssr (patch)
  - **Render router layouts in SSR HTML**: `createServerRouter` now walks route groups to collect the `layout` chain (outermost → innermost) and captures `queryModes` metadata; `createSSRRouterState.getComponentAtDepth(depth)` mirrors the client `Router` — returning layouts at `depth < layoutCount` (with `page`/`route`/`params` props, plus `activeKey`/`keys`/`navigate` for query-mode depths) and the leaf at `depth === layoutCount`. Before this, SSR mounted the leaf component directly into `RouterView`'s host div and layouts only appeared after client hydration. The `RouteGroup` SSR type gains `layout` and `mode` fields to match the route shape the router config actually supports; `RouteGroup.component` is kept for backward compatibility but treated as an alias for `layout`.

- [`1fbec20`](https://github.com/dashersw/gea/commit/1fbec205b7ae061abd24e923c15a525830f63f1f) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/ssr (patch)
  - **Vite plugin no longer pulls `@geajs/core` into config-load**: extracted Node-side request/response helpers (`flattenHeaders`, `copyHeadersToNodeResponse`, `pipeToNodeResponse`, `NodeResponseWriter`) into a new `node-stream` module. `vite.ts` now imports from there instead of through `./types` / `./node`, so loading the SSR Vite plugin no longer transitively requires `@geajs/core`'s built `dist/`. Fresh clones can run e2e tests for SSR examples without a prior `npm run build`. Public API (`flattenHeaders`, `NodeResponseWriter`, `pipeToNodeResponse`) is preserved via re-exports.

## 1.0.2

### Patch Changes

- [`482eb6b`](https://github.com/dashersw/gea/commit/482eb6b87483d44977e56a03cd5f0e8240355f4a) Thanks [@dashersw](https://github.com/dashersw)! - Fix list reconciliation when stripping duplicate map output: walk to a keyed list ancestor so Card roots under keyed ProductCard rows strip correctly, while static compiled siblings (for example CommentCreate) remain. Improve DOM recovery of keyed rows from element hosts. Align store getter analysis, events, and SSR proxy serialization with the store naming refactor.

- [`20fe43c`](https://github.com/dashersw/gea/commit/20fe43c8cf86af3b47b5fd0bea36b0fb22cc85c5) Thanks [@dashersw](https://github.com/dashersw)! - Migrate Component and UI internals from string keys to Symbol keys for cleaner separation of engine state and user data. Update docs, README package tables, and examples list. Remove unused imports in vite-plugin.

## 1.0.1

### Patch Changes

- [`30c609b`](https://github.com/dashersw/gea/commit/30c609b1f101082fb297d4bac9b75297024f2214) Thanks [@dashersw](https://github.com/dashersw)! - Move the SSR root Store proxy handler from `@geajs/core` into `@geajs/ssr`, wired via `Store._rootProxyHandlerFactory`. Export `rootGetValue`, `rootSetValue`, and `rootDeleteProperty` for composition. Replace `Store._ssrOverlayResolver` and `Store._ssrDeleted` with the factory and `SSR_DELETED` from `@geajs/ssr`. Smaller browser bundles; SSR tests live under `@geajs/ssr`.
