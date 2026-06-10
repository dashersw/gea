---
"@geajs/vite-plugin": minor
---

### @geajs/vite-plugin (minor)

- **ReactiveComponent (component-as-store) producer support**: a class extending `ReactiveComponent` is routed to a lean base-less compiled class (its `template()` lives only in the IR), and the module IR now carries `GeaIrComponent.reactiveState` (fields/methods/getters/constants extracted via the store IR builders) so embedded backends can compile the component as its own fully-typed reactive store.
