---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **HMR keeps patched components in place**: a hot-patched component is re-inserted before its old next sibling instead of being appended to the end of its parent.
- **Static components hot-patch**: props- and state-free components now register with the HMR instance registry, so editing them patches the DOM in place instead of invalidating the module and reloading the page.
- **Runtime-base changes invalidate safely**: edits that switch a component between compiled runtime bases hand the update back to Vite without mutating incompatible instances, including modules with multiple component exports.

### @geajs/core (patch)

- **Static component bases call `created()`**: `CompiledStaticComponent` and `CompiledStaticElementComponent` run a no-op `created()` on first render, matching `CompiledComponent`.
