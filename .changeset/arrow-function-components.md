---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Arrow function components render**: components written as arrow functions (`export const Foo = () => <p />`, `export default (props) => <p />`, block-bodied arrows, and same-file `const Foo = () => …`) rendered nothing in dev and production builds, because the compiler only recognized `function` declarations as components. They are now rewritten into function declarations before compilation and render like `function` components, in the Vite plugin and in the playground compiler.
