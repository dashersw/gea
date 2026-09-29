---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Class `template()` parameter patterns bind like props destructuring**: the parameter pattern only bound plain and renamed keys. `template({ class: cls, ...props })` dropped the rest element, so `console.log(props)` threw `ReferenceError: props is not defined`. `template({ user: { first } })` left `first` unbound. A default was dropped, and a renamed key with a default (`{ class: cls = '' }`) threw. The pattern now goes through the same path as a `const { … } = this.props` in the body: a rest element is an object whose getters read through to `this.props`, nested keys read `this.props.user.first` live, and defaults apply whenever the prop is `undefined`.
- **A function component's own `props` no longer collides with the compiled parameter**: the compiled component takes `props` as its first parameter, so `function Badge({ class: cls, ...props })` and `function Badge(p) { const { label, ...props } = p }` failed with "Identifier 'props' has already been declared". A callback parameter called `props` also hid the reads the compiler inlines as `props.<key>`. The component's own bindings called `props` are now renamed.
