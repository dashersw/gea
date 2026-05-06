---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Closure-codegen IR: keyed lists and object-expression slots**: keyed-list map callbacks now lower to IR that includes `itemParam`, `indexParam`, and a `rowTemplate` for the returned JSX. Slots whose expressions are object literals also emit `exprObjectFields` (per-field `name`, generated `expr`, and optional `exprPath`) so downstream consumers can read prop bindings without re-parsing source.
