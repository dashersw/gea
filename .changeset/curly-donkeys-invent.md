---
"@geajs/a2ui": minor
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/a2ui (minor)

- **New package**: A2UI v0.9.1 renderer for Gea. Interprets agent-authored UI composition onto compiled Gea leaves — leaves come from `@geajs/ui` and local `.tsx`, state is a Gea `Store` addressed by JSON Pointer, and only the adjacency list is interpreted (one parent-directed walk at mount).

### @geajs/core (patch)

- **Export runtime types from `./compiler-runtime`**: `Disposer`, `Entry`, `ItemObservable`, and `KeyedListConfig` were reachable at runtime but had no type exports, so external consumers of `mount()` / `keyedList()` could not type their call sites.
- **`Change.itemDirty`**: declared the field that `keyed-list`'s `itemDirtyOnly` fast path reads. It fixes a `tsc --noEmit` failure in `keyed-list.ts`. No runtime behavior change — nothing sets the field today, so that path remains disabled.

### @geajs/vite-plugin (patch)

- Version bump only (linked to `@geajs/core`).
