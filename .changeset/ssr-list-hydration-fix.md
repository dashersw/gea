---
"@geajs/core": patch
---

### @geajs/core (patch)

- **SSR list hydration fix**: Add `__adoptListItems()` method that populates compiler-generated list tracking arrays (`_*Items`) with adopted child components during hydration, preventing list duplication when store changes trigger reconciliation

### @geajs/ssr (patch)

- **SSR list hydration fix**: Silence `restoreStoreState` change notifications during hydration and clean up observers from dev-mode `renderToString` mismatch detection to prevent duplicate observer registration on shared stores
