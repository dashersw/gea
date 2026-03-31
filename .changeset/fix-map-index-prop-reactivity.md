---
"@geajs/vite-plugin": patch
"@geajs/core": patch
---

### @geajs/vite-plugin (patch)

- **Fix `.map((item, index) => ...)` prop reactivity**: Props used inside map item templates (e.g. `activeTabIndex` in a class binding like `index === activeTabIndex`) are now correctly tracked as dependencies. Previously, only props referenced in the array source expression were tracked, so `__onPropChange` never called `__geaSyncMap` when those item-template props changed.

### @geajs/core (patch)

- **Fix event handlers on initial template-rendered map items**: In `__geaSyncItems`, the "same keys" fast-path now copies `__geaItem` and `__geaKey` from the freshly-created element onto the existing DOM element. This ensures delegated event handlers can resolve the item (and its index) even for buttons that were rendered as HTML strings on first render and never went through `create__*Item`.
