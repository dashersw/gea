---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Component edits no longer vanish when nothing can be hot-patched**: the injected `import.meta.hot.accept` callback discarded `handleComponentUpdate`'s return value, which is `false` when a class has no live registered instances (a static component, or one not currently mounted). Vite counted the module as handled, so the edit produced neither a patch nor a reload. The callback now invalidates when no class was patched, handing the update to the module's importers and degrading to a full reload.
