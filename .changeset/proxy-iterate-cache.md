---
"@geajs/core": patch
---

### @geajs/core (patch)

- **proxyIterate O(1) proxy cache**: Reactive array iteration methods (`.map()`, `.filter()`, `.forEach()`, `.find()`) now reuse cached Proxy instances for object elements instead of allocating new Proxies and path arrays on every call, reducing GC pressure in list-heavy applications.
