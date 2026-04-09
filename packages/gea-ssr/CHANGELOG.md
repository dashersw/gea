# @geajs/ssr

## 1.0.2

### Patch Changes

- [`482eb6b`](https://github.com/dashersw/gea/commit/482eb6b87483d44977e56a03cd5f0e8240355f4a) Thanks [@dashersw](https://github.com/dashersw)! - Fix list reconciliation when stripping duplicate map output: walk to a keyed list ancestor so Card roots under keyed ProductCard rows strip correctly, while static compiled siblings (for example CommentCreate) remain. Improve DOM recovery of keyed rows from element hosts. Align store getter analysis, events, and SSR proxy serialization with the store naming refactor.

- [`20fe43c`](https://github.com/dashersw/gea/commit/20fe43c8cf86af3b47b5fd0bea36b0fb22cc85c5) Thanks [@dashersw](https://github.com/dashersw)! - Migrate Component and UI internals from string keys to Symbol keys for cleaner separation of engine state and user data. Update docs, README package tables, and examples list. Remove unused imports in vite-plugin.

## 1.0.1

### Patch Changes

- [`30c609b`](https://github.com/dashersw/gea/commit/30c609b1f101082fb297d4bac9b75297024f2214) Thanks [@dashersw](https://github.com/dashersw)! - Move the SSR root Store proxy handler from `@geajs/core` into `@geajs/ssr`, wired via `Store._rootProxyHandlerFactory`. Export `rootGetValue`, `rootSetValue`, and `rootDeleteProperty` for composition. Replace `Store._ssrOverlayResolver` and `Store._ssrDeleted` with the factory and `SSR_DELETED` from `@geajs/ssr`. Smaller browser bundles; SSR tests live under `@geajs/ssr`.
