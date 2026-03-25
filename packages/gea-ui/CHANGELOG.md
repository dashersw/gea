# @geajs/ui

## 0.1.3

### Patch Changes

- [`4edb00f`](https://github.com/dashersw/gea/commit/4edb00fdd197986becfba1bad021b56ce8cc56ff) Thanks [@dashersw](https://github.com/dashersw)! - Fix multiple runtime TypeErrors across examples: unify `__rerender` into `__geaRequestRender` for a single full-DOM-replacement code path, generate nested dummy objects in the compiler's array template initializer so sub-property access like `product.name[0]` no longer crashes, guard `Input`'s `onInput` prop with optional chaining, and add a truthiness-only check to early-return observers to preserve DOM stability.

- Updated dependencies [[`e523db8`](https://github.com/dashersw/gea/commit/e523db8dd8d08890213cbb5313012a3642684a71), [`7a34baa`](https://github.com/dashersw/gea/commit/7a34baa67f08ab0b2bc7332d4f1d8fa4ff551ec7), [`4edb00f`](https://github.com/dashersw/gea/commit/4edb00fdd197986becfba1bad021b56ce8cc56ff), [`e84edb4`](https://github.com/dashersw/gea/commit/e84edb4cd7ad962d0c9cb4cbd54c168e0f451aea), [`2235805`](https://github.com/dashersw/gea/commit/223580563f2137d140f86ef94ecf05f1fdec91b6)]:
  - @geajs/core@1.0.6

## 0.1.2

### Patch Changes

- [`7ae3d6e`](https://github.com/dashersw/gea/commit/7ae3d6eb22ba777d7fe152957ca20d132ee0879d) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (minor)

  #### Compiler restructure and new capabilities
  - **Source directory reorganization**: All compiler source files moved from `packages/vite-plugin-gea/*.ts` to `packages/vite-plugin-gea/src/*.ts`.
  - **Observer safety**: Observer callbacks are now wrapped in `try/catch` to prevent runtime crashes from propagating through the reactive system.
  - **Store getter dependency resolution**: When an observe key targets a computed getter (single-part path), the compiler resolves the getter's underlying state dependencies and observes those instead, so mutations to underlying data correctly trigger the observer.
  - **Early-return guard observers**: Templates with early-return guards (e.g., `if (!store.activeEmail) return <empty/>`) now generate `__rerender()` observers that re-render the full DOM when the guard condition changes.
  - **Component-array pipeline**: Array maps with component children are routed through a dedicated component-array pipeline (`__buildComponentArray` / `__mountComponentArray` / `__refreshComponentArray`) instead of the HTML-based `__applyListChanges` pipeline, avoiding HTML-parser foster-parenting of custom elements inside `<table>` contexts.
  - **Resolved array map delegate handling**: `.map().join("")` calls are stripped from children templates when using resolved array maps; containers are populated via DOM APIs in `onAfterRender`. `__refreshChildProps` calls are skipped for observe keys handled by resolved array map delegates to prevent innerHTML replacement from clobbering in-place map items.
  - **`__geaPrev_` initialization**: Previous-value properties for store observers are initialized in `created()` hooks with try/catch, preventing spurious observer triggers on first flush.
  - **Destructured store variable support**: `replaceMapWithComponentArrayItems` now handles the destructured pattern (`const { columns } = store; columns.map(...)`) in addition to direct member access.
  - **Truthiness-only rerender observers**: `generateRerenderObserver` gained a `truthinessOnly` parameter for guard-based observers that only need to track truthiness changes.
  - **Store getter static analysis**: New `store-getter-analysis.ts` module reads store source files, parses getter definitions, and extracts the state properties each getter depends on.

  #### Test suite reorganization
  - Split `plugin-regressions.test.ts` (3,208 lines) into 8 focused test files: compiler-errors, conditional-slots, events-templates, jsx-codegen, mapped-lists, misc, store-observers, and shared helpers.
  - Split `runtime-regressions.test.ts` (9,473 lines) into 8 focused test files: bindings, child-components, conditional-slots, dnd-misc, events-forms, mapped-lists, store-props, and shared helpers.
  - Removed debug artifacts: `debug-compile.mjs`, `output.txt`, `_debug_compile.ts`, `debug-create-rows.mjs`, `jira-bundle-debug.js`, `jira-integration-entry.ts`.

  ### @geajs/core (minor)

  #### Runtime improvements
  - **Proxy cache for stable object identity**: `Store.createDeepProxy` now caches proxies for non-array objects, ensuring stable identity when the same raw object is proxied multiple times (e.g., via `.find()` in computed getters).
  - **`__rerender()` method**: New method on `Component` for full DOM replacement when templates have multiple return paths (early return pattern). Removes old element before calling `template()` to prevent `getElementById` from finding stale DOM nodes.
  - **`__resetChildTree()`**: Recursively resets `rendered_` and `element_` state on child component trees when parent innerHTML replacement destroys them.
  - **`data-gea-compiled-child-root` → `__geaCompiledChildRoot`**: Replaced DOM attribute with a JS property to keep compiler internals out of the visible DOM.
  - **In-place keyed list content updates**: When key order is unchanged but item content has changed, existing DOM elements are updated in-place to preserve node identity (avoids spurious removals visible to MutationObserver).

  ### @geajs/ui (patch)
  - **Preserve compiler binding IDs**: `zag-component.ts` now saves and restores the original `el.id` after Zag's `spreadProps` applies element attributes, preventing Zag from clobbering compiler-generated binding IDs that observers rely on.

  ### Monorepo and testing infrastructure
  - Relocated all example apps from `packages/gea-ui/examples/` to `examples/` at repo root.
  - Added 6 new demo apps: chat, ecommerce, email-client, finance, music-player, saas-dashboard.
  - Centralized e2e testing: added `tests/e2e/playwright.config.ts` with per-example projects and port assignments (5291–5307), plus 17 Playwright spec files covering all example apps.
  - Added `.claude/rules/` and `.cursor/rules/` for framework-fixes, playwright-testing, and unit-testing conventions.
  - Added `example:*` npm scripts to root `package.json` for all demo apps.

- Updated dependencies [[`ef44c8c`](https://github.com/dashersw/gea/commit/ef44c8c5df58c1797de6026ceea5c72fedbaa31f), [`7ae3d6e`](https://github.com/dashersw/gea/commit/7ae3d6eb22ba777d7fe152957ca20d132ee0879d)]:
  - @geajs/core@1.0.3

## 0.1.1

### Patch Changes

- [`82c94f4`](https://github.com/dashersw/gea/commit/82c94f41e5ddce4ad5e9919204577eb48b754ec4) Thanks [@dashersw](https://github.com/dashersw)! - Fix compiler and runtime handling of complex component patterns discovered while building the Jira clone example.

  **@geajs/vite-plugin**
  - Expand `collectDependentPropNames` through class getter bodies so template expressions like `this.someGetter` that transitively read `this.props.*` stay reactive without manually listing props in JSX.
  - Preserve `.map()` callback body statements (variable declarations, early-return guards) through compilation into `renderItem` and `createItem` methods.
  - Register unresolved `.map()` observers on the full member path (e.g. `project.users`) instead of only the first segment, preventing unrelated maps from re-running.
  - Apply `replacePropRefs` rewrite to `createItem` patch expressions so destructured `template()` props work inside `.map()` rows during incremental sync.
  - Walk JSX children in source order during template analysis so conditional slots match the transform pass; merge slot HTML by `slotId` instead of cursor index.
  - Separate conditional slot HTML setup statements from condition setup so truthy/falsy branch rendering has access to all needed variables.
  - Resolve `store-alias` references (`const project = projectStore.project`) and imported-destructured state paths for proper observe key generation.
  - Track text node indices in mixed-content elements to patch individual text nodes instead of overwriting parent `textContent`.
  - Enforce `key` prop on `.map()` root elements at compile time with a clear error message.
  - Prefix component tag names that collide with reserved HTML elements (e.g. `Link` → `gea-link`).
  - Always use the lazy `__ensureChild_` instantiation pattern for compiled child components instead of eager constructor instantiation.
  - Wrap conditional patch initialization in try-catch for resilience against early evaluation errors.
  - Handle multiple `.map()` calls sharing the same item variable via queue-based template injection lookup.

  **@geajs/core**
  - Re-resolve map containers on every `__geaSyncMap` call so DOM replacements after a full template re-render target the live subtree instead of a detached node.
  - Compare list item keys using `item.id` when present instead of `String(object)` (which collapsed to `[object Object]`), so keyed object rows reconcile correctly.
  - Resolve nested map containers inside conditional slots by walking descendants for `data-gea-item-id` markers.
  - Dispose compiled child components when a conditional slot hides its content; re-mount, re-instantiate, and rebind events when it shows.
  - Sync the `value` DOM property alongside the `value` attribute in `__patchNode` and add `__syncValueProps` / `__syncAutofocus` helpers for conditional slot reveals.
  - Trigger `instantiateChildComponents_()` after `__applyListChanges` when child count changes.
  - Deduplicate `__childComponents` entries and skip re-mounting children already rendered at their target element.
  - Propagate array metadata (`arrayPathParts`, `arrayIndex`, `leafPathParts`) on store splice change events.
  - Call `_resolve()` when creating a `Router` even without a route map so `router.path` reflects the initial URL and deep links are not clobbered by redirects.
  - Pass `route` and `page` props to layout components for nested routing.
  - Link: accept `children`, `target`, `rel`, `exact`, and `onNavigate` props; restrict SPA interception to left-click only.

  **@geajs/ui**
  - Remove `SpreadMap` return-type annotations on `getSpreadMap()` to prevent `ReferenceError: SpreadMap is not defined` when compiled through the plugin.
  - Add missing `key` props to `.map()` items across all Zag-based components (Accordion, Combobox, FileUpload, Menu, PinInput, RadioGroup, RatingGroup, Select, TagsInput, ToggleGroup).
  - Dialog: conditionally render the trigger button only when `triggerLabel` is provided.

- [`3de8f86`](https://github.com/dashersw/gea/commit/3de8f86a00a3b824b46f0edcb92ed3ca4a846a5d) Thanks [@dashersw](https://github.com/dashersw)! - Add style objects, ref attribute, and DnD manager overhaul; improve compiler robustness.

  **@geajs/vite-plugin**
  - Support inline style objects with camelCase property names (`style={{ backgroundColor: 'red' }}`). Static objects compile to CSS strings at build time; dynamic objects convert to `cssText` at runtime. Applied consistently across observe patchers, array item patchers, and conditional slot patchers.
  - Support `ref={this.myProp}` attribute: compiles to a `data-gea-ref` marker and generates a `__setupRefs()` method that assigns the DOM element to the component property after render.
  - Handle `key={item}` for primitive-value `.map()` lists where the item itself serves as the key, propagated through all code generators.
  - Move item marker injection (`data-gea-item-id`, container id) into `processElement` in transform-jsx, removing the standalone `insertItemMarker` function.
  - Collect props referenced in full conditional slot expressions (not just the condition) so `__buildProps` methods include all needed props for branch HTML rendering.
  - Detect IIFE expressions as potential JSX producers so immediately-invoked arrow functions are treated as conditional slots.
  - Consolidate child component injection into a single `ClassDeclaration` visitor pass instead of three separate traversals.
  - Skip `data-*`, `class`, `style`, and `id` attributes when detecting hoistable root events to prevent false positives.
  - Throw a clear compile error for Fragment (`<>...</>`) as `.map()` item root.
  - Keyed component array refresh now uses `Map`-based reconciliation: reuses existing instances by key, disposes removed ones, and reorders DOM to match the new array order.
  - HMR: skip getter/setter properties when snapshotting component state to avoid triggering side effects during hot reload.
  - Log warnings instead of silently swallowing errors in `getHoistableRootEvents` and HMR code generation.

  **@geajs/core**
  - Add `Store.silent(fn)` method that executes mutations without triggering observers — useful for drag-and-drop and other bulk operations that handle their own DOM updates.
  - Set `__geaComponent` back-reference on rendered elements so the DnD manager can walk from DOM to component instances. Cleared on dispose.
  - Call `__setupRefs()` after render and re-render cycles when the method exists, enabling the `ref` attribute feature.

  **@geajs/ui**
  - Overhaul `DndManager` to move the actual source element instead of cloning: removes the clone-based approach, moves the element to `document.body` with fixed positioning during drag, and restores it on drop or cancel.
  - Auto-discover droppables via `[data-droppable-id]` and draggables via `[data-draggable-id]` attributes — no manual registration required.
  - Add animated placeholder with height transitions when moving between containers, and a shrinking ghost element at the vacated position.
  - Direction-aware drop index calculation (threshold adjusts based on pointer movement direction).
  - Perform DOM transfer on drop: physically move the element and update the Gea component tree (`__childComponents`, `parentComponent`) to match.
  - Skip `onDragEnd` callback when dropping back at the original position.
  - Export `dndManager` singleton, `DragResult` type, `Draggable`, `Droppable`, and `DragDropContext` from the package index.

- Updated dependencies [[`82c94f4`](https://github.com/dashersw/gea/commit/82c94f41e5ddce4ad5e9919204577eb48b754ec4), [`68c4029`](https://github.com/dashersw/gea/commit/68c4029ce3a80d197f149105aee15b56f76a517d), [`3de8f86`](https://github.com/dashersw/gea/commit/3de8f86a00a3b824b46f0edcb92ed3ca4a846a5d)]:
  - @geajs/core@1.0.2
