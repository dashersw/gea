---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Browser-compatible compiler entry point**: Added `browser.ts` and Rollup build config to produce a standalone browser bundle (`gea-compiler-browser.js`) for use in the interactive playground
- **CodeMirror editor bundle**: Added Rollup config and entry point to bundle CodeMirror with JavaScript/TypeScript support for the playground editor
- **Leaner generated observer setup**: Observer callbacks now use `.bind(this)` instead of arrow wrappers, and all observers are registered in a single `.push()` call instead of one per observer
- **Remove redundant try/catch from generated code**: Observer callbacks and `__onPropChange` inline patches no longer wrap in try/catch — the runtime already handles errors in `_notifyHandlers` and the props proxy setter respectively
- **Add `loggingCatchClause` utility**: Shared helper for the remaining compiler-generated catch blocks that need error logging (constructor init, array template init, props builder)
- **Expose `clearCaches` from analysis modules**: `store-getter-analysis` and `component-event-helpers` now export cache-clearing functions needed by the browser compiler

### @geajs/core (patch)

- **Error handling for property change callbacks**: The `__reactivePropsProxy` setter now wraps `__onPropChange` calls in try/catch with `console.error`, preventing a single prop-change error from breaking the proxy
