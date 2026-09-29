---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Same-file components in a stateless root render after `vite build`**: when the root component had no state, the build inlined it into `main.ts` but left behind the same-file components it can't copy: a function component used with children (`<Card><p>Hello</p></Card>`) or a class component (`<Badge />`). The page was blank with `ReferenceError: Card is not defined`, and the build still passed. The inliner's check for module bindings it doesn't copy now sees JSX tag names, so these roots keep the normal `new App().render(…)` and render the same as in dev.
