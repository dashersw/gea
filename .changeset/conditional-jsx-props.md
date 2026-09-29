---
"@geajs/core": patch
"@geajs/vite-plugin": patch
---

### @geajs/vite-plugin (patch)

- **Conditional JSX in props and children updates**: `<Card>{cond ? <Title /> : 'plain'}</Card>` and `<Card header={cond && <Title />} />` now follow `cond` instead of showing whichever branch rendered first. Prop and `children` thunks re-run the expression on every read. Each JSX element the value is made of directly (a branch of `?:`, `&&`, `||` or `??`, or an array element) is built once while it stays selected, disposed when a read picks another branch, and rebuilt when selected again, like an in-template conditional. JSX inside a nested function follows the next point. So a guard such as `{loggedIn && <Profile name={profile.name} />}` no longer throws after logout.
- **Nested JSX in `children` is disposed**: JSX that a function the read runs returns into the value (`{show && xs.map((x) => <Row x={x} />)}`, `{(() => (cond ? <Title /> : 'plain'))()}`, a `const` helper that a `.map` callback returns the result of) gets a disposer per read, released when the slot showing it swaps it out, so re-reads no longer leak components. JSX that user code can keep, because the expression passes it to a function (`cache.get(k) ?? cacheSet(k, <Row />)`), stores it, or builds it in a function it hands out, like a render prop, builds on the parent's disposer as before, so it stays live whenever user code shows it again. Such an expression keeps what it did before: in `children`, the first DOM node it returns is kept for later reads, so `{wrap(<Title />)}` builds one `Title`, not one per read. A named prop with JSX anywhere but those direct branches keeps building its whole value once. Nodes in a nested array (`[xs.map((x) => <Row />)]`) are disposed like top-level ones.

### @geajs/core (patch)

- **`children` is no longer cached at runtime**: `Component`, `CompiledComponent`, `CompiledReactiveComponent` and `mount()` stopped caching the first DOM node a `children` thunk returned. That cache pinned conditional children to their first branch. `children` now reads its thunk like every other prop, and the compiler keeps nodes stable, including that first-node cache for expressions whose JSX user code can keep.
- **`reactiveText` releases the nodes it drops**: nodes that compiled `children` tags with a read's disposer are disposed once the text slot has dropped all of that read's nodes or is torn down, so siblings it still shows keep their bindings. Nodes the new array value shows again stay in place.
