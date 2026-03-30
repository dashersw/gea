---
"@geajs/core": minor
"@geajs/vite-plugin": minor
---

### @geajs/vite-plugin (minor)

- **XSS prevention: escape dynamic text expressions**: The compiler now wraps dynamic text expressions in templates with `__escapeHtml(String(...))` to prevent script injection via `innerHTML` during initial render. Static strings continue to be escaped at compile time. Expressions that produce HTML (JSX children, `.map()` callbacks, conditional slots, `props.children`) are correctly excluded from escaping.
- **XSS prevention: sanitize dangerous URL protocols**: Dynamic attribute bindings for URL-bearing attributes (`href`, `src`, `action`, `formaction`, `data`, `cite`, `poster`, `background`) are now wrapped with `__sanitizeAttr()` to block `javascript:`, `vbscript:`, and non-image `data:` protocols.
- **XSS prevention: `dangerouslySetInnerHTML` prop**: Added support for `<div dangerouslySetInnerHTML={expr} />` to allow intentional raw HTML rendering without escaping. The prop is not rendered as a DOM attribute and supports reactive updates via `innerHTML`.

### @geajs/core (minor)

- **XSS helper functions**: Added `__escapeHtml()` and `__sanitizeAttr()` standalone functions and static methods on `Component`. These are used by the compiler-generated code to prevent XSS at runtime.
