---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Function component locals keep their identity**: a local whose initializer constructs something or writes state (`const store = new CounterStore()`) now stays a real variable, created once per component instance, instead of being copied into every read and handler. Reads through it stay reactive, including for components declared in the same file as their parent.
- **Reassigned `let` in a function component is a compile error**: `let count = 0` with `count++` used to compile to `0++`, which left the file untransformed in dev and failed `vite build` in another file. It now fails with an error that names the component and variable and points to a Store or a class component.
