---
"@geajs/core": patch
---

### @geajs/core (patch)

- **String styles keep other inline styles**: a string `style` in braces is now diffed per declaration, like a style object, instead of replacing `cssText`. `visible={false}` on the same element stays hidden when the style string changes, and inline styles set by other code (`el.style.transform = …`) survive. `;` inside quotes and `url(…)`, `!important`, `var()` in shorthands and shorthand/longhand pairs such as `padding: ${p}px; padding-left: 0` keep working. A shorthand such as `border` comes back in full when a longhand override next to it is removed, and `!important` wins over a later normal declaration, as with `cssText`. In SSR, where linkedom's style object drops `!important` and turns `--myColor` into `--my-color`, the style text is rewritten instead, so server output keeps both.
