---
"@geajs/vite-plugin": patch
"@geajs/core": patch
---

### @geajs/vite-plugin (patch)

- **EVENT_NAMES**: Added missing `'drag'` event to the `EVENT_NAMES` Set in `event-helpers.ts`
- **getElementById in GEA_ON_PROP_CHANGE**: Extended `isCompilerGenerated` check to include computed `GEA_ON_PROP_CHANGE` methods so that `this.id` is cached as `const __id = this.id` before `getElementById` calls
- **Style map sentinel uses double quotes**: Replaced `jsExpr` template (which preserves single-quote style) with `t.binaryExpression` + `t.stringLiteral` for the `<!---->` sentinel appended to unresolved map `.join()` calls
- **Null guard for single-part observer keys**: When an observer key is a guard key and the method body contains `GEA_UPDATE_PROPS` calls, inject a null guard `if (store.prop == null) return` before those calls
- **Early-return guard observer**: Replaced hand-rolled rerender observer (missing `prev !== undefined` and `GEA_RENDERED` guard) with `generateRerenderObserver` for correct deduplication
- **Nested ternary conditional slot**: Fixed `extractHtmlTemplatesFromConditional` to preserve the full `C ? D : E` expression as the falsy branch when the alternate is itself a conditional
- **Children diff-patch**: Changed `emitInnerHTML` to use `Component[GEA_PATCH_NODE]` for in-place DOM diff-patching when the children prop updates, preserving existing DOM node references and runtime-added attributes instead of replacing via `innerHTML`

### @geajs/core (patch)

- **dnd-manager symbol APIs**: Updated `DndManager._getComponentFromElement`, `_findCompiledArray`, and `_performTransfer` in `gea-ui` to use the correct GEA symbol APIs (`GEA_DOM_COMPONENT`, `geaListItemsSymbol`, `GEA_PARENT_COMPONENT`, `GEA_PROXY_GET_RAW_TARGET`) instead of legacy string property names
