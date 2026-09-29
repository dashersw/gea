---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Numeric style values get `px`**: `style={{ height: 120 }}` and reactive numeric values set `120px` again instead of an invalid `120` the browser ignored. `0`, custom properties (`--*`) and React's unitless properties (`opacity`, `zIndex`, `flex`, `lineHeight`, `fontWeight`, `order`, …) stay unitless. Applies to compiled `style` bindings and to the `h()` runtime.
- **String styles in braces apply**: ``style={`width:${size}px`}`` is applied as `cssText`, like a static `style="…"`, and cleared when the value becomes `null` or `false`.
