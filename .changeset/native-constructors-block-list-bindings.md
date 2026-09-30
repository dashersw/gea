---
"@geajs/vite-plugin": patch
---

Preserve constructor initialization when native ReactiveComponent compilation removes the marker superclass by removing its obsolete super() call. Keep block-bodied list callbacks reactive when returned JSX reads local bindings, including row replacement and mutation.
