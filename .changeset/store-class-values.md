---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Compiled stores return classes unbound**: `CompiledLeanStore` and `CompiledStore` no longer bind a class read from a field or getter, matching the runtime `Store`. `store.view === Home` now holds, and static members and `name` survive, whether or not the compiler rewrote the store (#133).
