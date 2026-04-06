---
"@geajs/ui": patch
---

Replace React type imports with framework-agnostic alternatives. `ReactNode` is replaced by a local `JSXNode` type and `MouseEventHandler` now wraps the native DOM `MouseEvent` instead of React's synthetic event. `@types/react` is removed from devDependencies.
