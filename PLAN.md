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
