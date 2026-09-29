---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **JSX comments inside fragments no longer break rendering**: a `{/* comment */}` child of a `<>…</>` fragment emits no DOM node, but the compiler still counted it when working out where the fragment's other children sit. Bindings after the comment pointed at the wrong node, and mounting threw `Cannot read properties of undefined (reading 'firstChild')`. Fragments now skip empty expression children, as elements already did.
