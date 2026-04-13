---
layout: home

hero:
  name: Gea
  text: Compiler-First Reactive UI
  tagline: Write ordinary JavaScript. Gea compiles the framework out of the hot path. No virtual DOM, no hooks, no signals — just your code, wired at build time.
  image:
    src: /logo.jpg
    alt: Gea
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/dashersw/gea

features:
  - title: Zero Concepts
    details: No signals, hooks, dependency arrays, or compiler directives. Stores are classes. Components are classes or functions. Computed values are getters.
  - title: Compile-Time Reactivity
    details: The Vite plugin analyzes JSX at build time and generates surgical DOM patches — no virtual DOM, no diffing, no runtime overhead.
  - title: "121 B To Say Hello"
    details: A compiled hello-world app is 121 B brotli; an interactive todo app is 4.9 kb brotli JS. Add routing when you need it; hello world with routing is ~7.3 kb gzipped.
  - title: Proxy-Based Stores
    details: State lives in ordinary classes wrapped by a deep Proxy. Mutate properties directly — array methods, nested objects, everything just works.
  - title: JS-Native Props
    details: "Objects and arrays passed as props are the parent's reactive proxy — child mutations update the parent automatically. Primitives are copies. No emit, no v-model — just JavaScript semantics."
  - title: Tree-Shaken Router
    details: Client-side RouterView, Link, route params, wildcards, and programmatic navigation. Import routing when you need it; leave it out when you don't.
  - title: Accessible UI Primitives
    details: "@geajs/ui builds on Zag.js to provide headless, accessible components — dialogs, menus, tooltips, accordions, and more — ready to style and compose."
  - title: Full Toolkit
    details: Mobile UI primitives, VS Code extension, project scaffolder, and HMR support. Everything you need, nothing you don't.
---

## Gea Can Compile To Almost Nothing

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

Hello world proves the compiler can disappear. Todo proves the runtime stays lean when the app actually does something.

In an equivalent interactive todo app with reactive state, input handling, filtering, item updates, and identical CSS, Gea ships **4.9 kb** of brotli JavaScript. Solid ships 5.7 kb, Svelte ships 13.7 kb, Vue ships 22.6 kb, and React ships 51.5 kb.

| Framework | Version | Minified JS raw | Minified JS brotli | Total raw JS+CSS | Total brotli JS+CSS |
| --- | --- | ---: | ---: | ---: | ---: |
| Gea | 1.3.0 | 15,265 B | **4,850 B** | 17,976 B | **5,607 B** |
| Solid | 1.9.12 | 16,181 B | 5,721 B | 18,892 B | 6,485 B |
| Svelte | 5.55.5 | 38,812 B | 13,661 B | 41,523 B | 14,429 B |
| Vue | 3.5.33 | 63,676 B | 22,585 B | 66,387 B | 23,411 B |
| React | 19.2.5 / React DOM 19.2.5 | 192,330 B | 51,460 B | 195,041 B | 52,287 B |

Measured from fresh Vite production builds in `/tmp/gea-todo-framework-size-compare`. CSS was identical across all builds: 2,711 B raw, 746 B brotli.
