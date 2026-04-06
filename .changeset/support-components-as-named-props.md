---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

Support passing components as named props (e.g. `<Layout header={<Title />} />`)

Components passed as JSX prop values are now properly rendered and mounted in the child's template. Previously, they were stringified and HTML-escaped, producing escaped markup instead of live components.

Three changes make this work:

- **Compiler**: `collectComponentTags` now walks JSX attribute values, so component tags in props are registered as tracked child instances with proper lifecycle and event delegation.
- **Compiler**: Single-expression template literals in prop values and arrow function bodies are unwrapped, passing component instances directly instead of stringifying them.
- **Runtime**: `__escapeHtml` detects component instances (objects with a `template` method) and returns their HTML unescaped, while still escaping regular strings for XSS safety.

This also enables the render-prop pattern: `renderHeader={() => <Header />}` with `{props.renderHeader()}` in the child template.
