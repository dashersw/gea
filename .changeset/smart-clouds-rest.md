---
"@geajs/vite-plugin": patch
---

Add equality guards for setAttribute, style.cssText, and innerHTML in compiled observer methods to skip redundant DOM writes when the value has not changed
