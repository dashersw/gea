---
'@geajs/core': patch
'@geajs/vite-plugin': patch
---

Fix conditional-slot list rendering so compiler-managed empty states and runtime list patches stay in sync. This prevents duplicate rows, preserves empty placeholders, and restores initial list mounts for mapped views like the mobile gesture log and ecommerce cart drawer.
