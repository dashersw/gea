# `@geajs/suspense` — Implementation Plan

> **Branch**: `feat/suspense`  
> **Issue**: [#63 — Suspense Component](https://github.com/dashersw/gea/issues/63)  
> **Author**: Recep Şen  
> **Date**: 2026-04-13  
> **Status**: Planning — awaiting answers to open questions before implementation begins

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

```
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
  - `Promise.all()` parallel resolution (anti-waterfall)
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
  - partial failure renders error for whole boundary

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

## 8. Open Questions (Need Answers Before Implementation)

> **Please answer these before we start coding.**

### Q1 — Phase Scope for This PR
**Should this PR cover all 6 phases, or ship incrementally?**

Options:
- A) All 6 phases in one PR (matches issue's full spec)
- B) Phase 1–3 now (core functionality), Phase 4–6 as follow-up PRs
- C) Phase 1–4 now (adds AbortController), Phase 5–6 follow-up

Recommendation: B or C — get working code merged faster, reduce review surface.

---

### Q2 — Package vs. Core Export
**Should `Suspense` also be re-exported from `@geajs/core` for convenience?**

Options:
- A) Only from `@geajs/suspense` (clean separation, no re-export)
- B) Re-export from `@geajs/core` as a convenience (risks coupling)
- C) `@geajs/core` gets a `/suspense` subpath export that re-exports from `@geajs/suspense`

Recommendation: A — separate package, import explicitly.

---

### Q3 — `async created()` Signal API
**How should AbortController signal be passed to the component lifecycle?**

Options:
- A) Parameter: `async created(signal: AbortSignal) { ... }` — explicit, standard
- B) Instance property: `this.abortSignal` — more "Gea-like" (class-based)
- C) Both: parameter for new code, property for compatibility

Context: This changes the `Component` base class signature. Option B is more consistent with how Gea components access things (`this.props`, `this.store`, etc.).

---

### Q4 — `staleWhileRefresh` — CSS vs Render Prop
**How should the "refreshing" state be communicated to users?**

Options:
- A) CSS class only: `suspense-refreshing` added to content wrapper
- B) Render prop: `refreshing={(children) => <div class="opacity-50">{children}</div>}`
- C) Both: CSS class by default, render prop as override

Recommendation: A (simpler, YAGNI) — can add render prop later without breaking changes.

---

### Q5 — Lazy Route Auto-Wrapping
**Should the router automatically wrap lazy routes in a Suspense boundary?**

Options:
- A) Opt-in via router config: `{ lazy: true, suspense: { fallback: <Spinner /> } }`
- B) Auto-wrap all lazy routes (breaking change — adds fallback where there was none)
- C) No router integration in this PR — document it as a pattern instead

Recommendation: A or C for Phase 1 PR. Auto-wrap can come in a dedicated router PR.

---

### Q6 — Trigger Scope
**Should all 6 Angular-inspired triggers be in scope for this PR?**

Options:
- A) All triggers (viewport, idle, interaction, hover, timer)
- B) Only `"immediate"` and `"viewport"` — the two highest-value triggers
- C) Only `"immediate"` for Phase 1, triggers as Phase 5

Recommendation: C — triggers are valuable but independent. Ship Phase 1 fast.

---

### Q7 — SSR Phase Scope
**Is Phase 6 (SSR integration) in scope for this PR?**

Options:
- A) Yes — full SSR integration in this PR
- B) No — `ssrStreamId` prop is defined in types but implementation is a TODO
- C) No — SSR phase is a completely separate PR

Recommendation: B or C — SSR integration requires coordination with `@geajs/ssr` and warrants its own review.

---

### Q8 — Build Tool
**`tsdown` (like `@geajs/core`) or `tsup` (like `@geajs/ssr`)?**

Options:
- A) `tsdown` — newer, same as core
- B) `tsup` — battle-tested, same as ssr

Recommendation: A (`tsdown`) for consistency with the newer packages.

---

### Q9 — Example App
**Should we add a dedicated example app for Suspense?**

Options:
- A) Yes — new `examples/suspense-demo/` app with kitchen-sink demo
- B) Add Suspense to an existing example (e.g., `examples/chat/`)
- C) No example app for Phase 1 — just tests

Recommendation: C for this PR, A as a follow-up.

---

### Q10 — Benchmark Expectations
**Are there specific performance budgets or regression gates?**

Options:
- A) Just write benchmarks, no hard limits
- B) Suspense overhead must be < X ms per boundary (define X)
- C) Add benchmarks to CI as regression gate

Recommendation: A for now — establish baseline, set gates in follow-up.

---

### Q11 — `minimumFallback` Default
**Issue proposes `minimumFallback: 300`. Should this be the default or opt-in?**

Options:
- A) Default `300ms` — avoids flash by default (Vue-like)
- B) Default `0ms` — explicit opt-in (React-like, simpler mental model)
- C) No default, required when `timeout` is set

Recommendation: Depends on philosophy alignment. B is safer for correctness, A is better UX.

---

### Q12 — Nested Suspense Boundary Behavior
**When a child is itself wrapped in a Suspense, does the parent Suspense wait for it?**

Options:
- A) Fully independent — inner resolves without affecting outer (issue proposes this)
- B) Outer waits for inner too — simpler mental model, matches React's old behavior
- C) Configurable via `isolate` prop

Recommendation: A — per the issue's explicit design, fully independent boundaries.

---

### Q13 — `partial failure` behavior
**If 3 out of 5 children resolve but 2 fail, what does the Suspense show?**

Options:
- A) Error state for the whole boundary (all-or-nothing)
- B) Show resolved children, show error only for failed children (partial render)
- C) Configurable via `failureMode` prop

Recommendation: A for Phase 1 (simpler), B can come later.

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
| Promise strategy | `Promise.all()` | Parallel, anti-waterfall |
| Error + Suspense | Same component | One `error` prop, no separate ErrorBoundary |
| Race conditions | Generation counter | Monotonic ID, stale responses discarded |

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
