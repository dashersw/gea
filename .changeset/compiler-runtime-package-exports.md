---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **`onAfterRenderAsync` works with `@geajs/core` from npm**: with a published `@geajs/core`, `virtual:gea-compiler-runtime` re-exported a hand-written list of names that had fallen behind the runtime. Any component with `onAfterRenderAsync()` failed `vite build` with `"scheduleAfterRenderAsync" is not exported` and threw a `SyntaxError` in dev. The virtual module now re-exports the runtime with `export *`, so it can't drift from `@geajs/core` again.
- **Dev server works with pre-bundled `@geajs/core` under pnpm**: the plugin looked for `compiler-runtime.mjs` next to Vite's pre-bundled `@geajs/core` file or next to the plugin itself. Under pnpm neither exists, so dev failed with `Could not resolve @geajs/core compiler runtime` unless `@geajs/core` was added to `optimizeDeps.exclude`. The plugin now resolves `@geajs/core/compiler-runtime` through the package's `exports` the same way the app's `@geajs/core` import resolves, so in dev it is pre-bundled together with `@geajs/core` and both share one runtime instance. The `optimizeDeps.exclude` workaround is no longer needed and still works.
