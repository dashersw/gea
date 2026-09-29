---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Function-expression components render**: components written as function expressions (`export const Foo = function () { … }`, same-file `const Foo = function …`, and `const Foo = function …; export default Foo`) rendered nothing in dev and production builds. They are now rewritten into function declarations before compilation, like arrow components. A named expression such as `const Foo = function Inner() { … }` has its references to `Inner` renamed to `Foo`.
- **Anonymous default function components render**: `export default function (props) { … }` rendered nothing in dev and production builds. The function is now named after its file (`AnonDefault.tsx` → `AnonDefault`) before compilation, so it compiles like a named default export. Its `.name` changes from `"default"` to the file-derived name.
