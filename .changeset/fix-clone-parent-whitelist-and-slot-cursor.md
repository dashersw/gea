---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Safe parent whitelist for clone placeholders**: Replaced `RESTRICTED_CLONE_PARENTS` blacklist with `SAFE_CLONE_PARENTS` whitelist (`div`, `span`, `section`, `article`, `header`, `footer`, `main`, `nav`, `figure`). Previously, tags like `li`, `dt`, `dd`, `option`, and `textarea` were missing from the blacklist, allowing invalid placeholder insertion that broke child slot navigation.
- **Fix slot cursor desync for nested components**: `collectComponentSlotPatches` now accepts a `consumeOnly` parameter and recursively traverses component element children in consume-only mode. This ensures nested component instances correctly advance their `instanceCursors` entries even when they don't produce a slot, preventing cursor desync with `componentInstances`.
