---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Nested props destructuring is bound and live**: `function Avatar({ user: { first } })`, `const { user: { first } } = props` and `const { user: { first } } = this.props` threw `ReferenceError: first is not defined`, or read a `window` global of the same name such as `name`. Nested patterns now read through their path, so `first` is `props.user.first` and updates when the parent passes a new `user`. Renamed keys, nested defaults (applied at each level while it is `undefined`) and a nested `...rest` work the same way as at the top level. A nested default that constructs something, such as `= new Guest()`, is still built once.
