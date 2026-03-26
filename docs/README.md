# Gea

A lightweight, reactive JavaScript UI framework.

Gea compiles JSX into efficient HTML string templates at build time, tracks state changes through deep proxies, and patches only the DOM nodes that depend on changed data. No virtual DOM, no diffing, no reconciliation overhead.

## Philosophy

JavaScript code should be simple and understandable. Gea doesn't introduce new programming concepts — no signals, no hooks, no dependency arrays, no compiler directives. You write regular, idiomatic JavaScript: classes with state and methods, functions that receive props and return markup, getters for computed values. The framework makes it reactive under the hood.

Gea strikes the right balance of object-oriented and functional style. Stores are classes. Components are classes or functions. Computed values are getters. Lists use `.map()`. Conditionals use `&&` and ternary. Everything is standard JavaScript that any developer can read and understand without learning a framework-specific vocabulary.

The "magic" is invisible and lives entirely in the build step. The Vite plugin analyzes your ordinary code at compile time, determines which DOM nodes depend on which state paths, and generates the reactive wiring. At runtime, there is nothing unfamiliar — just clean, readable code.

## Key Features

- **Batteries included** — state management and routing are built in, solving the biggest pain points of modern frontend development out of the box
- **~13 kb gzipped** with the router, ~10 kb without — zero runtime dependencies
- **Compile-time JSX** — the Vite plugin transforms JSX into HTML strings and generates targeted DOM patches
- **Proxy-based reactivity** — mutate state directly and the framework handles updates automatically
- **Class and function components** — use classes for stateful logic, functions for presentational UI
- **JS-native props** — objects and arrays passed as props are the parent's reactive proxy; child mutations update both. Primitives are copies. No `emit`, no `v-model`.
- **Event delegation** — a single global listener per event type, not per element
- **Mobile UI primitives** — optional `@geajs/mobile` package with views, navigation, gestures, and more

## Packages

| Package | Description |
| --- | --- |
| [`@geajs/core`](https://www.npmjs.com/package/@geajs/core) | Core framework — stores, components, reactivity, DOM patching |
| [`@geajs/mobile`](https://www.npmjs.com/package/@geajs/mobile) | Mobile UI primitives — views, navigation, gestures, layout |
| [`@geajs/ssr`](ssr.md) | Server-side rendering — streaming HTML, hydration, head management |
| [`@geajs/vite-plugin`](https://www.npmjs.com/package/@geajs/vite-plugin) | Vite plugin — JSX transform, reactivity wiring, HMR |
| [`create-gea`](https://www.npmjs.com/package/create-gea) | Project scaffolder |
| [`gea-tools`](https://github.com/dashersw/gea/tree/master/packages/gea-tools) | VS Code / Cursor extension |

## Quick Example

```jsx
import { Component } from '@geajs/core'
import counterStore from './counter-store'

export default class Counter extends Component {
  template() {
    return (
      <div>
        <span>{counterStore.count}</span>
        <button click={counterStore.increment}>+</button>
      </div>
    )
  }
}
```

Read on to learn how to set up a project and build your first app.
