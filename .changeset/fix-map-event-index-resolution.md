---
"@geajs/vite-plugin": patch
---

Fix map event handler index resolution to use data identity instead of DOM sibling position

- Resolve the map index variable via `rawArray.indexOf(__el.__geaItem)` instead of `Array.prototype.indexOf.call(__el.parentNode.children, __el)`, which is fragile when non-item siblings or text nodes are present.
- Add a fast path that skips the `__getMapItemFromEvent` helper when only the index (not the item) is referenced in the handler body.
- Extract shared `buildArrayItemsExpr` and `buildGeaItemDomWalk` helpers to eliminate near-duplicate code across `ensureMapItemHelper` and `buildMapEventBody`.
- Apply consistent optional member access for local-state array paths, matching the existing safety pattern in the item-lookup helper.
