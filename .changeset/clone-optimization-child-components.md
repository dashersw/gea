---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Partial clone optimization**: Components with child component instances are now eligible for clone template optimization. The compiler generates a static HTML skeleton with slot placeholders (`data-gea-child-slot`) for child components, which are replaced at mount time via `parentNode.replaceChild`. Previously, any component containing child component instances was excluded from clone optimization entirely.
