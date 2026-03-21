---
"@geajs/core": patch
"@geajs/vite-plugin": patch
"@geajs/ui": patch
---

Fix compiler and runtime handling of complex component patterns discovered while building the Jira clone example.

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
