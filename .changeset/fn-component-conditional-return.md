---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Function components with a conditional return render**: a function or arrow component that picks its root with `return cond ? <A /> : <B />`, `return cond && <A />`, or `if (cond) return <A />` guards before the final return rendered nothing for some or all of its props, in dev and production builds. The compiler now folds these into one reactive conditional root, like the class `template()` guard, so the matching branch renders and swaps when the prop changes. The root is wrapped in `<span style="display:contents">`, as it is for class components.
- **Unsupported early returns fail the build**: an early return of JSX the compiler can't fold (for example `if (cond) { log(); return <A /> }`), or a local such as `const store = new Store()` declared after an `if (…) return <A />` guard, is now a compile error that names the component, instead of rendering nothing.
