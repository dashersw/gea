---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/core (patch)

- **`untrack`**: Return explicitly after the tracking scope so TypeScript control flow and callers see a consistent `T` result.

### @geajs/vite-plugin (patch)

- **Closure-codegen IR**: Thread emit-time bindings through `templateSpecToIr` and substitute them in slot expressions, keyed-list payload serialization, and embedded JSX so lowered IR matches renamed closure identifiers.
- **Store IR**: Add `object` shape for object-literal expressions in `GeaIrStoreExpr`.
