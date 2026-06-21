---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Typed per-property style bindings**: a `style={{ ... }}` binding whose object literal has only static keys (e.g. a moving sprite's `{ left, top, backgroundColor }`) now compiles to one `reactiveStyleProp` call per property instead of the generic `reactiveStyle`. This removes the per-update boxed `prev`/`next` record allocation and runtime kebab-casing, keys are kebab-cased at compile time, and tracking becomes per-property (only the property that actually changed re-applies). Dynamic/spread style objects keep using `reactiveStyle`.

### @geajs/core (patch)

- **`reactiveStyleProp`**: new typed single-property style binding helper used by the above compiler path. Binds one CSS property to a reactive source with a string-equality guard, no record diffing.
