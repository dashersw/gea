---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Components passed in named props render**: `<Layout header={<Title />} />` with `{header}` in `Layout` mounts `<Title />` instead of printing `[object HTMLSpanElement]`. Text slots that read a prop (`{header}`, `{props.header}`, `{this.props.header}`, `{header || 'none'}`) now compile to the node-aware `reactiveText` helper, as `children` already did. Class fields, literals, template literals and arithmetic keep the string-only `reactiveTextValue`.
