---
'@geajs/vite-plugin': patch
---

### @geajs/vite-plugin (patch)

- **Store getters in the IR**: `storeGettersToIr` now emits `get`-accessors that return arrays into `GeaIrStore.getters[]`. Previously every getter was dropped — `storeFieldsToIr` only captured `ClassProperty` members and `storeMethodsToIr` skipped `kind: 'get'` — so a derived `get visible(): T[] { ... }` never reached downstream consumers. Each emitted getter carries `returnsArray`, `elementTypeName` (from the `T[]` / `Array<T>` return annotation), its `this.<field>` reactive dependencies, and a best-effort element shape (inferred from an object-literal `.map` callback or borrowed from a referenced array-of-objects field). Consumed by the geatsc embedded backend to back reactive `{this.getter.map(...)}` lists; inert for the web closure-codegen path.
  - `closure-codegen/ir.ts`: add the `GeaIrStoreGetter` type, `storeGettersToIr`, and element-shape inference helpers (`getterElementShape`, `getterBodyReturnsArray`, `collectThisFieldReads`, `arrayElementTypeNameFromTSType`).
  - `closure-codegen/transform/transform-store.ts`: thread `getters` into `buildStoreIr`.
