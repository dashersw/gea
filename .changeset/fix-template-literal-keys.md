---
"@geajs/vite-plugin": patch
"@geajs/core": patch
---

### @geajs/vite-plugin (patch)

- **Support expression-based map keys**: Template literals (`key={`${tab.title}-button`}`), string concatenation, and other non-simple expressions are now correctly preserved in `data-gea-item-id`, `__geaKey`, and `__geaRegisterMap`. Previously, only simple `item.prop` keys were recognized; complex keys fell back to `String(item)` producing `[object Object]`.

### @geajs/core (patch)

- **Accept key functions in `__geaSyncItems`**: The `keyProp` parameter now accepts a function `(item) => string` in addition to a property name string, enabling runtime key extraction for expression-based map keys.
