---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Props destructuring in function components**: `const { … } = props` in the body and `...rest` in the body or the parameters used to leave their names unbound, so rendering threw `ReferenceError` and took the parent tree down with it. Body and parameter destructuring now share one path: named and renamed keys read `props.<key>` live, and a rest element is an object whose getters read through to `props`.
- **Destructuring defaults apply**: `{ size = 'md' }` in a function component's parameters was silently dropped, so a missing prop rendered as `undefined`. Defaults now apply whenever the prop is `undefined`, as in plain JavaScript.
