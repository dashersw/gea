---
"@geajs/ui": patch
---

Fixed HTML issues reported by the browser:
- **Progress**: Use `<span>` for label instead of `<label>` (`<label>` should be connected to input)
- **Select**: Add hidden `<select>` to make label's `for` attribute point to existing element
