---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

Fix state observer for text nodes with mixed state+prop dependencies: When a text node expression referenced both reactive state (e.g. `this.valueAsString`) and props (e.g. `props.placeholder`), the compiler reused the prop-change handler's expression for the state observer. In that expression `value` represented the new prop value — but in the state observer `value` is the new state value, causing props to read as empty. The compiler now generates a separate stateOnly binding for the state observer, so `this.props.X` is read live instead of being replaced with `value`.
