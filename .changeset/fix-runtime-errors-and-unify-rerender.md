---
'@geajs/core': patch
'@geajs/vite-plugin': patch
'@geajs/ui': patch
---

Fix multiple runtime TypeErrors across examples: unify `__rerender` into `__geaRequestRender` for a single full-DOM-replacement code path, generate nested dummy objects in the compiler's array template initializer so sub-property access like `product.name[0]` no longer crashes, guard `Input`'s `onInput` prop with optional chaining, and add a truthiness-only check to early-return observers to preserve DOM stability.
