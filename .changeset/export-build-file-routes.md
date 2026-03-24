---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Export buildFileRoutes**: `buildFileRoutes` is now exported from the public `@geajs/core` entry point, making it available for the `router.setPath()` build-time transform and for any user who needs to integrate file-based routing manually.
