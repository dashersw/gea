---
"@geajs/vite-plugin": minor
---

### @geajs/vite-plugin (minor)

- **Emitter registry architecture**: Introduced `src/emit/` layer with pluggable `PatchEmitter` interface. Each binding type (text, class, attribute, style, checked, value) is now a self-contained emitter module. Adding new binding types requires only creating a new emitter and registering it — no changes to orchestrator files.

- **Generic AST deep-map**: Replaced 7+ hand-rolled recursive visitors (300+ lines each) across `prop-ref-utils.ts`, `optionalize-utils.ts`, and `subpath-cache.ts` with generic `deepMap`/`deepMapExpr`/`walk` helpers using `t.VISITOR_KEYS`. Total savings: ~830 lines of duplicated boilerplate.

- **Unified array create/patch loop**: Extracted shared `buildRefCacheAndApply` in `gen-array-patch.ts` — the createItem and patchItem methods now share the same ref-cache + emit loop instead of duplicating it.

- **eszter tagged templates**: Converted verbose `t.*` Babel AST builder towers to readable eszter tagged templates (`js`, `jsExpr`, `jsMethod`, `id`, etc.) across all codegen files.

- **Total reduction**: 20,467 → 18,029 lines (2,438 lines eliminated, 11.9% reduction) with all 410 unit tests passing.
