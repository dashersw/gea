---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Store getter memoization**: Prototype-level getters on Store subclasses are now memoized with reactive dependency tracking. Cached results are invalidated when tracked fields change. Getters reading `_`-prefixed internal fields or function-valued fields are marked uncacheable. Chained getters propagate dependencies to parent getters.
