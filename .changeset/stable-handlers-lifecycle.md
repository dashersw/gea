---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

Fix stable handler references and compiled component lifecycle injection

- Store proxy now only binds prototype methods, preserving identity for instance field functions (fixes `removeEventListener` with handler references stored in `created()`)
- Compiler injects `created()`/`createdHooks()`/`setupLocalStateObservers()` into compiled component constructors after `super()`, so they run after class field initializers; non-compiled components retain lifecycle calls from the base constructor via `GEA_COMPILED` symbol guard
- `GEA_LIFECYCLE_CALLED` symbol prevents double lifecycle execution in compiled class hierarchies (e.g. `GestureView extends View extends Component`)
- Internal `__evts` property replaced with `GEA_EVENTS_CACHE` symbol
