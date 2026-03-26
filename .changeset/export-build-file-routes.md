---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/core (patch)

- **Export buildFileRoutes**: `buildFileRoutes` is now exported from the public `@geajs/core` entry point, making it available for the `router.setPath()` build-time transform and for any user who needs to integrate file-based routing manually.

### @geajs/vite-plugin (patch)

- **router.setPath() transform**: Include `buildFileRoutes` export and `router.setPath()` integration — the plugin now rewrites `router.setPath('./pages')` calls into the expanded `router.setRoutes(buildFileRoutes(...))` form at build time.
