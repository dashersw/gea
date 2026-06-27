---
"@geajs/ssr": patch
---

Fix `@geajs/ssr` build after the layout-chain router update: the no-routes fallback in `handleRequest` now includes `layouts: []` and `queryModes: new Map()` so it satisfies `ServerRouteResult` and `tsup` DTS generation succeeds.
