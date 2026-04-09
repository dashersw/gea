---
name: playground-browser-bundles
description: Rebuild the website playground browser bundles after changing @geajs/core or @geajs/vite-plugin source. Use when building browser bundles, syncing the playground, or committing changes that affect the playground preview.
---

# Playground Browser Bundles

The website playground at `website/playground/` ships two pre-built browser bundles:

| Bundle | Source package | Build command |
|--------|--------------|---------------|
| `gea-core.js` | `@geajs/core` | `npm run build -w @geajs/core` then `npm run sync:playground-gea-core` |
| `gea-compiler-browser.js` | `@geajs/vite-plugin` | `npm run build:browser -w @geajs/vite-plugin` |

## When to rebuild

Rebuild **both** bundles whenever either package's source changes. The compiler generates code that calls runtime helpers from core (e.g. `geaEscapeHtml`, `geaSanitizeAttr`), so they must stay in sync.

## Build order

Order matters — `gea-core.js` is copied from the dist build, so the core package must be built before syncing:

```bash
# 1. Rebuild core dist (required if core source changed)
npm run build -w @geajs/core

# 2. Copy built core into playground
npm run sync:playground-gea-core

# 3. Rebuild compiler browser bundle
npm run build:browser -w @geajs/vite-plugin
```

## Commit convention

Bundle rebuilds go in a separate commit: `chore: rebuild playground browser bundles`.
