---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Conditional JSX in props and children updates**: `<Card>{cond ? <Title /> : 'plain'}</Card>` and `<Card header={cond && <Title />} />` now follow `cond` instead of showing whichever branch rendered first. Prop and `children` thunks re-run the expression on every read. Each JSX element the expression evaluates directly is built once while it stays selected, disposed when a read picks another branch, and rebuilt when selected again, like an in-template conditional. JSX inside a nested function follows the next point. So a guard such as `{loggedIn && <Profile name={profile.name} />}` no longer throws after logout.
- **Nested JSX in `children` is disposed**: JSX that a nested function builds while `children` is read (`{show && xs.map((x) => <Row x={x} />)}`, `{(() => (cond ? <Title /> : 'plain'))()}`, a helper that a `.map` callback calls) gets a disposer per read, released when the slot showing it swaps it out, so re-reads no longer leak components. A function that `children` hands out, like a render prop, still builds on the parent's disposer. JSX that a later read gets back from user code, such as a node cache, stays until the parent is disposed. A named prop whose JSX sits inside a nested function keeps building its whole value once.

### @geajs/core (patch)

- **`children` is no longer cached at runtime**: `Component`, `CompiledComponent`, `CompiledReactiveComponent` and `mount()` stopped caching the first DOM node a `children` thunk returned. That cache pinned conditional children to their first branch. `children` now reads its thunk like every other prop, and the compiler keeps nodes stable.
- **`reactiveText` releases the nodes it drops**: nodes that compiled `children` tags with a read's disposer are disposed once the text slot has dropped all of that read's nodes or is torn down, so siblings it still shows keep their bindings. Nodes the new array value shows again stay in place.
