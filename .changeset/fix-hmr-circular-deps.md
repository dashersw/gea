---
"@geajs/vite-plugin": patch
---

Fix HMR circular dependency TDZ errors and support multi-component files

Non-component files that import from component modules now get `import.meta.hot.accept()` injected to prevent HMR updates from propagating into circular dependency chains and triggering TDZ errors. The HMR postprocess also now handles files exporting multiple component classes, patching `created()`/`dispose()` for each one.
