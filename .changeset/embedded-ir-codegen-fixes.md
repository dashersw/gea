---
"@geajs/vite-plugin": patch
---

Fix embedded/IR codegen: keyed-list observers re-resolve payload-less store notifies on the native backend while web keeps the existing `_value` path, and store IR keeps module-local helper functions alive through treeshaking.
