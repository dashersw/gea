<img src="https://raw.githubusercontent.com/dashersw/gea/master/docs/public/logo.jpg" height="180" alt="Gea" />

[![npm version](https://badge.fury.io/js/%40geajs%2Fcore.svg)](https://www.npmjs.com/package/@geajs/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

# Gea

A batteries-included, reactive JavaScript UI framework. No virtual DOM. Compile-time JSX transforms. Proxy-based stores. Surgical DOM patching. Built-in state management and routing. ~19 kb gzipped with the router, ~15 kb without.

Gea compiles your JSX into efficient HTML string templates at build time, tracks state changes through deep proxies, and patches only the DOM nodes that actually depend on the changed data — no diffing, no reconciliation overhead.

```jsx
// counter-store.ts
import { Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0
  increment() { this.count++ }
  decrement() { this.count-- }
}

export default new CounterStore()
```

```jsx
// app.tsx
import { Component } from '@geajs/core'
import counterStore from './counter-store'

export default class App extends Component {
  template() {
    return (
      <div>
        <h1>{counterStore.count}</h1>
        <button click={counterStore.increment}>+</button>
        <button click={counterStore.decrement}>-</button>
      </div>
    )
  }
}
```

```ts
// main.ts
import App from './app'

new App().render(document.getElementById('app'))
```

## Getting Started

```bash
npm create gea@latest my-app
cd my-app
npm install
npm run dev
```

This scaffolds a Vite-powered project with TypeScript, a sample store, class and function components, and hot module replacement — ready to build on.

## Packages

| Package | Description | Version |
| --- | --- | --- |
| [`@geajs/core`](packages/gea) | Core framework — stores, components, reactivity, DOM patching | [![npm](https://img.shields.io/npm/v/@geajs/core.svg)](https://www.npmjs.com/package/@geajs/core) |
| [`@geajs/ui`](packages/gea-ui) | Headless UI primitives — accessible, composable components built on [Zag.js](https://zagjs.com) | [![npm](https://img.shields.io/npm/v/@geajs/ui.svg)](https://www.npmjs.com/package/@geajs/ui) |
| [`@geajs/mobile`](packages/gea-mobile) | Mobile UI primitives — views, navigation, gestures, layout | [![npm](https://img.shields.io/npm/v/@geajs/mobile.svg)](https://www.npmjs.com/package/@geajs/mobile) |
| [`@geajs/ssr`](packages/gea-ssr) | Server-side rendering — streaming HTML, hydration, store isolation | [![npm](https://img.shields.io/npm/v/@geajs/ssr.svg)](https://www.npmjs.com/package/@geajs/ssr) |
| [`@geajs/vite-plugin`](packages/vite-plugin-gea) | Vite plugin — JSX transform, reactivity wiring, HMR | [![npm](https://img.shields.io/npm/v/@geajs/vite-plugin.svg)](https://www.npmjs.com/package/@geajs/vite-plugin) |
| [`create-gea`](packages/create-gea) | Project scaffolder — `npm create gea@latest` | [![npm](https://img.shields.io/npm/v/create-gea.svg)](https://www.npmjs.com/package/create-gea) |
| [`gea-tools`](packages/gea-tools) | VS Code / Cursor extension — completions, hover, diagnostics | — |

## Philosophy

JavaScript code should be simple and understandable. Gea is built on the belief that a framework should not force you to learn a new programming model. You shouldn't need signals, dependency arrays, compiler directives, or framework-specific primitives to build a reactive UI. You should write regular JavaScript — classes, functions, objects, getters — and it should just work.

Gea finds the right mix of object-oriented and functional style. Stores are classes with state and methods. Components are classes with a `template()` that returns JSX. Function components are true plain functions with **no side-effects**. Computed values are getters. There is nothing to learn that isn't already JavaScript.

The only "magic" is under the hood: the Vite plugin analyzes your ordinary code at compile time and wires up the reactivity for you. You write `this.count++` and the DOM updates. You don't call a setter, you don't wrap values in a signal, and you don't declare dependencies. The framework stays invisible.

Gea is built on the philosophy of the beautifully simple [erste.js](https://github.com/dashersw/erste) and [regie](https://github.com/dashersw/regie) libraries, carrying forward their core ideas — minimal abstraction, class-based components, and direct DOM ownership — while adding compile-time JSX transforms, deep proxy reactivity, and a modern build toolchain.

## Why Gea?

- **Just JavaScript.** No signals, no hooks, no dependency arrays, no new syntax. Classes, functions, objects, and getters — concepts you already know.
- **No virtual DOM.** The Vite plugin analyzes your JSX at build time and generates targeted DOM patches. Updates touch only the elements that changed.
- **Proxy-based reactivity.** Mutate state directly — `this.count++` — and the framework handles the rest. The compile-time analysis makes your regular JS fully reactive without you conforming to arbitrary rules.
- **Batteries included.** State management and routing are built in — no decision fatigue, no extra packages. Gea ships a default solution for the biggest pain points of modern frontend development.
- **Tiny footprint.** ~19 kb gzipped with the full router, ~15 kb without. Zero runtime dependencies.
- **Familiar JSX.** Write JSX with `class` instead of `className` and lowercase event attributes (`click`, `input`, `change`) instead of `onClick`.
- **Props that follow JavaScript.** Objects and arrays passed as props are the parent's reactive proxy — the child can mutate them and both update. Primitives are copies, just like function arguments in JS. No `emit`, no `v-model`, no callback wiring.
- **Class and function components.** Use class components for stateful logic and lifecycle hooks, function components for presentational UI. The Vite plugin converts function components to classes at build time.
- **Accessible UI primitives.** The `@geajs/ui` package builds on [Zag.js](https://zagjs.com) to provide robust, accessible components — dialogs, menus, tooltips, accordions, and more — ready to style and compose in any Gea app.
- **Built-in mobile UI.** The `@geajs/mobile` package provides view management, iOS-style navigation transitions, back gestures, sidebars, tabs, pull-to-refresh, and infinite scroll.

## How It Compares

Gea is the fastest compiled UI framework — closer to hand-written vanilla JavaScript than any other framework in the js-framework-benchmark (weighted geometric mean: **1.03**). It gives you reactive state management, a component model, routing, and JSX — without the weight of a virtual DOM or a large runtime. And unlike React and Vue, you don't need to pick separate packages for state management and routing — they're built in.

| | Gea | React | Vue |
| --- | --- | --- | --- |
| Bundle size (min+gz) | **~19 kb** | ~74 kb | ~35 kb |
| What's included | Rendering + state + routing | + React Router + Zustand | + Vue Router + Pinia |
| Virtual DOM | No | Yes | Yes |
| Reactivity | Proxy-based, automatic | Explicit (`setState`, hooks) | Proxy-based (`ref`/`reactive`) |
| JSX classes | `class` | `className` | `class` (templates) |
| Event syntax | `click={fn}` | `onClick={fn}` | `@click="fn"` (templates) |
| Props (objects/arrays) | Two-way (same proxy) | One-way (callbacks up) | One-way (`emit`/`v-model` up) |

See the full comparisons: [React vs Gea](docs/comparison/react-vs-gea.md) | [Vue vs Gea](docs/comparison/vue-vs-gea.md) | [Full benchmark report](https://geajs.com/benchmark-report.html)

## Examples

| Example | Description |
| --- | --- |
| [flight-checkin](examples/flight-checkin) | Multi-step check-in flow with multiple stores, conditional views, and E2E tests |
| [todo](examples/todo) | Classic todo app demonstrating lists, filtering, and computed values |
| [router-v2](examples/router-v2) | Client-side routing with `RouterView`, `Link`, guards, layouts, and dynamic params |
| [kanban](examples/kanban) | Kanban board with drag semantics |
| [mobile-showcase](examples/mobile-showcase) | Mobile UI showcase using `@geajs/mobile` components |
| [jira_clone](examples/jira_clone) | Jira-style issue tracker with rich text, tabs, and `@geajs/ui` |
| [ecommerce](examples/ecommerce) | E-commerce storefront with cart and checkout flow |
| [sheet-editor](examples/sheet-editor) | Spreadsheet-style editor with formula-like cells |
| [showcase](examples/showcase) | Component and pattern showcase |

## Documentation

Full documentation is available in the [docs](docs/) directory, covering:

- [Getting Started](docs/getting-started.md)
- [Stores](docs/core-concepts/stores.md) and [Components](docs/core-concepts/components.md)
- [JSX Syntax](docs/core-concepts/jsx-syntax.md)
- [Router](docs/gea-router/overview.md)
- [Gea UI](docs/gea-ui/overview.md)
- [Gea Mobile](docs/gea-mobile/overview.md)
- [API Reference](docs/api-reference.md)

## AI-Assisted Development

Install the Gea AI skills with:

```sh
npx skills add dashersw/gea
```

This repository includes [agent skills](.cursor/skills/gea-framework) that teach AI coding assistants how to work with Gea. In compatible environments, this gives your editor the context it needs to understand Gea's stores, components, JSX conventions, and reactivity model so you can scaffold and iterate on Gea apps with much better AI assistance.

## Contributing

Contributions are welcome. The repo is a standard npm workspaces monorepo:

```bash
git clone https://github.com/dashersw/gea.git
cd gea
npm install
npm run build
```

Each package has its own `build` script. The root `npm run build` builds all packages.

## License

[MIT](LICENSE) — Copyright (c) 2017-present Armagan Amcalar

## Star History

<a href="https://www.star-history.com/?repos=dashersw%2Fgea&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=dashersw/gea&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=dashersw/gea&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=dashersw/gea&type=date&legend=top-left" />
 </picture>
</a>
