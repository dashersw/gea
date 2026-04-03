---
"@geajs/vite-plugin": patch
---

Fix three compiler bugs:

- **Conditional observer early-return preventing list reconciliation**: `generateConditionalSlotObserveMethod` emitted `return` statements inside conditional patching blocks. When other observer actions (like `GEA_REFRESH_LIST`) were merged into the same method, the `return` would exit the entire method prematurely, preventing getter-backed lists from reconciling when a sibling conditional also changed. Replaced `return`-based guards with `if (!condPatched)` wrapping pattern.

- **GEA_CLONE_TEMPLATE missing from auto-import list**: Added `GEA_CLONE_TEMPLATE` to `GEA_COMPILER_SYMBOL_IMPORTS` so compiled files that use clone templates get the symbol imported automatically.

- **Browser compiler missing symbol imports**: The `compileForBrowser` entry point used by the website playground was not calling `ensureGeaCompilerSymbolImports`, causing `ReferenceError` for symbols like `GEA_ELEMENT` in the playground iframe.
