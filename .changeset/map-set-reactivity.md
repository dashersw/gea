---
"@geajs/core": minor
---

### @geajs/core (minor)

- **Map/Set reactivity**: `Map` and `Set` instances stored in the reactive store are now fully reactive. Mutations via `.set()`, `.delete()`, `.clear()` (Map) and `.add()`, `.delete()`, `.clear()` (Set) trigger observers correctly. Both top-level and nested Map/Set properties are supported.
