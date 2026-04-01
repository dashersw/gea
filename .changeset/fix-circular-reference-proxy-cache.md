---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Circular reference tests**: Added regression tests confirming that circular store data (self-referencing objects, self-referencing arrays, cross-type cycles) does not cause infinite recursion. The existing `_proxyCache` and `_arrayIndexProxyCache` mechanisms already prevent cycles; tests now make this contract explicit and guard against regressions.
