---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Component source maps point at the right lines**: for compiled components, the source map's positions were lines of the compiler's intermediate output, so breakpoints missed and stack traces (browser devtools, SSR, the dev overlay) pointed at the wrong line, sometimes past the end of the file. Each internal print → re-parse step now chains its source map into the next, so the map returned to Vite points at the user's file, in dev and in `vite build` with `build.sourcemap`. Keyed-list helper code no longer maps into unrelated lines of the file.
