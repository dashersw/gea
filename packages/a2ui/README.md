# @geajs/a2ui

An [A2UI](https://a2ui.org) v0.9.1 renderer for Gea.

Three layers, one interpreted:

- **Leaves** are compiled Gea components (`@geajs/ui` and local `.tsx`), instantiated by reference through `mount()`.
- **State** is a Gea `Store` (a Proxy), addressed by JSON Pointer.
- **Composition** — the agent-authored adjacency list — is the only interpreted part: one parent-directed walk at mount, then idle.

The interpreter owns no reactivity. It passes lazy **prop thunks** to `mount()`; the compiled leaf reads them inside its own binding, which runs under Gea's tracking scope, so store reads auto-subscribe.

## Usage

```ts
import { SurfaceRegistry, dispatch, createBasicCatalog, BUILTIN_FUNCTIONS } from '@geajs/a2ui'

const registry = new SurfaceRegistry(() => document.getElementById('app')!)
const opts = {
  catalog: createBasicCatalog(),
  functions: BUILTIN_FUNCTIONS,
  transport: { sendAction: (a) => socket.send(JSON.stringify({ version: 'v0.9.1', action: a })) },
}

for await (const envelope of stream) dispatch(envelope, registry, opts)
```

## Scope

Happy path only: one surface, basic catalog, in-order delivery, schema-valid input, `root` present in the mounting `updateComponents`.

Not implemented: schema validation and the `VALIDATION_FAILED` loop, out-of-order buffering beyond the root rule, capability negotiation, multi-surface orchestration, `deleteSurface` teardown.

`Tabs`, `Modal`, `Slider`, and `ChoicePicker` are registered so the catalog covers all 18 spec types, but their props pass straight through. Their Zag prop shapes have not been mapped, and because `Slider` and `ChoicePicker` are input components, **their write-back (`onValueChange`) is not wired** — two-way binding does not work for them yet. Their tests assert registration only, never behavior.

Accepts both `v0.9` and `v0.9.1` envelopes. A2UI v1.0 is a release candidate; `dispatcher.ts` is the single place that reads `version`.

## Notes for contributors

Two Gea details the renderer depends on, both verified against the runtime:

- **Containers must not render `{props.children}`.** The compiler turns a child expression into a reactive text marker whose placeholder (`"0"`) stays in the DOM when no `children` thunk is passed. Local containers omit the slot; gea-ui containers get `children: () => ''`.
- **`keyedList` needs the array-path form**, not the `() => any[]` getter. The getter branch reconciles without change records, so `reverse()`/`sort()` take the dirty-scan path and never move DOM nodes.

Tests run under `node:test` with jsdom. `tests/gea-loader.ts` registers a Node module hook that applies `geaPlugin().transform` to `.tsx` — `tsx` alone transpiles JSX but does not compile Gea components, and an uncompiled leaf mounts to nothing. Gea delegates DOM events at the document root, so every DOM test must attach its host to `document.body`.
