# `@geajs/suspense` — Implementation Plan

> **Branch**: `feat/suspense`  
> **Issue**: [#63 — Suspense Component](https://github.com/dashersw/gea/issues/63)  
> **Author**: Recep Şen  
> **Date**: 2026-04-13  
> **Status**: Planning complete — all design questions resolved, ready for implementation

---

## 1. Package Decision

### Name: `@geajs/suspense`

All official packages in this monorepo use the `@geajs/` scope:

| Package | Name |
|---------|------|
| Core runtime | `@geajs/core` |
| SSR | `@geajs/ssr` |
| UI library | `@geajs/ui` |
| Mobile | `@geajs/mobile` |
| Vite plugin | `@geajs/vite-plugin` |

Therefore: **`@geajs/suspense`** (not `@geajs/core/suspense`, not a subpath export).

### Separate Package vs. Core Integration

**Decision: Separate package** — following the `@geajs/ssr` precedent.

Rationale:
- Tree-shaking: users who don't need Suspense pay zero cost
- Versioning independence: Suspense can ship patches/features without bumping `@geajs/core`
- API surface: keeps `@geajs/core` minimal per the framework's philosophy
- Precedent: `@geajs/ssr` is also a "core extension" shipped as its own package

`@geajs/core` will NOT export `Suspense` directly. Users import from `@geajs/suspense`.

```ts
// Usage
import { Suspense } from '@geajs/suspense'
```

---

## 2. Package Location

```text
packages/
  gea-suspense/           ← new package
    src/
      index.ts            ← public exports
      suspense.ts         ← core Suspense component
      types.ts            ← SuspenseProps, SuspenseState
      abort.ts            ← AbortController integration
      triggers.ts         ← viewport/idle/interaction triggers
    tests/
      suspense.test.ts    ← unit tests
      suspense-error.test.ts
      suspense-timing.test.ts
      suspense-abort.test.ts
      suspense-triggers.test.ts
      suspense-benchmarks.test.ts  ← benchmarks
    package.json
    tsconfig.json
    README.md
```

---

## 3. Package Configuration (`package.json` skeleton)

```json
{
  "name": "@geajs/suspense",
  "version": "0.1.0",
  "type": "module",
  "description": "Declarative async rendering boundaries for Gea framework",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    }
  },
  "peerDependencies": {
    "@geajs/core": "*"
  },
  "devDependencies": {
    "@geajs/core": "*",
    "tsdown": "^0.21.2",
    "tsx": "^4.21.0",
    "typescript": "~5.8.0",
    "jsdom": "^29.0.0",
    "@types/node": "^25.5.0"
  }
}
```

**Zero runtime dependencies** — `@geajs/core` is a peer dep (not bundled), no third-party libs.

Build tool: `tsdown` (same as `@geajs/core`, consistent toolchain).

---

## 4. Implementation Phases

### Phase 1 — Core Suspense (Fallback + Resolve)

**Goal**: `<Suspense fallback={<Spinner />}><AsyncChild /></Suspense>` works.

Tasks:
- [ ] Scaffold `packages/gea-suspense/` with `package.json`, `tsconfig.json`
- [ ] `src/types.ts` — `SuspenseProps` interface (Phase 1 subset: `fallback`, `onResolve`)
- [ ] `src/suspense.ts` — `Suspense` class extending `Component`
  - Collect child components with pending `async created()` lifecycle
  - `Promise.allSettled()` parallel resolution (anti-waterfall, enables partial render)
  - `GEA_SWAP_CHILD` reuse for fallback → content transition
  - Insert fallback on mount
  - Swap to content on resolve
- [ ] Add package to workspace `package.json`
- [ ] `tests/suspense.test.ts` — unit tests:
  - renders fallback initially
  - replaces fallback with content on resolve
  - parallel resolution (all children start simultaneously)
  - works with no async children (immediate render)
  - works with multiple async children
- [ ] Export from `src/index.ts`
- [ ] Add to monorepo root `tsconfig`

**Deliverable**: Basic fallback/resolve works.

---

### Phase 2 — Error Handling + Retry

**Goal**: `error={(err, retry) => <ErrorUI onRetry={retry} />}` works.

Tasks:
- [ ] `src/types.ts` — add `error`, `onError` to `SuspenseProps`
- [ ] `src/suspense.ts` — error state management
  - `try/catch` around `Promise.all()`
  - render `error(err, retry)` JSX on failure
  - `retry()` re-runs `async created()` on ALL failed children
  - `GEA_SWAP_CHILD` to switch between fallback/error/content states
  - `onError(err)` callback invocation
- [ ] Partial failure handling (some children resolve, some fail)
- [ ] `tests/suspense-error.test.ts`:
  - shows error UI when child throws
  - retry re-runs async created
  - retry succeeds and shows content
  - `onError` callback called with correct error
  - partial failure: resolved children render, failed children show error state independently (Promise.allSettled semantics)

**Deliverable**: Error boundary with retry built into Suspense.

---

### Phase 3 — Timing + Race Condition Prevention

**Goal**: Fast responses don't flash spinner; slow responses display spinner for at least `minimumFallback` ms.

Tasks:
- [ ] `src/types.ts` — add `timeout`, `minimumFallback`, `onFallback` to `SuspenseProps`
- [ ] `src/suspense.ts`:
  - `timeout` — delay timer before showing fallback (`setTimeout` → show fallback)
  - `minimumFallback` — track `fallbackShownAt` timestamp; if resolve arrives too early, wait remaining ms
  - `onFallback()` callback when fallback becomes visible
  - Generation counter (monotonic integer) — stale async responses are discarded silently
- [ ] `tests/suspense-timing.test.ts`:
  - `timeout=200`: fast resolve (50ms) → fallback NEVER shown
  - `timeout=200`: slow resolve (300ms) → fallback shown
  - `minimumFallback=300`: resolve at 50ms but fallback shown → wait until 300ms
  - generation counter: rapid re-mounts don't show stale content
  - `onFallback` fires exactly once

**Deliverable**: Configurable flicker prevention.

---

### Phase 4 — Stale-While-Refresh + AbortController

**Goal**: Re-fetches show stale content with CSS class instead of flashing to skeleton.

Tasks:
- [ ] `src/abort.ts` — `AbortController` lifecycle integration
  - Create controller on mount
  - Abort on unmount
  - Pass signal to `async created()` (TBD: parameter vs `this.abortSignal` — see Q4)
- [ ] `src/types.ts` — add `staleWhileRefresh`, `AbortSignal` propagation
- [ ] `src/suspense.ts`:
  - `staleWhileRefresh=true`: on re-fetch, add `suspense-refreshing` CSS class to content container instead of swapping to fallback
  - Optional `refreshing` render prop: `refreshing={(children) => <div class="overlay">{children}</div>}` — wraps stale content if provided
  - Remove CSS class on new content arrival
  - Abort previous operations when new fetch starts
  - Memory leak prevention: abort on component unmount
- [ ] `tests/suspense-abort.test.ts`:
  - abort signal is aborted on unmount
  - `staleWhileRefresh`: old content stays visible during refresh
  - `staleWhileRefresh`: CSS class added/removed correctly
  - rapid re-mounts don't leak AbortControllers

**Deliverable**: No more skeleton flash on data refresh.

---

### Phase 5 — Trigger-Based Loading

**Goal**: `<Suspense trigger="viewport"><HeavyChart /></Suspense>` loads only when scrolled into view.

Tasks:
- [ ] `src/triggers.ts`:
  - `"immediate"` — default, loads on mount
  - `"idle"` — `requestIdleCallback` (with `setTimeout` fallback for Safari)
  - `"viewport"` — `IntersectionObserver`
  - `"interaction"` — `addEventListener("click")` / `"keydown"`
  - `"hover"` — `addEventListener("mouseenter")`
  - `"timer(ms)"` — `setTimeout(ms)`
- [ ] `src/types.ts` — add `trigger`, `prefetch` to `SuspenseProps`
- [ ] `src/suspense.ts`:
  - Wire trigger logic: only start child loading after trigger fires
  - `prefetch="idle"` — pre-load during idle, display on trigger
  - Clean up observers/listeners on unmount
- [ ] Router integration (TBD: auto-wrap or opt-in — see Q6)
- [ ] `tests/suspense-triggers.test.ts`:
  - `"immediate"` starts on mount
  - `"idle"` defers until requestIdleCallback
  - `"viewport"` uses IntersectionObserver (mock in tests)
  - `"timer(500)"` delays 500ms
  - observers cleaned up on unmount

**Deliverable**: Deferred loading with all Angular `@defer`-inspired triggers.

---

### Phase 6 — SSR Streaming Integration

**Goal**: Suspense works with `@geajs/ssr` streaming deferreds — same boundary on server and client.

Tasks:
- [ ] `src/types.ts` — add `ssrStreamId` to `SuspenseProps`
- [ ] `src/suspense.ts` (client side):
  - On hydration: find element by `ssrStreamId`
  - If SSR stream already resolved → skip loading, go straight to "resolved" state
  - If still showing SSR fallback → take over async operation client-side
- [ ] `@geajs/ssr` coordination (may need minor changes to SSR deferred chunk format)
- [ ] Tests (requires jsdom + SSR test helper):
  - server renders fallback with correct ID
  - client hydrates and continues where SSR left off
  - edge case: SSR resolved before hydration
  - edge case: SSR failed — client shows error boundary

**Deliverable**: Unified server/client Suspense with zero hydration mismatches.

---

## 5. Testing Strategy

### Framework
`node:test` (same as `@geajs/core`) + `jsdom` for DOM simulation.

```ts
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
```

### Test script (package.json)
```json
"test": "tsx --conditions source --test 'tests/**/*.test.ts'"
```

### Coverage target
- Phase 1–3: **≥90% line coverage**
- Phase 4–6: **≥85% line coverage**
- All edge cases explicitly named in test descriptions

### Benchmark strategy
Using `node:test`'s built-in benchmark support:

```ts
import { bench, run } from 'node:test'
```

Benchmark targets:
1. **Mount time**: Suspense with 10 async children vs. 10 direct children
2. **Memory**: No leaked references after unmount (AbortController cleanup)
3. **Re-render**: `staleWhileRefresh` re-fetch performance
4. **Trigger overhead**: Cost of setting up IntersectionObserver per boundary

---

## 6. Changeset

```markdown
---
"@geajs/suspense": minor
---

### @geajs/suspense (minor)

- **Initial release**: Declarative async rendering boundaries with fallback, error handling, timing control, stale-while-refresh, trigger-based loading, and SSR streaming integration
```

---

## 7. Monorepo Integration

1. Add `packages/gea-suspense` to root `package.json` workspaces
2. Add to root `tsconfig.json` project references
3. Register in `.changeset/` with `minor` bump (new package)
4. Add to CI test matrix

---

## 8. Confirmed Decisions (All Questions Answered)

| # | Question | Decision |
|---|----------|----------|
| Q1 | PR phase scope | **All 6 phases** in this PR |
| Q2 | `@geajs/core` re-export | **No** — import only from `@geajs/suspense` |
| Q3 | AbortController signal API | **`this.abortSignal`** instance property |
| Q4 | `staleWhileRefresh` display | **Both** — CSS class (`suspense-refreshing`) + optional `refreshing` render prop |
| Q5 | Router lazy route wrapping | **Opt-in** — `{ lazy: true, suspense: { fallback: <Spinner /> } }` in router config |
| Q6 | Trigger scope | **All 6 triggers** — viewport, idle, interaction, hover, timer, immediate |
| Q7 | SSR phase scope | **Full SSR integration** in this PR (Phase 6) |
| Q8 | Build tool | **`tsdown`** — consistent with `@geajs/core` |
| Q9 | Example app | **New `examples/suspense-demo/`** — kitchen-sink demo |
| Q10 | Benchmark limits | **Write benchmarks, no hard CI gates** — establish baseline |
| Q11 | `minimumFallback` default | **300ms** — Vue-like, avoids spinner flash by default |
| Q12 | Nested Suspense | **Fully independent** — each boundary resolves on its own timeline |
| Q13 | Partial failure behavior | **Partial render** via `Promise.allSettled()` — resolved children show, failed ones show error |

---

## 9. Decisions Already Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package name | `@geajs/suspense` | Follows `@geajs/` scope convention |
| Package location | `packages/gea-suspense/` | Follows `packages/gea-ssr/` precedent |
| Core vs separate | Separate package | Tree-shaking, independent versioning |
| Test framework | `node:test` | Consistent with `@geajs/core` |
| Build tool | `tsdown` | Consistent with `@geajs/core` |
| Runtime dependencies | Zero | Peer dep on `@geajs/core` only |
| Promise strategy | `Promise.allSettled()` | Parallel + partial render support |
| Error + Suspense | Same component | One `error` prop, no separate ErrorBoundary |
| Race conditions | Generation counter | Monotonic ID, stale responses discarded |
| AbortController | `this.abortSignal` | Consistent with Gea class-based API |
| staleWhileRefresh | CSS class + render prop | `suspense-refreshing` class + optional `refreshing` prop |
| minimumFallback | 300ms default | Avoids spinner flash for fast responses |
| Partial failure | Partial render | Each child independent via `Promise.allSettled()` |
| Router integration | Opt-in config | `{ suspense: { fallback } }` in route definition |
| Triggers | All 6 | viewport, idle, interaction, hover, timer, immediate |
| Example app | `examples/suspense-demo/` | Kitchen-sink demo |

---

## 11. Compiler Support (@geajs/vite-plugin)

`<Suspense>` must be usable in JSX without any compiler changes blocking correctness — but to
generate efficient, reactive compiled output the compiler needs to recognise `Suspense` as a
**built-in framework component**, not as a user-imported component.  This section documents every
change required in `packages/vite-plugin-gea/`.

---

### 11.1 Files that need changes

| File | What changes |
|------|-------------|
| `src/codegen/jsx-utils.ts` | Add `BUILT_IN_COMPONENT_TAGS` set; extend `isComponentTag` (or add a sibling `isBuiltInComponent`) to recognise `"Suspense"` |
| `src/parse/parser.ts` | Whitelist `Suspense` so the import-presence check (if any) is skipped for built-ins |
| `src/ir/types.ts` | Add optional fields to `ChildComponent` for Suspense-specific metadata (render-prop JSX slots) |
| `src/codegen/gen-children.ts` | Handle the `Suspense` child specially: extract `fallback`, `error`, `timeout`, `minimumFallback`, `staleWhileRefresh`, `trigger`, `refreshing` props and pass them through as a props object |
| `src/codegen/gen-prop-change.ts` | Emit reactive `__onPropChange` entries for every reactive Suspense prop so the boundary updates when the parent's store changes |
| `src/codegen/gen-observer-wiring.ts` | Register `__observe()` calls for store paths referenced inside `fallback={...}` / `error={...}` JSX render-prop expressions |
| `tests/` | New test file `packages/vite-plugin-gea/tests/suspense-transform.test.ts` |

---

### 11.2 Detecting `<Suspense>` as a built-in

The compiler currently uses a single rule in `src/codegen/jsx-utils.ts`:

```ts
export function isComponentTag(tagName: string): boolean {
  return tagName.length > 0 && isUpperCase(tagName[0])
}
```

Any PascalCase tag is treated as a component **and** must be resolvable from an `import` in the
file.  `Suspense` satisfies PascalCase, but it lives in `@geajs/suspense` — a peer dep the parent
component may or may not import (the import exists at the *user* level; the compiler still needs to
know it is framework-owned and not a user-defined class it must introspect for props).

**Required change — `jsx-utils.ts`:**

```ts
/** Tags that are framework built-ins and require special codegen treatment. */
export const BUILT_IN_COMPONENT_TAGS = new Set(['Suspense'])

/**
 * Returns true when the tag is a framework built-in component.
 * Built-ins are handled by dedicated codegen paths; they do not go through
 * the generic ChildComponent IR construction path.
 */
export function isBuiltInComponentTag(tagName: string): boolean {
  return BUILT_IN_COMPONENT_TAGS.has(tagName)
}
```

Callers that walk the JSX tree and collect child components (in the analyzer and parser) must check
`isBuiltInComponentTag(tagName)` *before* `isComponentTag(tagName)` and route to the Suspense
codegen path instead of the generic `ChildComponent` path.

---

### 11.3 Extracting render-prop slots at compile time

`<Suspense>` accepts JSX expressions as props (`fallback`, `error`, `refreshing`).  These are
**render props** — they contain JSX trees that must be compiled into template strings just like any
other JSX in the file.

The compiler already handles JSX-valued props for list `itemTemplate` (see `ArrayMapBinding.itemTemplate`).
The same mechanism applies:

1. During JSX analysis, when a `<Suspense>` element is encountered, walk its JSX attributes.
2. For each attribute whose value is a `JSXExpressionContainer` wrapping a `JSXElement` or
   `JSXFragment` (i.e. `fallback={<Spinner />}`), extract the inner JSX node.
3. Compile that inner JSX node to a template string via `transformJSXElementToTemplate` /
   `transformJSXFragmentToTemplate` (the same functions used in `gen-template.ts`).
4. Store the compiled template string alongside the Suspense props object so `gen-children.ts` can
   emit it as a string literal argument rather than a live JSX expression.

If the render-prop JSX references reactive store paths (e.g. `fallback={<div>{store.message}</div>}`),
those paths must be registered in the observer wiring (see §11.4).

---

### 11.4 Generating observer bindings for reactive Suspense props

Suspense props that are **expressions** (not static JSX trees) must participate in the reactive
observer system so the boundary re-renders when the underlying store value changes.

The existing pattern for child component prop reactivity is:

- `gen-prop-change.ts` emits a `[GEA_ON_PROP_CHANGE]` method on the parent class.
- `gen-observer-wiring.ts` emits `createdHooks()` which calls `this.__observe(store, pathParts, methodName)`.

For `<Suspense>`, the same hooks apply for any prop whose value references a store path:

| Prop type | Reactive? | How |
|-----------|-----------|-----|
| `fallback={<StaticJSX />}` | No — static template string | Compiled to string constant; no observer needed |
| `fallback={this.store.loadingMsg ? <A/> : <B/>}` | Yes — conditional on store path | Register `__observe` for `store.loadingMsg`; patch via `this.suspenseChild.__updateFallback(newTemplate)` |
| `timeout={this.store.timeoutMs}` | Yes — scalar store value | Register `__observe` for `store.timeoutMs`; update via `this.suspenseChild[GEA_ON_PROP_CHANGE]('timeout', newVal)` |
| `error={(e, retry) => <div>{e.message}</div>}` | No — function literal | Passed once at construction; no observer |

The `__onPropChange` method on the `Suspense` component (inside `@geajs/suspense`) receives the
prop name + new value and applies it to internal state — this is the same protocol already used for
all `ChildComponent` instances (see `gen-prop-change.ts` → `ensureOnPropChangeMethod`).

For `fallback` props that are reactive JSX, the compiler cannot pre-compile to a static string; it
must emit an inline function that re-evaluates the JSX expression and re-compiles the template
whenever the store changes.  This is the same "rerender" observer method pattern used for
conditional slots today.

---

### 11.5 Detecting children with `async created()` — compile time vs runtime

**Verdict: runtime detection only.**

The compiler cannot reliably determine at the call site whether a child component has an
`async created()` lifecycle, because:

- The child class is imported from another file (or a library).
- The compiler transforms each file independently; it does not cross-file analyse the superclass
  chain at JSX-use time.
- The child might be a dynamic expression (e.g. `<this.store.widget />`).

Therefore `<Suspense>` must discover async children at **runtime** by inspecting each mounted child
after `this[GEA_CHILD](ChildClass, props)` returns.  The proposed mechanism (in `src/suspense.ts`)
is to check whether the child instance's `created` method is an `AsyncFunction`:

```ts
function isAsyncCreated(child: Component): boolean {
  return child[GEA_CREATED_PROMISE] instanceof Promise
}
```

The compiler's role is limited to:
1. Passing the children through as normal `ChildComponent` instantiations (no special annotation).
2. Ensuring `Suspense`'s own props (fallback, timeout, etc.) are wired reactively (§11.4).

No compile-time `async created()` detection is required or planned.

---

### 11.6 Generated output for a simple `<Suspense fallback={...}>` usage

**Input source:**

```tsx
import { Component } from '@geajs/core'
import { Suspense } from '@geajs/suspense'
import UserProfile from './UserProfile'

export default class Dashboard extends Component {
  template(props) {
    return (
      <Suspense fallback={<div class="spinner">Loading…</div>} timeout={200}>
        <UserProfile userId={props.userId} />
      </Suspense>
    )
  }
}
```

**Expected compiled output (pseudocode — actual AST differs):**

```js
import { GEA_CHILD, GEA_ON_PROP_CHANGE } from '@geajs/core'
import { Suspense } from '@geajs/suspense'
import UserProfile from './UserProfile'

export default class Dashboard extends Component {
  // Lazy getter for the Suspense boundary instance
  get __suspense0() {
    if (!this.__lazySuspense0) {
      this.__lazySuspense0 = this[GEA_CHILD](Suspense, this.__suspense0Props())
    }
    return this.__lazySuspense0
  }

  // Props builder — called once on construction and again via __onPropChange
  __suspense0Props() {
    return {
      // Static render-prop compiled to a template string constant
      fallback: `<div class="spinner">Loading…</div>`,
      timeout: 200,
      // Children passed as class references (runtime constructs them)
      children: [{ component: UserProfile, props: { userId: this.props.userId } }],
    }
  }

  // Reactive prop update hook — fires when parent store/props change
  [GEA_ON_PROP_CHANGE](key, value) {
    if (key === 'userId') {
      this.__suspense0[GEA_ON_PROP_CHANGE]('children[0].props.userId', value)
    }
  }

  template(props) {
    return this.__suspense0.element
  }
}
```

Key observations:
- `fallback={<div class="spinner">Loading…</div>}` — static JSX → compiled to a string constant at
  build time; zero runtime overhead.
- `timeout={200}` — static scalar → inlined directly; no observer.
- `<UserProfile userId={props.userId} />` — passed as a `{ component, props }` descriptor; the
  `Suspense` runtime instantiates it and listens for `async created()`.
- If `timeout` were `{this.store.loadoutMs}`, the compiler would additionally emit a
  `createdHooks()` `__observe` call targeting `store.loadoutMs` and a corresponding
  `__onPropChange` branch updating `this.__suspense0[GEA_ON_PROP_CHANGE]('timeout', newVal)`.

---

### 11.7 New test file

`packages/vite-plugin-gea/tests/suspense-transform.test.ts` should cover:

- `<Suspense fallback={<Spinner />}>` compiles without errors
- `Suspense` tag is not treated as a user-imported component (no "missing import" error)
- Static `fallback` JSX is compiled to a string constant in the output
- Reactive `timeout={this.store.ms}` emits an `__observe` call in `createdHooks()`
- Reactive `timeout` emits a `[GEA_ON_PROP_CHANGE]` branch in the parent
- Nested `<Suspense>` inside another `<Suspense>` compiles correctly (independent boundaries)
- `<Suspense>` with no async children compiles and runs without errors (immediate render path)

---

## 12. Core Integration Details (@geajs/core Changes)

This section documents the **minimal, targeted changes** required in `@geajs/core` to support `@geajs/suspense`. All changes are additive; no existing public API is removed or altered.

---

### 12.1 `component.tsx` — Changes Required

#### 12.1.1 `async created()` lifecycle hook

**Location**: `component.tsx` line 434 (constructor body) and line 442 (method stub).

```ts
// Line 433–435 — constructor calls created() for non-compiled components:
if (!(this.constructor as any)[GEA_COMPILED]) {
  this.created(this.props)   // returns void; if overridden as async, the Promise is discarded
  this.createdHooks(this.props)
  ...
}

// Line 442 — stub in Component base class:
created(_props: P) {}
```

**Key observations**:
- `created(props: P)` is a plain synchronous stub. When a subclass overrides it as `async created()`, the returned `Promise` is silently discarded by the constructor call on line 434.
- There is **no existing flag or stored Promise** indicating that an async `created()` is in flight.
- The compiled path (`GEA_COMPILED` is `true`) skips the constructor call entirely; the compiler-generated code calls `created` at a different point.

**Change needed** — store the return value so Suspense can detect pending async work:

```ts
// In constructor (replacing the current this.created(this.props) call):
if (!(this.constructor as any)[GEA_COMPILED]) {
  const createdResult = this.created(this.props)
  if (createdResult instanceof Promise) {
    ;(this as any)[GEA_CREATED_PROMISE] = createdResult
  }
  this.createdHooks(this.props)
  ...
}
```

This is a **one-line additive change** (capture return value + conditional assign). Components that return `void` from `created()` are completely unaffected.

---

#### 12.1.2 `this.abortSignal: AbortSignal` property

**Location**: `Component` base class (after the `created` stub, ~line 442).

The `Component` class currently has no `abortSignal` property. The decision (Q3/Q4, section 9) is `this.abortSignal` as the access pattern.

**Change needed** — add the property and wire it into `dispose()`:

```ts
// Lazy getter — only allocates when accessed
get abortSignal(): AbortSignal {
  let controller = (this as any)[GEA_ABORT_CONTROLLER]
  if (!controller) {
    controller = new AbortController()
    ;(this as any)[GEA_ABORT_CONTROLLER] = controller
  }
  return controller.signal
}

// In dispose() — only abort if controller was created:
;(this as any)[GEA_ABORT_CONTROLLER]?.abort()
```

---

#### 12.1.3 `GEA_SWAP_CHILD` — How Suspense Reuses It

**Location**: `component.tsx` lines 1266–1292.

```ts
Component.prototype[GEA_SWAP_CHILD] = function (
  this: AC,
  markerId: string,
  newChild: Component | false | null | undefined,
) {
  // 1. Find the DOM comment marker: <parent-id>-<markerId>
  const marker = _getEl(eng[GEA_ID] + '-' + markerId)
  if (!marker) return

  // 2. Remove element immediately after the marker (current content)
  const oldEl = marker.nextElementSibling
  if (newChild && newChild[GEA_RENDERED] && engineThis(newChild)[GEA_ELEMENT] === oldEl) return  // already correct, no-op
  if (oldEl && oldEl.tagName !== 'TEMPLATE') {
    const oldChild = _i.childComponents.find(c => engineThis(c)[GEA_ELEMENT] === oldEl)
    if (oldChild) { oldChild[GEA_RENDERED] = false; engineThis(oldChild)[GEA_ELEMENT] = null }
    oldEl.remove()
  }
  if (!newChild) return  // removes old, inserts nothing (clear slot)

  // 3. Render newChild HTML after the marker, then mount it
  marker.insertAdjacentHTML('afterend', String(newChild.template(newChild.props)).trim())
  const newEl = marker.nextElementSibling
  engineThis(newChild)[GEA_ELEMENT] = newEl
  _pushCC(_i, newChild)    // register as child component
  _mountComp(newChild, false)  // set rendered=true, call onAfterRender
}
```

**How Suspense uses this**: The `Suspense` component owns a comment marker (e.g. `<!--<id>-content-->`). On mount it calls `this[GEA_SWAP_CHILD]('content', this.fallbackInstance)` to insert the fallback. When all pending children resolve it calls `this[GEA_SWAP_CHILD]('content', this.contentWrapper)` to swap in the real content. `GEA_SWAP_CHILD` handles removing the old element, deregistering the old child, and inserting + mounting the new child atomically.

**No changes needed** to `GEA_SWAP_CHILD` itself — Suspense calls it identically to the router/conditional rendering system.

---

#### 12.1.4 `GEA_PATCH_COND` — Reference Only

**Location**: `component.tsx` line 1031.

`GEA_PATCH_COND` is the compiler-generated conditional-slot mechanism. It works with comment-bounded DOM ranges and a `getCond()` callback. **Suspense does not use `GEA_PATCH_COND`** — it uses `GEA_SWAP_CHILD`, which is the simpler single-child-swap primitive. No changes to `GEA_PATCH_COND` are needed.

---

#### 12.1.5 `dispose()` — Teardown Hook

**Location**: `component.tsx` lines 626–645.

```ts
dispose() {
  _cm().removeComponent(this)
  // Removes DOM element, clears GEA_ELEMENT
  for (const fn of _i.observerRemovers) fn()
  this[GEA_CLEANUP_BINDINGS]()
  this[GEA_TEARDOWN_SELF_LISTENERS]()
  for (const child of _i.childComponents) child?.dispose?.()
  _i.childComponents = []
}
```

There is **no `destroyed()` lifecycle hook** in the current `Component` class. `dispose()` is the only teardown path. The `GEA_ABORT_CONTROLLER?.abort()` call (§12.1.2) must be placed here, before `GEA_CLEANUP_BINDINGS`, so any in-flight `async created()` is cancelled when the component is removed (e.g. when a Suspense boundary unmounts before its children resolve).

---

### 12.2 `component-manager.ts` — No Changes Required

**Current parent-child tracking**: `GEA_PARENT_COMPONENT` is stored on `engineThis(child)` (set at line 107 of `component.tsx`). The array of child instances lives in `internals(parent).childComponents` (used throughout component.tsx). `ComponentManager.componentRegistry` is a flat `Record<id, ComponentLike>` with no tree structure.

**For Suspense**: No `ComponentManager` changes are needed. The `@geajs/suspense` package will:
1. On `Suspense.created()`, iterate `internals(this).childComponents` (via exported `GEA_CHILD_COMPONENTS` symbol accessor) to find children with a pending `GEA_CREATED_PROMISE`.
2. Walk up from any descendant via `engineThis(child)[GEA_PARENT_COMPONENT]` to find the nearest Suspense ancestor.

If Phase 6 (SSR streaming) requires global Suspense boundary enumeration, a `suspenseBoundaries: Set<ComponentLike>` field can be added to `ComponentManager` at that point. This is explicitly deferred.

---

### 12.3 `symbols.ts` — Two New Symbols

Add to `packages/gea/src/lib/symbols.ts`:

```ts
/** Pending Promise from async created() — set in constructor, cleared on resolve/reject. */
export const GEA_CREATED_PROMISE = /*#__PURE__*/ Symbol.for('gea.component.createdPromise')

/** AbortController instance backing the public `abortSignal` getter. */
export const GEA_ABORT_CONTROLLER = /*#__PURE__*/ Symbol.for('gea.component.abortController')
```

`GEA_CREATED_PROMISE` is the internal flag Suspense reads to detect pending async children:

```ts
// In Suspense.created() — collect promises from direct children:
const pendingPromises = this[GEA_CHILD_COMPONENTS]
  .filter((child: any) => child[GEA_CREATED_PROMISE] instanceof Promise)
  .map((child: any) => child[GEA_CREATED_PROMISE] as Promise<void>)
```

`GEA_ABORT_CONTROLLER` stores the `AbortController` instance using a symbol key, consistent with all other engine-internal state in this codebase (which uses `Symbol.for()`-keyed properties exclusively for internals).

Both symbols are automatically re-exported via the existing `export * from './lib/symbols'` wildcard in `index.ts` — no changes to `index.ts` are needed.

---

### 12.4 Backwards Compatibility

All changes are **fully backwards-compatible**:

| Change | Impact on existing consumers |
|--------|------------------------------|
| `GEA_CREATED_PROMISE` stored in constructor | Only set when `created()` returns a `Promise`. Components returning `void` are unaffected. |
| `abortSignal` getter added to `Component` | Purely additive. An `AbortController` is created per instance (one object allocation). Existing components that never use `async created()` have an unaborted controller that is discarded on `dispose()`. |
| `AbortController.abort()` in `dispose()` | No-op for components that never fetched. For existing async components managing their own controllers, abort-on-dispose is correct and expected behavior. |
| `GEA_CREATED_PROMISE`, `GEA_ABORT_CONTROLLER` in `symbols.ts` | Purely additive. Symbol keys are collision-proof. |
| No `ComponentManager` changes | Zero risk. |

The public API surface of `@geajs/core` (`index.ts`) is unchanged except for two new exported symbols via the existing `export * from './lib/symbols'` wildcard, which is non-breaking by definition.

---

## 10. PR Checklist (to be done at the end)

- [ ] All phases in scope implemented
- [ ] Test coverage ≥ 90% (Phase 1–3)
- [ ] Benchmarks written and baseline documented
- [ ] Zero new runtime dependencies
- [ ] Changeset file created
- [ ] `PLAN.md` removed or moved to docs
- [ ] README for `@geajs/suspense` written
- [ ] Philosophy doc updated (remove "no suspense boundaries" from the list)
- [ ] PR description links to issue #63
