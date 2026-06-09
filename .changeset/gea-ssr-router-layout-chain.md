---
"@geajs/ssr": patch
---

### @geajs/ssr (patch)

- **Render router layouts in SSR HTML**: `createServerRouter` now walks route groups to collect the `layout` chain (outermost → innermost) and captures `queryModes` metadata; `createSSRRouterState.getComponentAtDepth(depth)` mirrors the client `Router` — returning layouts at `depth < layoutCount` (with `page`/`route`/`params` props, plus `activeKey`/`keys`/`navigate` for query-mode depths) and the leaf at `depth === layoutCount`. Before this, SSR mounted the leaf component directly into `RouterView`'s host div and layouts only appeared after client hydration. The `RouteGroup` SSR type gains `layout` and `mode` fields to match the route shape the router config actually supports; `RouteGroup.component` is kept for backward compatibility but treated as an alias for `layout`.
