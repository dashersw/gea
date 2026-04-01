---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Circular reference protection**: `_createProxy` now checks `_proxyCache` for both plain objects and arrays. Previously arrays bypassed the cache check, causing infinite recursion when a store contained a self-referencing array or a cross-type circular structure (e.g. `obj.arr = [obj]`).
