---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Production builds work when the entry imports what the root component imports**: `vite build` inlines the root component into the entry file and copies the component's imports there. If `main.ts` also imported one of them, such as a store it seeds before the first render, the binding was declared twice and the build failed with `Identifier 'store' has already been declared`. Copied imports the entry already has from the same module are now dropped. If the entry uses one of those names for something else, the root component is mounted normally instead of inlined.
