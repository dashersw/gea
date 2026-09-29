---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Conditional JSX in props and children updates**: `<Card>{cond ? <Title /> : 'plain'}</Card>` and `<Card header={cond && <Title />} />` now follow `cond` instead of showing whichever branch rendered first. Prop and `children` thunks re-run the expression on every read, and each JSX element in it is built once and reused, so repeat reads and toggles don't construct another `<Title />`. JSX children, `.map` children and props whose only JSX sits inside a nested function keep building their value once.

### @geajs/core (patch)

- **`children` is no longer cached at runtime**: `Component`, `CompiledComponent`, `CompiledReactiveComponent` and `mount()` stopped caching the first DOM node a `children` thunk returned. That cache pinned conditional children to their first branch. `children` now reads its thunk like every other prop, and the compiler keeps nodes stable.
