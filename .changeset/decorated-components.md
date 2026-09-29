---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Decorated components compile**: a class component with any decorator (`@logged rename() {}`, `@register class App`, a decorated field or getter) was left uncompiled without any warning, so it rendered nothing in dev and production and `vite build` exited 0. Every compiler pass now parses user source with the same Babel plugins, including `decorators-legacy`, so decorated components compile and render, and Vite still applies their decorators.
- **The component compiler no longer hides parse failures**: if it can't parse a file that the rest of the pipeline accepted, that is now a compile error that fails the build and shows the dev overlay, instead of serving the file uncompiled.
- **Decorators on `template()` are a compile error**: the compiler replaces `template()`, so a decorator on it would never run. The error points at the decorator.
- **Decorators are never dropped**: root-mount inlining skips components whose class or members are decorated, so their decorators still run. Decorated stores keep the runtime `Store`, as before.
