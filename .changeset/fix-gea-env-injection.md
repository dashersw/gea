---
"@geajs/vite-plugin": patch
---

Fix gea-env.d.ts injection to only target the active project's tsconfig, preventing unrelated workspace tsconfigs from being modified during builds
