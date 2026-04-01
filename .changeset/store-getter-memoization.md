---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Getter memoization**: Store getters are now cached and only recomputed when their reactive dependencies change. This eliminates redundant recomputation when multiple components access the same derived state.
