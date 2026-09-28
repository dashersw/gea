---
"@geajs/core": patch
---

### @geajs/core (patch)

- **Nested event handlers bubble like the DOM** (behaviour change, #111): delegated handlers now run from the target outwards, and every handler on the path runs until one calls `stopPropagation()`. Before, only the innermost handler ran, so a row's `onClick` never fired when you clicked a button inside the row.
- **`stopPropagation()` works across components**: `delegateClick`, `delegateEvent` and `delegateEventFast` now share one `document` listener per event type. Before, inline arrows and method references could end up on two separate click listeners, so `stopPropagation()` didn't stop the other listener and an outer handler could run before the inner one.
- **Non-bubbling events only reach their target**: `focus`, `blur`, `mouseenter`, `mouseleave` and `scroll` run only the target element's handler. Before, an ancestor's handler could run for an event whose target was a descendant, e.g. `mouseleave` when the pointer left a child.
