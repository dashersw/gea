---
"@geajs/core": minor
---

### @geajs/core (minor)

- **`__child()` runtime helper**: Add `__child(Ctor, props, key?)` method to `Component` that creates a child component, sets `parentComponent`, `__geaCompiledChild = true`, optional `__geaItemKey`, and registers it in `__childComponents`
