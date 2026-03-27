---
"@geajs/core": patch
"@geajs/ssr": patch
---

Move the SSR root Store proxy handler from `@geajs/core` into `@geajs/ssr`, wired via `Store._rootProxyHandlerFactory`. Export `rootGetValue`, `rootSetValue`, and `rootDeleteProperty` for composition. Replace `Store._ssrOverlayResolver` and `Store._ssrDeleted` with the factory and `SSR_DELETED` from `@geajs/ssr`. Smaller browser bundles; SSR tests live under `@geajs/ssr`.
