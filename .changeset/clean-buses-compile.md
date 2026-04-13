---
"@geajs/core": minor
"@geajs/vite-plugin": minor
"create-gea": patch
---

Rewrite Gea internals for a compiler-first, tree-shakable runtime with much smaller production bundles and faster targeted updates.

### @geajs/core

- Replaces the legacy `src/lib` runtime with focused runtime modules for components, stores, keyed lists, conditionals, bindings, event delegation, router, and SSR exports
- Adds compiler runtime exports so generated code can import only the DOM patching and reactivity helpers it needs
- Moves JSX runtime output under `dist`, adds the `./compiler-runtime` and `./ssr` package exports, and keeps router APIs available from the main package
- Reworks store batching, path observation, array derivation, keyed list patching, and nullish/reactive value handling with expanded runtime coverage
- Updates package docs around the new bundle profile: 121 B brotli hello world and 4.9 kB brotli interactive todo JavaScript

### @geajs/vite-plugin

- Adds the `closure-codegen` pipeline with focused emitters, generators, transforms, static root mounting, observe-path rewriting, and direct import generation
- Adds keyed-list codegen for simple lists, prop-driven lists, relational classes, shared handlers, patch scans, and list rescue paths
- Replaces the older analyzer/codegen stack with compiler output that can compile static components toward near-zero runtime and import only the helpers each component needs
- Updates browser, playground, and CodeMirror bundles so the website playground uses the same compiler/runtime path as the published plugin
- Expands compiler and runtime regression coverage for events, conditionals, mapped lists, third-party DOM subtrees, HMR, input bindings, and generated static roots

### create-gea

- Fixes the starter template TypeScript setup by removing the monorepo-only `gea-env.d.ts` include path
