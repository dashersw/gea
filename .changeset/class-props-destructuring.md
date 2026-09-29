---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **`this.props` destructuring in class `template()` bodies**: only plain keys were bound. A rest element, a default or a nested pattern was dropped without binding its names, so rendering threw `ReferenceError` and took the parent tree down with it. The body now goes through the same path as function component props, with `this.props` as the source: named and renamed keys read `this.props.<key>` live, defaults apply whenever the prop is `undefined`, and a rest element is an object whose getters read through to `this.props`. A nested pattern renders again.
