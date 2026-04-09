---
layout: home

hero:
  name: Gea
  text: Lightweight Reactive UI Framework
  tagline: Write ordinary JavaScript. Get reactivity for free. No virtual DOM, no hooks, no signals — just your code, made reactive at compile time.
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
  - title: "~19 kb Batteries Included"
    details: State management and routing are built in — ~19 kb gzipped with the router, ~15 kb without. Zero runtime dependencies, zero decision fatigue.
  - title: Proxy-Based Stores
    details: State lives in ordinary classes wrapped by a deep Proxy. Mutate properties directly — array methods, nested objects, everything just works.
  - title: JS-Native Props
    details: "Objects and arrays passed as props are the parent's reactive proxy — child mutations update the parent automatically. Primitives are copies. No emit, no v-model — just JavaScript semantics."
  - title: Built-In Router
    details: Client-side RouterView, Link, route params, wildcards, and programmatic navigation. No extra packages needed.
  - title: Accessible UI Primitives
    details: "@geajs/ui builds on Zag.js to provide headless, accessible components — dialogs, menus, tooltips, accordions, and more — ready to style and compose."
  - title: Full Toolkit
    details: Mobile UI primitives, VS Code extension, project scaffolder, and HMR support. Everything you need, nothing you don't.
---
