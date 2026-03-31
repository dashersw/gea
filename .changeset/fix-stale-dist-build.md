---
"@geajs/vite-plugin": patch
---

Rebuild dist with setAttribute/style.cssText/innerHTML equality guards that were missing from 1.0.19 due to stale build output; add prepublishOnly script to prevent future stale publishes
