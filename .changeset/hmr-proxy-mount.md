---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Proxied class components mount in dev**: the HMR component proxy now keeps the Proxy invariants for its target's non-configurable `prototype`, so `mount()` no longer throws `'getOwnPropertyDescriptor' on proxy` for a class component used inside a function component or held in a variable (#112).
- **Class components inside function components are constructed directly**: `<Button />` in a function component compiles to `new Button()`, as it already did in class templates, instead of going through `mount()`.

### @geajs/core (patch)

- **Store reads keep proxied classes unbound**: `isClassConstructorValue` checks the class behind a dev HMR proxy, so a component class returned from a store getter such as `router.page` keeps its identity instead of being bound.
