---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Hot-path path-parts interning**: Replace per-call `appendPathParts` allocations in `_wrapItem` and array mutation handlers (splice, push/unshift, pop/shift) with a module-level `WeakMap` cache keyed on stable `baseParts` references, eliminating redundant array allocations in list-heavy workloads.
