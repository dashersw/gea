---
"@geajs/vite-plugin": minor
---

### @geajs/vite-plugin (minor)

**Modular compiler architecture rewrite — 20,467 → 17,390 lines (15% reduction), all 410 tests pass.**

#### Architecture changes

- **Emitter registry** (`src/emit/`): Pluggable `PatchEmitter` interface for binding-type dispatch. Each binding type (text, class, attribute, style, checked, value) is a self-contained emitter module. Adding new binding types: create emitter file + 1-line registration.

- **Split gen-reactivity.ts** (2,285 lines → 5 focused modules):
  - `reactivity.ts` — orchestrator with main state props loop
  - `reactivity-arrays.ts` — array map processing
  - `reactivity-bindings.ts` — prop binding analysis
  - `reactivity-wiring.ts` — observer registration + createdHooks
  - `reactivity-types.ts` — shared ReactivityContext type

- **Shared JSX walker** (`analyze/jsx-walker.ts`): Shared `walkJSX()`, `classifyAttribute()`, `isEventAttribute()`, `isMapCall()` utilities used by both template-walker (analysis) and gen-template (codegen).

- **Merged map-analyzer into template-walker**: Eliminated module boundary; one unified analysis walker.

#### Code quality improvements

- **Generic AST deep-map**: Replaced 7+ hand-rolled 150-300 line recursive visitors with one 25-line `deepMap` using `t.VISITOR_KEYS`. Applied across prop-ref-utils.ts (-347), optionalize-utils.ts (-200), subpath-cache.ts (-283).

- **Unified array create/patch**: Shared `buildRefCacheAndApply` eliminates duplicated ref-cache + emit loops between createItem and patchItem.

- **eszter tagged templates**: All codegen files converted from verbose `t.*` AST builders to readable eszter templates.

- **Compressed all codegen + analyze files**: gen-events (-153), event-helpers (-148), gen-map-helpers (-203), gen-observer-wiring (-89), gen-clone (-56), generator (-57), dependency-collector (-109), binding-resolver (-80), helpers (-96), array subsystem (-376).
