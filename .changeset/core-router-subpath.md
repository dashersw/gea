---
"@geajs/core": patch
---

Add `@geajs/core/router` subpath export so router APIs can be imported without resolving the main package barrel. Build `router` as a separate ESM entry. Examples use `geaCoreAliases()` in Vite for dev resolution.
