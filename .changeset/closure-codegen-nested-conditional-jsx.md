---
'@geajs/vite-plugin': patch
---

### @geajs/vite-plugin (patch)

- **Closure-codegen nested-conditional alternates**: A chain of `if (cond) return <JSX>` guards lowered by `foldEarlyReturnGuards` into nested ternaries previously dropped every inner alternate at the IR and JS-emit layers — the IR walker only recognized JSX shapes, and `buildBranchFn` fell through to an empty-comment placeholder for any non-JSX branch. Component templates that branched on multiple states then rendered only the outermost arm.
  - `closure-codegen/ir.ts`: extend `jsxNodeToTemplateIr` to recognize `ConditionalExpression` / `&&` `LogicalExpression` arms with JSX-or-nullish operands, wrap them in a JSXFragment, and walk into a real sub-template instead of returning `null`.
  - `closure-codegen/emit/emit-conditional.ts`: extend `buildBranchFn` with the same recognition — when a branch expression is a nestable conditional, lift it into a JSXFragment and route through `compileJsxToBlock` so the inner ternary becomes its own template + clone block (and recurses into `buildBranchFn` again for further nesting).
