---
"@geajs/core": patch
---

`Link`: when `router.path` changes, keep the anchor `class` attribute in sync with `router.isActive` / `router.isExact`, not only `data-active`. The template’s `class={...}` ran only on first render, so `.nav a.active` could still match the previous route until the parent re-rendered.
