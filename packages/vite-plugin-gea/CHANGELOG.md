# @geajs/vite-plugin

## 1.0.28

### Patch Changes

- [`564150d`](https://github.com/dashersw/gea/commit/564150d21e556b1cbe10f6059d9526722564d7e8) Thanks [@dashersw](https://github.com/dashersw)! - Fix duplicate `.map()` blocks in one component sharing a single `#__dc` template-cache field, which bound the second map to the wrong container and could clear sibling DOM (e.g. tab titles vs tab contents) on prop updates.

  Fix delegated map click handlers: `__getMapItemFromEvent` now resolves items using the same expression as the JSX `key` (e.g. template literals like `` `${tab.title}-button` ``) instead of defaulting to `.id`, so `onTabChange` receives the real item and `tab.index` is correct.

  Map row template init: use object dummies with `content: () => ''` (and non-primitive dummies when the row reads object fields or uses a composite key) so `render*Item("__dummy__")` never calls `tab.content` on a string.

  When a row’s text slot uses an **item method call** like `item.content()`, skip surgical `nodeValue` patches and rerender the row — patching would stringify component output as escaped HTML.

- [`564150d`](https://github.com/dashersw/gea/commit/564150d21e556b1cbe10f6059d9526722564d7e8) Thanks [@dashersw](https://github.com/dashersw)! - Treat Gea **functional** component modules (JSX + default-exported function) as component modules for HMR so relative imports are wrapped in `createHotComponentProxy`. Fixes stale tab content after child HMR when switching tabs (parent module does not re-run).

## 1.0.27

### Patch Changes

- [`068cbaa`](https://github.com/dashersw/gea/commit/068cbaa508bdf093c80b0684e818771d20fe8658) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)
  - **Fix key expression with index parameter causing ReferenceError**: When a map key uses the index parameter (e.g. `key={`${tag}-${i}`}`), the generated key function and create/patch methods now correctly rewrite the index variable (`i` → `__ki`/`__idx`). Previously the original variable name was left as-is, causing `ReferenceError: i is not defined` at runtime.

  ### @geajs/core (patch)
  - **Pass index to key functions in `__geaSyncItems`**: `itemKey()` calls now receive the array index so index-based key functions can compute the correct key value.

## 1.0.26

### Patch Changes

- [`2bd3560`](https://github.com/dashersw/gea/commit/2bd35602fe5b37cac79add22a16cf6ad3d64a1f2) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)
  - **Fix render prop calls rendering as HTML text**: Calls to JSX-returning functions (e.g. `{activeTab.content()}` where `content: () => <SummaryContent />`) were wrapped with `__escapeHtml` in the template and updated via `textContent` in observers. Both now correctly treat the result as HTML — no escaping in the template, and `innerHTML` in the observer.
  - **Fix destructured `{children}` double-escape**: Bare `children` identifier from `template({ children })` was not recognized by `isChildrenPropAccess`, causing `__escapeHtml(String(children))` to escape parent-provided HTML.
  - **Support expression-based map keys**: Template literals and other non-simple key expressions (e.g. `key={`${tab.title}-button`}`) now correctly produce `data-gea-item-id`, `__geaKey`, and key functions for `__geaRegisterMap`. Previously fell back to `String(item)` producing `[object Object]`.

  ### @geajs/core (patch)
  - **Accept key functions in `__geaSyncItems`**: The `keyProp` parameter now accepts `(item) => string` functions in addition to property name strings, enabling expression-based map key extraction at runtime.

## 1.0.25

### Patch Changes

- [`fc6532c`](https://github.com/dashersw/gea/commit/fc6532cf3af6b59e36ef20beb08d92d1c2a261d6) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)
  - **Support expression-based map keys**: Template literals (`key={`${tab.title}-button`}`), string concatenation, and other non-simple expressions are now correctly preserved in `data-gea-item-id`, `__geaKey`, and `__geaRegisterMap`. Previously, only simple `item.prop` keys were recognized; complex keys fell back to `String(item)` producing `[object Object]`.

  ### @geajs/core (patch)
  - **Accept key functions in `__geaSyncItems`**: The `keyProp` parameter now accepts a function `(item) => string` in addition to a property name string, enabling runtime key extraction for expression-based map keys.

## 1.0.24

### Patch Changes

- [`fe1a433`](https://github.com/dashersw/gea/commit/fe1a4336462a4d99faee1bd6a561f96fb06c3c1f) Thanks [@dashersw](https://github.com/dashersw)! - Fix destructured `{children}` prop being double-escaped in template output. `isChildrenPropAccess` only recognized `props.children` and `this.props.children` but not the bare `children` identifier from `template({ children })`. The children HTML from the parent was wrapped with `__escapeHtml(String(children))`, rendering it as visible HTML text instead of parsed DOM.

## 1.0.23

### Patch Changes

- [`dc4ce46`](https://github.com/dashersw/gea/commit/dc4ce46ccb9ff5570fc7d676ed9174623ff7efa2) Thanks [@dashersw](https://github.com/dashersw)! - Fix store-only component array maps not observing store changes. When a component's only store access was a `.map()` rendering child components (e.g. `store.recordings.map(r => <SidebarItem .../>)`), the compiler failed to generate `createdHooks` with `__observeList`, so store updates never triggered re-renders. The guard that gates `createdHooks` generation now includes `observeListConfigs`, and `ensureStoreGroup` runs before `storeConfigs` is built.

## 1.0.22

### Patch Changes

- [`570180a`](https://github.com/dashersw/gea/commit/570180a8e6a41ec148ca95437282081b9f201879) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)
  - **Fix `.map((item, index) => ...)` prop reactivity**: Props used inside map item templates (e.g. `activeTabIndex` in a class binding like `index === activeTabIndex`) are now correctly tracked as dependencies. Previously, only props referenced in the array source expression were tracked, so `__onPropChange` never called `__geaSyncMap` when those item-template props changed.

  ### @geajs/core (patch)
  - **Fix event handlers on initial template-rendered map items**: In `__geaSyncItems`, the "same keys" fast-path now copies `__geaItem` and `__geaKey` from the freshly-created element onto the existing DOM element. This ensures delegated event handlers can resolve the item (and its index) even for buttons that were rendered as HTML strings on first render and never went through `create__*Item`.

## 1.0.21

### Patch Changes

- [`12b7f3a`](https://github.com/dashersw/gea/commit/12b7f3af4c35867a08f5d971d94191ae8174e638) Thanks [@dashersw](https://github.com/dashersw)! - Add setAttribute equality guards to map-item patch methods (patch\_\_\*Item) in generate-array-patch.ts and generate-array.ts, matching the observer method guards added in v1.0.20

## 1.0.20

### Patch Changes

- [`b344816`](https://github.com/dashersw/gea/commit/b34481655167be8a14f55e977045f323606d666d) Thanks [@dashersw](https://github.com/dashersw)! - Rebuild dist with setAttribute/style.cssText/innerHTML equality guards that were missing from 1.0.19 due to stale build output; add prepublishOnly script to prevent future stale publishes

## 1.0.19

### Patch Changes

- [`471c0c0`](https://github.com/dashersw/gea/commit/471c0c0f92a211af633a6038170c522cba6c23a2) Thanks [@dashersw](https://github.com/dashersw)! - Add equality guards for setAttribute, style.cssText, and innerHTML in compiled observer methods to skip redundant DOM writes when the value has not changed

## 1.0.18

### Patch Changes

- [`e26895e`](https://github.com/dashersw/gea/commit/e26895ed528481dc3184296b5802fa24be5af1ac) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)
  - **Fix ref binding causing infinite re-render loop**: The compiler incorrectly treated `ref={this.myTextarea}` as a reactive template binding, generating both a clone patch entry (setting `ref` as an HTML attribute) and a reactive observer on the ref target property. When `__setupRefs()` assigned the DOM element to `this.myTextarea`, the observer fired `__geaRequestRender()`, which cloned new DOM, called `__setupRefs()` again with a different element, triggering another change — creating an infinite re-render loop. Fixed by: (1) skipping `ref` in `collectClonePatchEntries` so it's not patched as an HTML attribute, (2) skipping `ref` in `analyzeAttributes` so it doesn't create a `propBinding`, and (3) skipping expressions inside `ref={...}` attributes in `collectAllStateAccesses` so the ref target property doesn't get a reactive observer.
  - **Fix on-prefixed event names in clone patches**: Event attributes using the `on*` prefix (e.g. `onclick`, `oninput`) were not recognized as events in `collectClonePatchEntries`, causing them to be incorrectly set as HTML attributes in the clone template. Fixed by also checking the normalized form against `EVENT_NAMES`.

## 1.0.17

### Patch Changes

- [`cd79b17`](https://github.com/dashersw/gea/commit/cd79b17277b9baf674d36c53542f7229e54bdf6e) Thanks [@dashersw](https://github.com/dashersw)! - Fix map event handler index resolution to use data identity instead of DOM sibling position
  - Resolve the map index variable via `rawArray.indexOf(__el.__geaItem)` instead of `Array.prototype.indexOf.call(__el.parentNode.children, __el)`, which is fragile when non-item siblings or text nodes are present.
  - Add a fast path that skips the `__getMapItemFromEvent` helper when only the index (not the item) is referenced in the handler body.
  - Extract shared `buildArrayItemsExpr` and `buildGeaItemDomWalk` helpers to eliminate near-duplicate code across `ensureMapItemHelper` and `buildMapEventBody`.
  - Apply consistent optional member access for local-state array paths, matching the existing safety pattern in the item-lookup helper.

## 1.0.16

### Patch Changes

- [`dd2c34c`](https://github.com/dashersw/gea/commit/dd2c34c0508b9a4218cf512a5f40b1bd377eef5f) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (minor)
  - **XSS prevention: escape dynamic text expressions**: The compiler now wraps dynamic text expressions in templates with `__escapeHtml(String(...))` to prevent script injection via `innerHTML` during initial render. Static strings continue to be escaped at compile time. Expressions that produce HTML (JSX children, `.map()` callbacks, conditional slots, `props.children`) are correctly excluded from escaping.
  - **XSS prevention: sanitize dangerous URL protocols**: Dynamic attribute bindings for URL-bearing attributes (`href`, `src`, `action`, `formaction`, `data`, `cite`, `poster`, `background`) are now wrapped with `__sanitizeAttr()` to block `javascript:`, `vbscript:`, and non-image `data:` protocols.
  - **XSS prevention: `dangerouslySetInnerHTML` prop**: Added support for `<div dangerouslySetInnerHTML={expr} />` to allow intentional raw HTML rendering without escaping. The prop is not rendered as a DOM attribute and supports reactive updates via `innerHTML`.

  ### @geajs/core (minor)
  - **XSS helper functions**: Added `__escapeHtml()` and `__sanitizeAttr()` standalone functions and static methods on `Component`. These are used by the compiler-generated code to prevent XSS at runtime.

## 1.0.15

### Patch Changes

- [`32405ba`](https://github.com/dashersw/gea/commit/32405ba8f77e8c376555ed4b32857230041655d0) Thanks [@dashersw](https://github.com/dashersw)! - Fix bare text expressions with empty initial values not updating when the browser omits the text node. Create and insert the text node on demand in both \_\_onPropChange and store observer codegen.

- [`6db0c58`](https://github.com/dashersw/gea/commit/6db0c58aba0732e50ace4a7d65e980280d98cf4b) Thanks [@dashersw](https://github.com/dashersw)! - Support multiple component classes in the same file. Same-file components are now recognized as valid JSX tags without requiring a separate import. Fixes [#25](https://github.com/dashersw/gea/issues/25).

- [`53d04f6`](https://github.com/dashersw/gea/commit/53d04f601fb2f4e1de0b2d5462d32cf7c2521aaf) Thanks [@dashersw](https://github.com/dashersw)! - Generate `__geaKey`-based keyed list reconciliation. Support user-provided `id` on list containers. Improve observer codegen for derived maps, dynamic keys, and conditional slots. Skip redundant className writes and use `firstChild.nodeValue` for faster text patching.

## 1.0.14

### Patch Changes

- [`fa5766b`](https://github.com/dashersw/gea/commit/fa5766bcc54c8ab4a0cfd029dd7d13c3ce033114) Thanks [@dashersw](https://github.com/dashersw)! - Improve Vite plugin codegen and component runtime: lazy element caching with reset on rerender, className fast paths, clone generation, and tighter reactivity and event handling. Updates playground compiler bundle.

## 1.0.13

### Patch Changes

- [`dd2e8f3`](https://github.com/dashersw/gea/commit/dd2e8f355811e75aa019e9b8e841094310050162) Thanks [@dashersw](https://github.com/dashersw)! - Fix gea-env.d.ts injection to only target the active project's tsconfig, preventing unrelated workspace tsconfigs from being modified during builds

## 1.0.12

### Patch Changes

- [`5ad330a`](https://github.com/dashersw/gea/commit/5ad330a25eae09e1c7c84ba39f6730b51d4ad554) Thanks [@dashersw](https://github.com/dashersw)! - Add jsxImportSource support for editor-native JSX type-checking without dedicated plugins

## 1.0.11

### Patch Changes

- [`17a9b97`](https://github.com/dashersw/gea/commit/17a9b976b9d79935affdb4d987d6cebaa443ce07) Thanks [@dashersw](https://github.com/dashersw)! - Reduce compiled output weight and runtime overhead for map-rendered lists:
  eliminate redundant class attribute wrapping for string ternaries, skip
  index computation in event handlers that don't reference it, and remove
  per-row id attributes in favour of data-gea-item-id lookups.

## 1.0.10

### Patch Changes

- [`bbd3204`](https://github.com/dashersw/gea/commit/bbd3204b72ef8c3bf18c55ded8af825239a10641) Thanks [@dashersw](https://github.com/dashersw)! - **Store:** Fast-path delivery for top-level-only observer batches (`_deliverTopLevelBatch`), so simple `__observe(store, ['data'], …)` handlers get a single batched notification with the correct observed value and fewer redundant normalizations.

  **Lists:** Bulk HTML list rebuild uses a pre-sized string array and `join`; root replacement patch compares keys before touching the DOM; assign `__geaItem` on rows after `innerHTML` so delegated map handlers match the create-item path.

  **Compiler:** Safer map item key expressions via optional member chains (`??`) for keyed lists and template item ids.

## 1.0.9

### Patch Changes

- [`d855ef0`](https://github.com/dashersw/gea/commit/d855ef0f719814f9839ee8501d354f9edebe0b82) Thanks [@dashersw](https://github.com/dashersw)! - Use a lean root `Proxy` handler in the browser (fewer traps, no SSR branches) and reserve the full SSR overlay handler for server builds. `Store._ssrOverlayResolver` must be set before `new Store()` for SSR overlay behavior.

## 1.0.7

### Patch Changes

- [`d9400f9`](https://github.com/dashersw/gea/commit/d9400f9ae31ce24ca767fc5ab671aabab59a925a) Thanks [@dashersw](https://github.com/dashersw)! - Improve keyed list update performance by patching same-key replacements in place and reducing store overhead for repeated array item property writes.

## 1.0.6

### Patch Changes

- [`e523db8`](https://github.com/dashersw/gea/commit/e523db8dd8d08890213cbb5313012a3642684a71) Thanks [@dashersw](https://github.com/dashersw)! - Fix conditional-slot list rendering so compiler-managed empty states and runtime list patches stay in sync. This prevents duplicate rows, preserves empty placeholders, and restores initial list mounts for mapped views like the mobile gesture log and ecommerce cart drawer.

- [`7a34baa`](https://github.com/dashersw/gea/commit/7a34baa67f08ab0b2bc7332d4f1d8fa4ff551ec7) Thanks [@dashersw](https://github.com/dashersw)! - Fix duplicate list rows when `.map()` output lives under conditional slots (e.g. email-client folder switching): rewrite maps inside conditional-slot HTML, emit an empty string instead of `_items.join('')` in those branches so `__geaPatchCond` does not stack on `__observeList`, register map-sync observers for every resolved getter dependency path, and tighten `__reorderChildren` so empty→non-empty transitions and zero-count placeholders resync the live DOM correctly. Adds a JSDOM regression that mounts the real `examples/email-client` app.

- [`d90f6fb`](https://github.com/dashersw/gea/commit/d90f6fb86023c77ee3068584e5104c1549d01c5e) Thanks [@dashersw](https://github.com/dashersw)! - Stop merging sibling text expressions into a single `textTemplate` prop binding when any sibling can render JSX (for example `cond && (<>…<span>…</>)`). That path assigned `textContent` on the whole element and escaped markup or broke conditional-slot DOM after updates. Skip merged-template and related array-text paths in that situation, and treat the heading like a mixed text run so non-JSX segments patch the correct text node. Adds a jsdom regression test for multipart list titles.

- [`4edb00f`](https://github.com/dashersw/gea/commit/4edb00fdd197986becfba1bad021b56ce8cc56ff) Thanks [@dashersw](https://github.com/dashersw)! - Fix multiple runtime TypeErrors across examples: unify `__rerender` into `__geaRequestRender` for a single full-DOM-replacement code path, generate nested dummy objects in the compiler's array template initializer so sub-property access like `product.name[0]` no longer crashes, guard `Input`'s `onInput` prop with optional chaining, and add a truthiness-only check to early-return observers to preserve DOM stability.

- [`e84edb4`](https://github.com/dashersw/gea/commit/e84edb4cd7ad962d0c9cb4cbd54c168e0f451aea) Thanks [@dashersw](https://github.com/dashersw)! - Fix compiler merging of `createdHooks` — generated store setup is now prepended into user-defined `createdHooks` instead of emitting a duplicate method that silently overwrote user code. Generate null-safe `__onPropChange` handlers by substituting `this.props.<name>` with the incoming `value` parameter, adding optional chaining from early-return binding roots, and tracking `earlyReturnBarrierIndex` so setup statements after a guard don't execute before it. Remove the runtime try-catch around `__onPropChange` dispatch since the compiler now produces safe code paths.

- [`2235805`](https://github.com/dashersw/gea/commit/223580563f2137d140f86ef94ecf05f1fdec91b6) Thanks [@dashersw](https://github.com/dashersw)! - Add regression tests for `__reorderChildren` with static siblings before keyed list items, for `expressionAccessesValueProperties` / conditional `__onPropChange` nullish guards, and for clearing child text when a primitive prop becomes null (`value || ''`).

## 1.0.5

### Patch Changes

- [`d83acbc`](https://github.com/dashersw/gea/commit/d83acbc88f677ed6f15793e5ca4b595b11231816) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)
  - **Style expression deduplication**: Inline style objects (`style={{ backgroundColor: color }}`) no longer triplicate the `Object.entries().map().join()` expression in the template output. Since object literals are always truthy, the `== null || === false` guard is eliminated entirely, reducing compiled code size.
  - **Dead code elimination in conditional callbacks**: Fix `pruneDeadParamDestructuring` to skip binding targets (LHS) of variable declarators when collecting referenced identifiers. Previously, destructuring patterns in sibling statements (e.g. `const { selected } = this.props`) were counted as "references", preventing dead code removal. Functional components with multiple conditionals no longer emit unused prop destructuring in truthy render callbacks.

- [`d83acbc`](https://github.com/dashersw/gea/commit/d83acbc88f677ed6f15793e5ca4b595b11231816) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/core (patch)
  - **Runtime helpers**: Added `__child()`, `__el()`, `__updateText()`, `__observe()`, `__observeList()`, `__reconcileList()`, `__reorderChildren()` methods to Component base class, reducing compiled output size and complexity
  - **`__refreshList` runtime helper**: Force-reconcile a list config by re-reading getter values through the store proxy, used by compiler-generated delegates for getter-backed array maps
  - **Capture phase for non-bubbling events**: Event delegation now uses capture phase for events like `focus`, `blur`, `mouseenter`, `mouseleave` that don't bubble
  - **Lazy component mount sync**: Pre-created list items are synced after lazy component mount to avoid stale DOM

  ### @geajs/vite-plugin (patch)
  - **Cleaner compiler output**: Compiler now generates calls to runtime helpers instead of inlining boilerplate. Child components created eagerly in constructor via `__child()`. Array rendering uses `__observeList()` with change-type-aware updates. Duplicate observers merged. `__via` indirection eliminated.
  - **Getter-backed component array maps**: Generate delegate observers for computed getter dependencies so that component array maps (e.g. `store.filteredTracks.map(...)`) update when underlying store properties change
  - **Map registration setup statements**: Always include `computationSetupStatements` in `getItems` lambda for `__geaRegisterMap`, regardless of whether template prop replacement is needed
  - **Computed array setup**: Include `arrSetupStatements` before `constructorInit` for computed arrays
  - **Three compiler bugs blocking e2e tests**: Fixed multi-part getter paths, TemplateLiteral expansion in `collectTextChildren`, and `rewriteStateRefs` for destructured store/local refs
  - **Enhanced map registration and class handling**: Fix class toggle bindings and improve map registration for components with multiple reactive dependencies
  - **Style expression deduplication**: Inline style objects no longer triplicate `Object.entries().map().join()` in template output — the unnecessary null/false guard is eliminated since object literals are always truthy
  - **Dead code elimination in conditional callbacks**: Fix `pruneDeadParamDestructuring` to skip binding targets (LHS) of variable declarators. Functional components with multiple conditionals no longer emit unused prop destructuring in truthy render callbacks.
  - **Deduplicate store observer methods**: When a text template references multiple store properties (e.g. `${store.a} / ${store.b}`), each property previously got its own observer method with an identical body. The compiler now keeps one canonical method and redirects all subscriptions to it, reducing compiled output size.

## 1.0.4

### Patch Changes

- [`4c39de5`](https://github.com/dashersw/gea/commit/4c39de5c7ba0395ef37f24e588cac9a33d233ef0) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)
  - **Browser-compatible compiler entry point**: Added `browser.ts` and Rollup build config to produce a standalone browser bundle (`gea-compiler-browser.js`) for use in the interactive playground
  - **CodeMirror editor bundle**: Added Rollup config and entry point to bundle CodeMirror with JavaScript/TypeScript support for the playground editor
  - **Leaner generated observer setup**: Observer callbacks now use `.bind(this)` instead of arrow wrappers, and all observers are registered in a single `.push()` call instead of one per observer
  - **Remove redundant try/catch from generated code**: Observer callbacks and `__onPropChange` inline patches no longer wrap in try/catch — the runtime already handles errors in `_notifyHandlers` and the props proxy setter respectively
  - **Add `loggingCatchClause` utility**: Shared helper for the remaining compiler-generated catch blocks that need error logging (constructor init, array template init, props builder)
  - **Expose `clearCaches` from analysis modules**: `store-getter-analysis` and `component-event-helpers` now export cache-clearing functions needed by the browser compiler

  ### @geajs/core (patch)
  - **Error handling for property change callbacks**: The `__reactivePropsProxy` setter now wraps `__onPropChange` calls in try/catch with `console.error`, preventing a single prop-change error from breaking the proxy

- [`2235fcf`](https://github.com/dashersw/gea/commit/2235fcf82c5b34137aae07930c809bda4b9c5b06) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)
  - **Add missing VariableDeclarator visitor to browser compiler**: The browser compiler now correctly recognizes `const store = new CounterStore()` patterns and registers them in `storeImports`, matching the behavior of the Vite plugin compiler
  - **Remove dead componentImportSet code**: Removed unused `componentImportSet` variable and its population that was never consumed in the browser compiler

## 1.0.3

### Patch Changes

- [`ef44c8c`](https://github.com/dashersw/gea/commit/ef44c8c5df58c1797de6026ceea5c72fedbaa31f) Thanks [@dashersw](https://github.com/dashersw)! - ### @geajs/vite-plugin (patch)

  #### Compiler performance optimizations
  - **DOM ref caching**: `createDataItem` now stores element references (`el.__ref_X`) during creation so propPatchers can access child elements in O(1) instead of repeated DOM traversal (`el.firstElementChild.nextElementSibling.firstElementChild`).
  - **Remove `.trim()` from class expressions**: Ternary class expressions with string literals (e.g., `condition ? 'active' : ''`) can never produce leading/trailing whitespace, so the `.trim()` call was always a no-op. Removed from template rendering, prop patchers, and reactive bindings.
  - **Remove `typeof` guard on `__ensureArrayConfigs`**: The compiler generates both the method and the call site, so the `typeof === "function"` check is unnecessary. Replaced with a truthy check in `createdHooks` (where the method may not exist) and a direct call in observer methods (where it always exists).
  - **Replace wrapper arrows with `.bind(this)`**: Config objects for `render` and `create` now use `.bind(this)` instead of wrapping arrow functions, avoiding closure allocation.
  - **Remove redundant target variable aliases**: Identity-based class observers (`:scope` selector) no longer generate a `var __target = row; if (__target)` wrapper when targeting the root element directly.
  - **Hoist `__v` unwrap helper to module level**: The `__v` value-unwrap helper for identity comparisons is now emitted once at module scope instead of being re-created as a closure inside every `renderItem` call.
  - **Remove optional chaining on imported stores**: `__getMapItemFromEvent` helpers no longer use `?.` on module-level store references that are guaranteed to be non-null.

  ### @geajs/core (patch)

  #### Runtime performance optimizations
  - **Proxy cache fast path**: Array index proxy cache is now checked before `Object.getPrototypeOf` in the proxy get trap, skipping the expensive prototype lookup on cache hits.

  #### Router bug fix
  - **Propagate guards on route group fallthrough**: When a route group's children don't match the current path, accumulated guards and layouts are now propagated to sibling routes (e.g., wildcard catch-all). Previously, guards were discarded, allowing unauthenticated access to fallback routes like 404 pages.

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

## 1.0.2

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

- [`68c4029`](https://github.com/dashersw/gea/commit/68c4029ce3a80d197f149105aee15b56f76a517d) Thanks [@dashersw](https://github.com/dashersw)! - Pass the item key property from the compiler to the runtime per map registration instead of relying on a global heuristic.

  `__geaRegisterMap` now accepts an optional `keyProp` argument that `__geaSyncItems` uses to extract the reconciliation key from each item. This replaces the module-level `__geaSyncItemKey` function that always assumed `item.id`. Maps whose items use a different key property (e.g. `item.value`) now reconcile correctly without falling back to `[object Object]`.

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

## 1.0.1

### Patch Changes

- [`977a065`](https://github.com/dashersw/gea/commit/977a0657ec905cc23548ffb12e9cd320c8c06ded) Thanks [@dashersw](https://github.com/dashersw)! - Fix compiler handling of hyphenated component names, template-scoped variables, early-return guards, && guards with .map(), class getter reactivity, and render props. Improve component discovery with import-based global registry. Fix Router to read initial URL on construction and add navigate() alias.
