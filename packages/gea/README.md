<img src="https://raw.githubusercontent.com/dashersw/gea/master/docs/public/logo.jpg" height="180" alt="Gea" />

[![npm version](https://badge.fury.io/js/%40geajs%2Fcore.svg)](https://www.npmjs.com/package/@geajs/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/dashersw/gea/blob/master/LICENSE)

# Gea

A compiler-first reactive JavaScript UI framework with compile-time JSX and proxy-based stores. No virtual DOM — the Vite plugin analyzes your JSX at build time and generates surgical DOM patches that update only what changed. A hello-world production build is 121 B brotli; an equivalent interactive todo ships 4.9 kb of brotli JavaScript.

Svelte made "compile the framework away" famous. Gea takes the phrase literally: in a static hello-world app, the framework runtime disappears from the bundle.

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

## Philosophy

Gea's guiding principle is that JavaScript code should be simple and understandable. A framework should not invent new programming concepts or expect you to conform to arbitrary rules. You write regular, idiomatic JavaScript — classes with state and methods, functions that return markup, getters for derived values — and Gea makes it reactive under the hood.

There are no signals, no hooks, no dependency arrays, no compiler directives, and no framework-specific primitives. The only concept Gea introduces is the `Store` class, which is just an ordinary class whose properties happen to be observed by a proxy. Everything else — class inheritance, method calls, property access, `Array.map`, ternary expressions — is standard JavaScript you already know.

The "magic" lives entirely in the build step. The Vite plugin analyzes your code at compile time, figures out which DOM nodes depend on which state, and generates the wiring. At runtime, you get clean, readable, object-oriented code that just works.

## Performance

Gea is the fastest compiled UI framework — benchmarked with the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) suite, the industry-standard stress test covering row creation, updates, swaps, selection, and deletion on large tables.

| Framework | Weighted geometric mean |
| --- | --- |
| vanillajs | 1.00 |
| **Gea 1.3** | **1.02** |
| Solid 1.9 | 1.10 |
| Svelte 5 | 1.10 |
| Vue 3.6 | 1.22 |
| React 19.2 | 1.43 |

Lower is better (1.00 = fastest). Gea outperforms every compiled framework while requiring zero framework-specific concepts — no signals, no hooks, no compiler directives. It's not just the DX — it's the fastest, too. [Full benchmark report](https://geajs.com/benchmark-report.html)

## Quick Start

```bash
npm create gea@latest my-app
cd my-app
npm install
npm run dev
```

Or add Gea to an existing Vite project:

```bash
npm install @geajs/core @geajs/vite-plugin
```

```js
// vite.config.ts
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'

export default defineConfig({
  plugins: [geaPlugin()]
})
```

## TypeScript

Gea provides full JSX type-checking via TypeScript's `jsxImportSource`. Add this to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@geajs/core"
  }
}
```

This gives you prop autocompletion, type errors on invalid attributes, and hover types in any TypeScript-aware editor — VS Code, Cursor, Vim, Zed — without framework-specific plugins.

Use `declare props` on class components for typed props:

```tsx
export default class UserCard extends Component {
  declare props: { name: string; email: string; onSelect?: () => void }

  template({ name, email, onSelect }: this['props']) {
    return (
      <div class="user-card" click={onSelect}>
        <span>{name}</span>
        <span>{email}</span>
      </div>
    )
  }
}
```

`declare props` defines the accepted JSX attributes — no JavaScript emitted. `: this['props']` on the `template()` parameter is optional but recommended — it types the destructured variables inside the method for full end-to-end type safety.

## Core Concepts

### Stores

A Store holds shared application state. Extend `Store`, declare reactive properties as class fields, add methods that mutate them, and export a singleton instance. The store instance is wrapped in a deep `Proxy` that tracks every mutation and batches notifications via `queueMicrotask`.

```ts
import { Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0

  increment() { this.count++ }
  decrement() { this.count-- }
}

export default new CounterStore()
```

Mutate state directly — the proxy handles reactivity automatically. Array methods (`push`, `pop`, `splice`, `sort`, `reverse`, `shift`, `unshift`) are intercepted to produce fine-grained change events like `append`, `reorder`, and `swap`.

### Class Components

Extend `Component` and implement a `template()` method that returns JSX. Class components inherit from `Store`, so they have their own reactive properties — use them when you need local, transient UI state that no other component cares about.

```jsx
import { Component } from '@geajs/core'

export default class Counter extends Component {
  count = 0

  increment() { this.count++ }
  decrement() { this.count-- }

