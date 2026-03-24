---
"@geajs/core": minor
"@geajs/vite-plugin": minor
---

### @geajs/core (minor)

- **Runtime helpers**: Added `__child()`, `__el()`, `__updateText()`, `__observe()`, `__observeList()`, `__reconcileList()`, `__reorderChildren()` methods to Component base class, reducing compiled output size and complexity

### @geajs/vite-plugin (minor)

- **Cleaner compiler output**: Compiler now generates calls to runtime helpers instead of inlining boilerplate. Child components created eagerly in constructor via `__child()`. Array rendering uses `__observeList()` with change-type-aware updates (append, item prop update, full replace). Duplicate observers merged. `__via` indirection eliminated. Generated `dispose()`, `onAfterRender`, `__geaRequestRender` overrides removed where runtime handles them.
