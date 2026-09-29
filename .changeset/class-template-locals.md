---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Class `template()` locals keep their identity**: a local whose initializer constructs something or writes state (`const store = new CounterStore()`) now stays a real variable, created once per component instance, instead of being copied into every read and handler. The button in `<button onClick={() => store.count++}>{store.count}</button>` counts up again. Build-time root inlining keeps such locals too.
- **Reassigned `let` in a class `template()` is a compile error**: `let count = 0` with `count++` used to compile to `0++`, so the file was served uncompiled and the component rendered nothing. It now fails with an error that names the component and variable and points to a class field or a Store, like function components since #118.
