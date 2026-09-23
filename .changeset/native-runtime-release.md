---
"@geajs/core": patch
"@geajs/vite-plugin": patch
"@geajs/ui": patch
---

Preserve native runtime contracts and per-module tree shaking while fixing scoped prop writes, keyed-list updates, stable renderer identities, and mounted Zag initialization. Ship the core TypeScript source so native consumers can compile typed runtime modules from the published package.
