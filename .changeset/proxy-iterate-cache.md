---
"@geajs/core": patch
---

### @geajs/core (patch)

- **proxyIterate O(1) proxy cache**: Reactive array iteration methods (`.map()`, `.filter()`, `.forEach()`, `.find()`, `.reduce()`) now reuse cached Proxy instances for object elements via a per-store `iterateProxyCache` keyed on `(array, index)`. The cache is validated by object identity and invalidated on any mutation (splice, push, set, delete, length). Reduces GC pressure in list-heavy applications.
