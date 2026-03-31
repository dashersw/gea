---
"@geajs/core": patch
---

### @geajs/core (patch)

- **appendPathParts hot path optimization**: Introduce a module-level `internPathParts` cache that returns the same `string[]` reference for any given dot-notation path string. Replaces per-call array spread allocations in `proxyIterate`, `reduce`, `splice`, `pop`, `shift`, and `unshift` handlers - eliminating repeated heap allocations and GC pressure in list-heavy render cycles.
