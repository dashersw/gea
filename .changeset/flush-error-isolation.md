---
"@geajs/core": patch
---

Fix cascading flush failures: when an observer handler throws during `Store.flushAll()` or the global microtask flush, remaining stores in the batch are no longer skipped. Each store's flush is now isolated with try/catch so one error does not block other stores (e.g. dialog close) from updating.
