---
"@geajs/core": minor
"@geajs/vite-plugin": minor
---

### @geajs/vite-plugin (minor)

- **Spread attributes on HTML elements**: `<button {...rest}>` was dropped from the template, so none of the object's attributes or handlers reached the element. A spread now merges with the element's attributes in source order: it overrides the attributes before it, and the attributes after it override it. It stays live in class components, function components and keyed-list rows, in dev and in `vite build` (including an inlined static root). A keyed-list row with a spread keeps its `class={selected === item.id ? 'on' : ''}` as a normal binding instead of the list-scope toggle, so the spread's own `class` can't be overwritten. Spreading onto a component tag is still unsupported.

### @geajs/core (minor)

- **`reactiveSpread` and `spreadAttrs` compiler-runtime helpers**: apply spread sources to an element and diff them per key on every run, without relying on the object's identity. Only a source's own keys are read, as `Object.assign` copies them. Keys that go away are removed, or fall back to the attribute written before the spread. `on*` keys and bare event names install delegated handlers with the element as `currentTarget`. `class`/`className`, `style`, `value`, `visible` and boolean attributes are written the same way as when written directly. `htmlFor` becomes `for`. `children`, `key`, `ref`, `dangerouslySetInnerHTML` and function values are never written as attributes. SSR escapes spread values the same way as other dynamic attributes.
