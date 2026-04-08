---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Circular reference regression tests**: Add six regression tests verifying that self-referencing objects, self-referencing arrays, and cross-type circular structures (object ↔ array) are handled correctly without infinite recursion, and that shared arrays at different paths maintain independent path tracking.