  template() {
    return (
      <div class="counter">
        <span>{this.count}</span>
        <button click={this.increment}>+</button>
        <button click={this.decrement}>-</button>
      </div>
    )
  }
}
```

Event handlers accept both method references (`click={this.increment}`) and arrow functions (`click={() => this.increment()}`). The compiler wires both forms to the component's event delegation system. Use method references for simple forwarding; use arrow functions when you need to pass arguments or compose logic.

Use class components when you need local state or lifecycle hooks.

### Function Components

Export a default function that receives props and returns JSX. The Vite plugin converts it to a class component at build time.

```jsx
export default function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>
}
```

Use function components for stateless, presentational UI.

### Props and Data Flow

Gea's props follow standard JavaScript semantics — no framework-invented concepts like `v-model`, `emit`, or callback-based state lifting. When a parent passes data to a child component, it works exactly like passing arguments to a function in JavaScript:

- **Primitives** (numbers, strings, booleans) are passed **by value**. The child receives a copy. Reassigning the prop in the child does not affect the parent — just like reassigning a function parameter in plain JS.
- **Objects and arrays** are passed **by reference**. The child receives the same proxy the parent holds. Mutating the object or array in the child updates the parent's state and DOM automatically — because it's the same object.

```jsx
// parent.tsx
import { Component } from '@geajs/core'

export default class Parent extends Component {
  count = 0
  user = { name: 'Alice', age: 30 }
  items = ['a', 'b']

  template() {
    return (
      <div>
        <span>{this.count}</span>
        <span>{this.user.name}</span>
        <span>{this.items.length} items</span>
        <Child count={this.count} user={this.user} items={this.items} />
      </div>
    )
  }
}
```

```jsx
// child.tsx
export default function Child({ count, user, items }) {
  return (
    <div>
      <span>{count}</span>
      <span>{user.name}</span>
      <span>{items.length} items</span>
    </div>
  )
}
```

In this setup:

- `user.name = 'Bob'` in the child updates both parent and child DOM — it's the same reactive proxy.
- `items.push('c')` in the child updates both — same array reference.
- `count = 99` in the child updates only the child's DOM — the parent still holds the original value.

This is exactly how JavaScript works. There is no `emit`, no `defineModel`, no callback wiring for object/array mutations. The framework doesn't add a layer of indirection — it respects the language's native pass-by-value and pass-by-reference semantics.

For deep nesting (grandchild, great-grandchild, etc.), the same rules apply. As long as the same object reference is passed down, any descendant can mutate it and the change propagates up to every ancestor that observes it — because they all share the same proxy.

### Passing components as props

Pass components as props to build layouts with multiple named regions — the same idea other frameworks call "named slots," without a separate API.

```jsx
// Parent passes components as named props
<Layout header={<Title />} sidebar={<Nav />} main={<Content />} />

// Layout renders each region wherever it wants
export default class Layout extends Component {
  template({ header, sidebar, main }) {
    return (
      <div class="layout">
        <aside>{sidebar}</aside>
        <main>{main}</main>
        <header>{header}</header>
      </div>
    )
  }
}
```

For a **single** default region, nest content inside the component tags and read `children` in the child:

```jsx
// Parent nests content between opening and closing tags
<Card>
  <h2>Title</h2>
  <p>Body text goes here.</p>
</Card>

// Card renders whatever was nested inside it
export default class Card extends Component {
  template({ children }) {
    return <div class="card">{children}</div>
  }
}
```

### Computed Values

Use getters on stores for derived state. They re-evaluate on every access — the Vite plugin tracks which state paths the template reads and triggers updates when those paths change.

```ts
class TodoStore extends Store {
  todos = []
  filter = 'all'

  get filteredTodos() {
    const { todos, filter } = this
    if (filter === 'active') return todos.filter(t => !t.done)
    if (filter === 'completed') return todos.filter(t => t.done)
    return todos
  }

  get activeCount() {
    return this.todos.filter(t => !t.done).length
  }
}
```

## JSX Syntax

Gea JSX is close to HTML. Key differences from React:

| Feature | Gea | React |
| --- | --- | --- |
| CSS classes | `class="foo"` | `className="foo"` |
| Event handlers | `click={fn}` or `onClick={fn}` | `onClick={fn}` |
| Input events | `input={fn}` or `onInput={fn}` | `onChange={fn}` |
| Keyboard events | `keydown={fn}` or `onKeyDown={fn}` | `onKeyDown={fn}` |

Both native-style (`click`, `change`) and React-style (`onClick`, `onChange`) event attribute names are supported.

Supported event attributes: `click`, `dblclick`, `input`, `change`, `keydown`, `keyup`, `blur`, `focus`, `mousedown`, `mouseup`, `submit`, `dragstart`, `dragend`, `dragover`, `dragleave`, `drop`.

With `@geajs/mobile`: `tap`, `longTap`, `swipeRight`, `swipeUp`, `swipeLeft`, `swipeDown`.

### Conditional Rendering

```jsx
{step === 1 && <StepOne />}
{!done ? <Form /> : <Success />}
```

### List Rendering

```jsx
<ul>
  {todos.map(todo => (
    <TodoItem key={todo.id} todo={todo} onToggle={() => store.toggle(todo.id)} />
  ))}
