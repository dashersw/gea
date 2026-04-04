---
"@geajs/ui": patch
---

Fix missing `stashComponentForTransfer` import in dnd-manager causing `ReferenceError` when dropping a dragged card into a different column. Also remove unused `geaListItemsSymbol` import.
