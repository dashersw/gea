---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Function components with a conditional return render**: a function or arrow component that picks its root with `return cond ? <A /> : <B />`, `return cond && <A />`, or `if (cond) return <A />` guards before the final return rendered nothing for some or all of its props, in dev and production builds. The compiler now folds these into one reactive conditional root, like the class `template()` guard, so the matching branch renders and swaps when the prop changes. The root is wrapped in `<span style="display:contents">`, as it is for class components.
- **Locals after a guard keep working**: statements after a guard, including `const { a, ...rest } = props`, nested and default-value destructures, and `const store = new Store()`, move into the branch that renders after the guard and bind there as they do in a component without a guard. Guards may be separated by statements, and a guard's block may declare `const` locals before its `return`. A store created after a guard is created each time that branch renders. An early return the compiler can't fold still compiles as before.
