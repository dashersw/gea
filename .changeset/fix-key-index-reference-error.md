---
"@geajs/vite-plugin": patch
"@geajs/core": patch
---

### @geajs/vite-plugin (patch)

- **Fix key expression with index parameter causing ReferenceError**: When a map key uses the index parameter (e.g. `key={`${tag}-${i}`}`), the generated key function and create/patch methods now correctly rewrite the index variable (`i` → `__ki`/`__idx`). Previously the original variable name was left as-is, causing `ReferenceError: i is not defined` at runtime.

### @geajs/core (patch)

- **Pass index to key functions in `__geaSyncItems`**: `itemKey()` calls now receive the array index so index-based key functions can compute the correct key value.