</ul>
```

Always provide a `key` prop. Gea uses it for efficient list diffing — handling adds, deletes, reorders, and swaps without re-rendering the entire list.

## Lifecycle

| Method | When called |
| --- | --- |
| `created(props)` | After constructor, before render |
| `onAfterRender()` | After DOM insertion and child mounting |
| `onAfterRenderAsync()` | Next `requestAnimationFrame` after render |
| `dispose()` | Removes from DOM, cleans up observers and children |

## DOM Helpers

| Method | Description |
| --- | --- |
| `$(selector)` | First matching descendant (scoped `querySelector`) |
| `$$(selector)` | All matching descendants (scoped `querySelectorAll`) |

## Rendering

```ts
import App from './app'

const app = new App()
app.render(document.getElementById('app'))
```

Components render once. Subsequent state changes trigger surgical DOM patches — not full re-renders.

## Router

Gea includes a built-in client-side router for single-page applications.

Router APIs are part of the main Gea API, so you can import `Link`, `RouterView`, and `router` from `@geajs/core`.

### Quick Example

```jsx
import { Component, Link, RouterView } from '@geajs/core'
import Home from './views/Home'
import About from './views/About'
import UserProfile from './views/UserProfile'

export default class App extends Component {
  template() {
    return (
      <div class="app">
        <nav>
          <Link to="/" label="Home" />
          <Link to="/about" label="About" />
          <Link to="/users/1" label="Alice" />
        </nav>
        <RouterView routes={[
          { path: '/', component: Home },
          { path: '/about', component: About },
          { path: '/users/:id', component: UserProfile },
        ]} />
      </div>
    )
  }
}
```

### Route Patterns

| Pattern | Example URL | Params |
| --- | --- | --- |
| `/about` | `/about` | `{}` |
| `/users/:id` | `/users/42` | `{ id: '42' }` |
| `/repo/:owner/*` | `/repo/dashersw/src/index.ts` | `{ owner: 'dashersw', '*': 'src/index.ts' }` |

### Components

- **`RouterView`** — renders the component matching the current URL. Accepts a `routes` array of `{ path, component }` objects. Supports both class and function components.
- **`Link`** — renders an `<a>` tag that navigates via `history.pushState` instead of a full page reload. Modifier keys (Cmd/Ctrl+click) open in a new tab as expected.

### Programmatic Navigation

```ts
import { router } from '@geajs/core'

router.navigate('/about')          // push new entry
router.replace('/login')           // replace current entry
router.back()                      // history.back()
router.forward()                   // history.forward()

console.log(router.path)           // '/about'
console.log(router.query)          // { q: 'hello' } for ?q=hello
```

### Route Parameters in Components

Function components receive matched params as props:

```jsx
export default function UserProfile({ id }) {
  return <h1>User {id}</h1>
}
```

Class components receive them via `created(props)` and `template(props)`.

## Related Packages

- **[@geajs/mobile](https://www.npmjs.com/package/@geajs/mobile)** — Mobile UI primitives: views, navigation, gestures, sidebar, tabs, pull-to-refresh, infinite scroll.
- **[@geajs/vite-plugin](https://www.npmjs.com/package/@geajs/vite-plugin)** — Vite plugin that powers compile-time JSX transforms, reactivity wiring, and HMR.
- **[create-gea](https://www.npmjs.com/package/create-gea)** — Project scaffolder: `npm create gea@latest`.

## Documentation

Full documentation: [docs](https://github.com/dashersw/gea/tree/master/docs)

## AI-Assisted Development

This repository includes [agent skills](https://github.com/dashersw/gea/tree/master/skills/gea-framework) that teach AI coding assistants how to work with Gea. If you use Cursor, Codex, or a similar AI-enabled editor, it will automatically pick up the skill files and understand Gea's stores, components, JSX conventions, and reactivity model — so you can scaffold and iterate on Gea apps with full AI assistance out of the box.

## License

[MIT](LICENSE) — Copyright (c) 2017-present Armagan Amcalar
