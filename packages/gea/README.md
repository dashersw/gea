<img src="https://raw.githubusercontent.com/dashersw/gea/master/docs/public/logo.jpg" height="180" alt="Gea" />

[![npm version](https://badge.fury.io/js/%40geajs%2Fcore.svg)](https://www.npmjs.com/package/@geajs/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/dashersw/gea/blob/master/LICENSE)

# Gea

A batteries-included, reactive JavaScript UI framework with compile-time JSX and proxy-based stores. No virtual DOM — the Vite plugin analyzes your JSX at build time and generates surgical DOM patches that update only what changed. ~13 kb gzipped with the built-in router, ~10 kb without. Zero runtime dependencies.

## Philosophy

Gea's guiding principle is that JavaScript code should be simple and understandable. A framework should not invent new programming concepts or expect you to conform to arbitrary rules. You write regular, idiomatic JavaScript — classes with state and methods, functions that return markup, getters for derived values — and Gea makes it reactive under the hood.

There are no signals, no hooks, no dependency arrays, no compiler directives, and no framework-specific primitives. The only concept Gea introduces is the `Store` class, which is just an ordinary class whose properties happen to be observed by a proxy. Everything else — class inheritance, method calls, property access, `Array.map`, ternary expressions — is standard JavaScript you already know.

The "magic" lives entirely in the build step. The Vite plugin analyzes your code at compile time, figures out which DOM nodes depend on which state, and generates the wiring. At runtime, you get clean, readable, object-oriented code that just works.

## Performance

Gea is the fastest compiled UI framework — benchmarked with the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) suite, the industry-standard stress test covering row creation, updates, swaps, selection, and deletion on large tables.

| Framework | Weighted geometric mean |
| --- | --- |
| vanillajs | 1.02 |
| **Gea 1.0** | **1.03** |
| Solid 1.9 | 1.12 |
| Svelte 5 | 1.14 |
| Vue 3.6 | 1.26 |
| React 19.2 | 1.50 |

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

## Teleport

Teleport allows you to render content in a different part of the DOM tree while keeping it logically part of your component. This is useful for modals, tooltips, and other UI elements that need to escape their parent's styling or z-index context.

```jsx
import { Component } from '@geajs/core'

export default class App extends Component {
  showModal = false

  template() {
    return (
      <div class="app">
        <button onclick={() => this.showModal = true}>Open Modal</button>
        
        <Teleport to-selector="#modal-root">
          <div class={`modal ${this.showModal ? 'visible' : 'hidden'}`}>
            <h2>Modal Title</h2>
            <p>This content is rendered in #modal-root, not here!</p>
            <button onclick={() => this.showModal = false}>Close</button>
          </div>
        </Teleport>
      </div>
    )
  }
}
```

### Props

| Prop | Type | Description |
| --- | --- | --- |
| `to-selector` | `string` | CSS selector for target element (required) |
| `disabled` | `boolean` | Prevents teleporting when `true` (optional) |

### Features

- **Zero-Reset**: Component state is preserved during teleporting
- **Event Delegation**: Click handlers and other events work normally on teleported content
- **Reactivity**: When `to-selector` changes, content is moved to the new target
- **Conditional**: Use `disabled` prop to toggle teleporting on/off
- **Cleanup**: Teleported content is automatically cleaned up when component is disposed

### Examples

```jsx
// Basic teleport
<Teleport to-selector="#modal-root">
  <Modal />
</Teleport>

// Conditional teleport
<Teleport to-selector="#sidebar" disabled={!this.showSidebar}>
  <SidebarContent />
</Teleport>

// Dynamic target
<Teleport to-selector={this.isMobile ? '#mobile-container' : '#desktop-container'}>
  <ResponsiveContent />
</Teleport>
```

The target element must exist in the DOM when the component renders. If the target is not found, a warning is logged and content remains in its original location.

## Router

Gea includes a built-in client-side router for single-page applications.

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
