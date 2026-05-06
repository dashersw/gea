---
"@geajs/ssr": patch
---

### @geajs/ssr (patch)

- **Vite plugin no longer pulls `@geajs/core` into config-load**: extracted Node-side request/response helpers (`flattenHeaders`, `copyHeadersToNodeResponse`, `pipeToNodeResponse`, `NodeResponseWriter`) into a new `node-stream` module. `vite.ts` now imports from there instead of through `./types` / `./node`, so loading the SSR Vite plugin no longer transitively requires `@geajs/core`'s built `dist/`. Fresh clones can run e2e tests for SSR examples without a prior `npm run build`. Public API (`flattenHeaders`, `NodeResponseWriter`, `pipeToNodeResponse`) is preserved via re-exports.
