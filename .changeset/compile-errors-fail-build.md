---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Compile errors fail the build and show the dev overlay**: when transforming a file threw, the plugin printed a `[gea-plugin] Failed to transform` warning and served the file uncompiled, so its components rendered nothing and `vite build` exited 0. Transform errors are now rethrown with the file, line and column, so Vite shows its error overlay in dev and `vite build` fails. The one failure that stays soft is Babel being unable to parse the file's own source (valid TypeScript such as `<T>value` in a `.ts` file); Vite's own parser still reports real syntax errors.
- **Errors in compiled output point at your source**: if the compiler emits code that doesn't parse, the error is mapped back to the position in the original file instead of the generated code.
- **`compilerError()` is back** for deliberate errors with a readable message and a hint. Member-expression (`<ui.Button />`) and namespaced (`<svg:rect />`) JSX tags now use it instead of throwing a raw AST dump.
- **Root-mount inlining reports errors against the component**: in production builds, a compile error in the root component was raised while transforming the mount file. The inlining now backs off, and the component's own compile reports the error against its file.
