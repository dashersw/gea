# Philosophy

## JavaScript Should Be Simple

Gea is built on a straightforward conviction: JavaScript code should be simple, readable, and understandable. If someone who knows JavaScript reads your component, they should understand it immediately — without needing to learn a framework-specific vocabulary, memorize special rules, or decode unfamiliar primitives.

Most modern frameworks introduce new programming concepts. React has hooks with rules about call order and dependency arrays. Vue has `ref()` vs `reactive()` with `.value` unwrapping. Solid has signals and createEffect. Svelte has `$state` runes. Each of these is a new abstraction layered on top of JavaScript, with its own mental model, its own gotchas, and its own learning curve.

Gea takes a different path. It introduces no new concepts at all.

## Object-Oriented and Functional, in the Right Mix

Gea uses the natural building blocks of the language:

- **Stores** are classes with reactive properties and methods that mutate them. This is standard object-oriented design — encapsulated state with a clear public interface.
- **Class components** extend `Component` and implement a `template()` method. They can have local state, lifecycle hooks, and helper methods. Nothing here is new — it's inheritance, methods, and properties.
- **Function components** are plain functions that receive props and return JSX. This is pure functional style — data in, markup out.
- **Computed values** are getters on store classes. No `computed()` wrapper, no memoization primitive — just the `get` keyword that JavaScript already provides.
- **Lists** use `.map()`. Conditionals use `&&` and ternary. Event handlers are functions. Props are destructured parameters.

Every pattern in Gea maps directly to a JavaScript concept you already know. The framework doesn't ask you to think in a new way — it asks you to think in JavaScript.

## The Magic Is Invisible

The only "magic" in Gea is the part you never see. The Vite plugin analyzes your ordinary JavaScript at compile time and generates the reactive wiring:

- It reads your `template()` method, finds every state path your JSX references, and generates `observe()` calls that surgically update only the DOM nodes bound to those paths.
- It converts function components to class components.
- It transforms JSX into HTML strings and compiles event handlers into a delegation map.
- It sets up hot module replacement.

None of this appears in your source code. You write a class with properties and a template. You mutate state directly — `this.count++` — and the DOM updates. There is no setter to call, no signal to create, no dependency array to maintain. The compile step takes care of everything, and at runtime you have clean, readable, object-oriented code that just works.

## No Arbitrary Rules

Frameworks often come with rules that have no analog in the language itself:

- "Hooks must be called at the top level, in the same order, on every render."
- "Don't forget to include all dependencies in the dependency array."
- "Use `.value` to access a ref's current value."
- "Don't mutate state directly — always return a new reference."

Gea has none of this. Mutate state directly — the proxy tracks it. Use getters — they re-evaluate automatically. Write classes — they work as classes should. Write functions — they receive arguments and return values. Pass an object to a child component — the child can mutate it and the parent sees the change, because it's the same object. Pass a number — the child reads the parent's current value through a live, read-only prop. The framework does not impose rules that exist only because of its own internal machinery.

## What This Means in Practice

A Gea codebase reads like plain JavaScript with JSX. A new team member who has never used Gea can read a store and immediately understand it — it's a class with state and methods. They can read a component and immediately understand it — it's a class with a `template()` that returns markup. There is no framework-specific ceremony to learn before being productive.

## Props Follow JavaScript Semantics

One area where most frameworks diverge from the language is data flow between components. React enforces one-way data flow for everything — even objects — requiring callback props to communicate changes upward. Vue introduces `emit`, `v-model`, and `defineModel` as framework-level concepts for two-way binding. Both add abstractions on top of something JavaScript already handles natively.

In JavaScript, primitives are passed by value and objects are passed by reference. If you pass an object to a function and that function mutates it, the caller sees the change. If you pass a number, the function gets a copy.

Gea applies this same principle to component props:

- **Objects and arrays** passed as props are the parent's actual reactive proxy. The child can mutate them directly, and every component observing that data — parent, siblings, grandparents — updates automatically.
- **Primitives** passed as props are live, read-only values from the parent. A child that needs to modify one should copy it into local component state.

There is no `emit`, no `defineModel`, no callback wiring for object mutations. The framework respects JavaScript's native value semantics. If you understand how function arguments work in JavaScript, you already understand how Gea's props work.

## What This Means in Practice

This is a deliberate trade-off. Gea offers fewer abstractions than React or Vue. It doesn't have hooks, context providers, portals, suspense boundaries, or server components. What it offers instead is clarity: the code you write is the code that runs, and it looks like the JavaScript you already know.
