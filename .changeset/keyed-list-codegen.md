---
'@geajs/vite-plugin': patch
---

Generate `__geaKey`-based keyed list reconciliation. Support user-provided `id` on list containers. Improve observer codegen for derived maps, dynamic keys, and conditional slots. Skip redundant className writes and use `firstChild.nodeValue` for faster text patching.
