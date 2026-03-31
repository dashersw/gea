---
"@geajs/vite-plugin": patch
---

Fix destructured `{children}` prop being double-escaped in template output. `isChildrenPropAccess` only recognized `props.children` and `this.props.children` but not the bare `children` identifier from `template({ children })`. The children HTML from the parent was wrapped with `__escapeHtml(String(children))`, rendering it as visible HTML text instead of parsed DOM.
