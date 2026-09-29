---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Custom properties keep their spelling**: a static-key style object like `style={{ '--myColor': 'red' }}` now sets `--myColor` instead of `--my-color`. Custom property names are case-sensitive, so `var(--myColor)` found nothing before.

### @geajs/core (patch)

- **Custom properties keep their spelling**: dynamic style objects and `h()` no longer kebab-case keys that start with `--`, so `'--myColor'` sets `--myColor`.
- **`h()` skips empty style values**: `null`, `undefined` and `false` entries in a `style` object are left out, like in compiled components, so `var(--gap, 8px)` falls back to `8px` when `--gap` is unset. A style object with nothing left renders no `style` attribute.
