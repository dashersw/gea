---
"@geajs/vite-plugin": patch
---

Fix nested JSX ternaries in conditional slots (`a ? b : c ? d : e`): the outer falsy branch no longer collapses to only the inner consequent, so the DOM can show the correct branch when the outer test is false. Extract HTML templates from the raw conditional AST before the full-expression JSX transform (`extractHtmlTemplatesFromRawConditional`). Fix early-return template guard observers so the first store delivery is not skipped when the previous guard value was still `undefined`. Add regression tests (nested ternary codegen + auth-style repro with `pause()` after sign-in/out).
