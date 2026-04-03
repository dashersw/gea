---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

Fix reactivity bugs preventing drag-and-drop across kanban columns

- **Compiler**: prevent `GEA_SYNC_MAP` and `GEA_PATCH_COND` calls from being swallowed by subprop change guards in `__onPropChange`, so map lists re-sync even when only a nested array (e.g. `taskIds`) changes
- **Runtime**: stop `GEA_SYNC_MAP` from bailing on empty map containers that share a parent with conditional slots
- **Runtime**: restrict `__observeList` append fast-path to fire only when the change targets the observed array itself, not nested arrays
