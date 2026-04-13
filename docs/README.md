# Gea

A compiler-first reactive JavaScript UI framework.

Gea compiles JSX into efficient HTML string templates at build time, tracks state changes through deep proxies, and patches only the DOM nodes that depend on changed data. No virtual DOM, no diffing, no reconciliation overhead.

The runtime and the compiler are vertically integrated, and Gea is truly the first magically disappearing framework. A compiled hello-world app is 121 B brotli; an equivalent interactive todo ships 4.9 kb of brotli JavaScript.

## Compile To Almost Nothing

In a fresh Vite production hello-world build, Gea ships **121 B** of brotli JavaScript. The equivalent Solid build ships 3.6 kb, Svelte ships 8.5 kb, Vue ships 20.7 kb, and React ships 50.8 kb.

| Framework | Version | Raw minified JS | Brotli JS | Brotli vs Gea |
| --- | --- | ---: | ---: | ---: |
| Gea | 1.3.0 | 214 B | **121 B** | 1.0x |
| Solid | 1.9.12 | 10,196 B | 3,601 B | 29.8x |
| Svelte | 5.55.5 | 23,461 B | 8,537 B | 70.6x |
| Vue | 3.5.33 | 58,174 B | 20,711 B | 171.2x |
| React | 19.2.5 / React DOM 19.2.5 | 189,717 B | 50,816 B | 420.0x |

Measured from fresh Vite 8.0.10 production apps, summing JavaScript assets only. Gea used the compiled component output; React, Vue, and Svelte used equivalent minimal hello-world components.

## Stays Lean When The App Does Work

Hello world proves the runtime can disappear. Todo proves the runtime stays lean when the app actually does something.

In an equivalent interactive todo app with reactive state, input handling, filtering, item updates, and identical CSS, Gea ships **4.9 kb** of brotli JavaScript. Solid ships 5.7 kb, Svelte ships 13.7 kb, Vue ships 22.6 kb, and React ships 51.5 kb.

| Framework | Version | Minified JS raw | Minified JS brotli | Total raw JS+CSS | Total brotli JS+CSS |
| --- | --- | ---: | ---: | ---: | ---: |
| Gea | 1.3.0 | 15,265 B | **4,850 B** | 17,976 B | **5,607 B** |
| Solid | 1.9.12 | 16,181 B | 5,721 B | 18,892 B | 6,485 B |
| Svelte | 5.55.5 | 38,812 B | 13,661 B | 41,523 B | 14,429 B |
| Vue | 3.5.33 | 63,676 B | 22,585 B | 66,387 B | 23,411 B |
| React | 19.2.5 / React DOM 19.2.5 | 192,330 B | 51,460 B | 195,041 B | 52,287 B |

Measured from fresh Vite production builds in `/tmp/gea-todo-framework-size-compare`. CSS was identical across all builds: 2,711 B raw, 746 B brotli.

## Philosophy

JavaScript code should be simple and understandable. Gea doesn't introduce new programming concepts — no signals, no hooks, no dependency arrays, no compiler directives. You write regular, idiomatic JavaScript: classes with state and methods, functions that receive props and return markup, getters for computed values. The framework makes it reactive under the hood.

Gea strikes the right balance of object-oriented and functional style. Stores are classes. Components are classes or functions. Computed values are getters. Lists use `.map()`. Conditionals use `&&` and ternary. Everything is standard JavaScript that any developer can read and understand without learning a framework-specific vocabulary.

The "magic" is invisible and lives entirely in the build step. The Vite plugin analyzes your ordinary code at compile time, determines which DOM nodes depend on which state paths, and generates the reactive wiring. At runtime, there is nothing unfamiliar — just clean, readable code.

## Key Features

- **Near-zero baseline** — a compiled hello-world app is 121 B brotli; an equivalent interactive todo is 4.9 kb brotli JS
- **Tree-shaken routing** — router APIs are built in, but a no-router app does not pay for them; hello world with routing is ~7.3 kb gzipped
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
| [`@geajs/ui`](https://www.npmjs.com/package/@geajs/ui) | Headless UI primitives — accessible components built on [Zag.js](https://zagjs.com) |
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
