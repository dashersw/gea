---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Conditional JSX in props and children updates**: `<Card>{cond ? <Title /> : 'plain'}</Card>` and `<Card header={cond && <Title />} />` now follow `cond` instead of showing whichever branch rendered first. Prop and `children` thunks re-run the expression on every read. Each JSX element in it is built once while it stays selected, disposed when a read picks another branch, and built again when selected again, like an in-template conditional. So a guard such as `{loggedIn && <Profile name={profile.name} />}` no longer throws after logout.
- **Nested JSX in `children` is disposed**: JSX that a nested function builds in `children` (`{xs.map((x) => <Row x={x} />)}`, `{cond ? <Title /> : xs.map(...)}`) gets a disposer per read, released when the slot showing it swaps it out, so re-reads no longer leak components. A named prop whose JSX sits inside a nested function keeps building its whole value once.

### @geajs/core (patch)

- **`children` is no longer cached at runtime**: `Component`, `CompiledComponent`, `CompiledReactiveComponent` and `mount()` stopped caching the first DOM node a `children` thunk returned. That cache pinned conditional children to their first branch. `children` now reads its thunk like every other prop, and the compiler keeps nodes stable.
- **`reactiveText` releases the nodes it drops**: when a text slot swaps out nodes that compiled `children` tagged with a disposer, it disposes them, and nodes the new array value shows again stay in place.
