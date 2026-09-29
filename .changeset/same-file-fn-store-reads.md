---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Same-file function components that read a store update**: a function component declared next to its parent and used with only static props was compiled as a one-shot factory, so `{counter.count}` or `title={counter.label}` rendered once and never changed. A component whose body reads an import or any other top-level binding of its module now mounts like an imported one and keeps reactive bindings, in dev and after `vite build`.
- **Build no longer drops bindings from inlined same-file functions**: when `vite build` inlines a static root into `main.ts`, it now keeps `new App().render(…)` if a copied same-file function reads a module constant or renders a same-file component it doesn't copy, instead of failing at runtime with `LABEL is not defined` or `Card is not defined`.
