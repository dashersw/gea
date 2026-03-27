---
"@geajs/core": patch
---

Fix JSX typings for Gea lowercase DOM event props (`input`, `click`, `keydown`, etc.): model them as native browser events (not React synthetic types) using `globalThis.*` inside the `react` module augmentation, plus a bivariant handler so wide `(e: Event)` and narrower DOM handlers both type-check.
