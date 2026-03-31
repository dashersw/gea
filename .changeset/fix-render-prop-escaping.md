---
"@geajs/vite-plugin": patch
"@geajs/core": patch
---

### @geajs/vite-plugin (patch)

- **Fix render prop calls rendering as HTML text**: Calls to JSX-returning functions (e.g. `{activeTab.content()}` where `content: () => <SummaryContent />`) were wrapped with `__escapeHtml` in the template and updated via `textContent` in observers. Both now correctly treat the result as HTML — no escaping in the template, and `innerHTML` in the observer.
- **Fix destructured `{children}` double-escape**: Bare `children` identifier from `template({ children })` was not recognized by `isChildrenPropAccess`, causing `__escapeHtml(String(children))` to escape parent-provided HTML.
- **Support expression-based map keys**: Template literals and other non-simple key expressions (e.g. `key={`${tab.title}-button`}`) now correctly produce `data-gea-item-id`, `__geaKey`, and key functions for `__geaRegisterMap`. Previously fell back to `String(item)` producing `[object Object]`.

### @geajs/core (patch)

- **Accept key functions in `__geaSyncItems`**: The `keyProp` parameter now accepts `(item) => string` functions in addition to property name strings, enabling expression-based map key extraction at runtime.
