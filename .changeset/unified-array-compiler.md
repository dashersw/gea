---
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Unified array compiler**: Merged `gen-array.ts`, `gen-array-patch.ts`, `gen-array-render.ts`, and `gen-array-slot-sync.ts` into a single `array-compiler.ts` (1,833 lines). Eliminates 4 files and deduplicates shared helpers (`thisPrivate`, naming helpers). All 410 tests pass with identical generated output.
