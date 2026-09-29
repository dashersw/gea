---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Props parameters with another name or a default render**: the compiler replaced a function component's props parameter with `props` without binding what it was called, so `function Greeting(p)` threw `p is not defined` and `function Tag({ label } = {})` threw `label is not defined`, and the whole tree above them rendered nothing. The parameter's name now reads through `props` (`p.name` stays live), and a whole-parameter default is unwrapped and dropped, since components are always mounted with a props object. Class components get the same unwrap: `template({ label } = {})` and `template(p = {})` read `this.props`. The base template of `@geajs/mobile`'s `View`, `template(props: ViewProps = {})`, now reads `this.props.children` instead of an undefined `props`.
- **Unsupported props parameters fail the build**: an array pattern or rest parameter as a function component's props parameter is now a compile error naming the component, instead of being silently replaced with `props`.
