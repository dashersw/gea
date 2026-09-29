---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Class `template()` locals stay in their own class**: a local declared in one class component's `template()` stayed bound for every later class in the same file, so a later class's identifier with the same name (a module constant, an import) compiled to the earlier class's initializer. With `const title = this.props.heading` in `Heading`, a later `Footer` rendering the module-level `title` read `this.props.heading` instead and threw `Cannot read properties of undefined`, which left the whole app empty. Each class now starts with its own bindings, in dev and in production builds.
