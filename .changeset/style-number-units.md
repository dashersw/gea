---
"@geajs/core": patch
---

### @geajs/core (patch)

- Numeric style values are serialized as supplied, without automatic units. Supply explicit CSS units such as `"120px"` for lengths.

- **String styles in braces apply**: ``style={`width:${size}px`}`` is applied as `cssText`, like a static `style="…"`, and cleared when the value becomes `null` or `false`.
