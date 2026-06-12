---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Multi-store modules**: `transformCompiledStoreModule` now handles every `extends Store` class in a module (`findStoreClasses` + `irs[]` result) instead of bailing when more than one is declared; the plugin records IR for each store and lets mixed modules (stores + components + `mount()` in one file) continue through the root-mount and component transforms.
- **Literal-union param value types**: store-method params annotated with an inline literal union (`mode: 'hours' | 'days'`) or a same-module literal-union alias now carry their primitive `valueType` in the IR, so typed backends keep direct calls instead of falling back to dynamic dispatch.
