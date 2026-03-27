---
name: gea-framework
description: Guide for building applications with Gea — a lightweight, reactive JavaScript UI framework with proxy-based stores, JSX components, and automatic DOM patching. Use when creating components, stores, or working with Gea's reactivity system.
---

# Gea Framework

Gea is a lightweight, reactive JavaScript UI framework built on the principle that JS code should be simple and understandable. It compiles JSX into efficient DOM operations at build time via a Vite plugin, uses proxy-based stores for state management, and employs event delegation for all user interactions. There is no virtual DOM — the Vite plugin analyzes your JSX templates and generates surgical DOM patches that update only the elements that depend on changed state.

Gea introduces no new programming concepts. There are no signals, no hooks, no dependency arrays, and no framework-specific primitives. Stores are classes with state and methods. Components are classes with a `template()` method or plain functions. Computed values are getters. The compile-time Vite plugin is the only "magic" — it analyzes ordinary JavaScript and wires up reactivity invisibly, so you write regular OOP/functional code that is fully reactive under the hood.

Read `reference.md` in this skill directory for the full API surface and detailed examples.

## Core Concepts

### Stores

A **Store** holds shared application state. Extend the `Store` class, declare reactive properties as class fields, and add methods that mutate them. The store instance is wrapped in a deep `Proxy` that tracks every property change and batches notifications via `queueMicrotask`.

```ts
import { Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0

  increment() {
    this.count++
  }
  decrement() {
    this.count--
  }
}

export default new CounterStore()
```

Key rules:

- Always export a **singleton instance** (`export default new MyStore()`), not the class.
- Mutate properties directly — `this.count++` triggers reactivity automatically.
- Use **getters** for derived/computed values — they re-evaluate on each access.
- Array mutations (`push`, `pop`, `splice`, `sort`, `reverse`, `shift`, `unshift`) are intercepted and produce fine-grained change events.
- Replacing an array with a superset (same prefix + new items) is detected as an efficient `append` operation.

### Components

Gea has two component styles. Both compile to the same internal representation.

#### Class Components

Extend `Component` and implement a `template(props)` method that returns JSX. Class components can hold their own reactive properties — use them when you need local, transient UI state.

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

Event handlers accept both method references (`click={this.increment}`) and arrow functions (`click={() => this.increment()}`). Use method references for simple forwarding; use arrow functions when passing arguments or composing logic.

Use class components when you need **local component state** or lifecycle hooks.

#### Function Components

Export a default function that receives props and returns JSX. The Vite plugin converts it to a class component internally.

```jsx
export default function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>
}
```

Use function components for **stateless, presentational UI**.

### Props and Data Flow

Props follow JavaScript's native value semantics:

- **Objects and arrays** passed as props are the parent's reactive proxy. The child can mutate them directly, and both parent and child DOM update — two-way binding with zero ceremony.
- **Primitives** are copies. Reassigning a primitive prop in the child updates only the child's DOM — the parent is unaffected.

No `emit`, no `v-model`, no callback props needed for object/array mutations. Deep nesting works the same way — as long as the same reference is passed down, reactivity propagates across the entire tree.

### Component State vs. Stores

| Concern                                         | Where it lives    | When to use                                                         |
| ----------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| Shared app data (todos, user, cart)             | Store             | Data accessed by multiple components or persisted across navigation |
| Derived / computed values                       | Store getters     | Values calculated from store state                                  |
| Local, transient UI state (editing mode, hover) | Component properties | Ephemeral state that no other component needs                       |

A class component can have **both** local state and read from external stores:

```jsx
export default class TodoItem extends Component {
  editing = false
  editText = ''

  template({ todo, onToggle, onRemove }) {
    const { editing, editText } = this
    return (
      <li class={`todo-item ${editing ? 'editing' : ''}`}>
        <span dblclick={this.startEditing}>{todo.text}</span>
        {/* ... */}
      </li>
    )
  }
}
```

### Multiple Stores

Split state into domain-specific stores. Each store is an independent singleton.

```
flight-store.ts    → step, boardingPass
options-store.ts   → luggage, seat, meal
payment-store.ts   → passengerName, cardNumber, paymentComplete
```

Stores can import and call each other:

```ts
class FlightStore extends Store {
  startOver(): void {
    this.step = 1
    optionsStore.reset()
    paymentStore.reset()
  }
}
```

A root component reads from all relevant stores and passes data down as props:

```jsx
export default class App extends Component {
  template() {
    const { step } = flightStore
    const { luggage } = optionsStore
    return <div>{step === 1 && <OptionStep selectedId={luggage} onSelect={id => optionsStore.setLuggage(id)} />}</div>
  }
}
```

## Router

Gea includes a built-in client-side router. The router is a `Store` that reactively tracks `path`, `params`, `query`, and `hash`. Define routes with `setRoutes` or `createRouter`.

### Setup

Create a bare `Router` in `router.ts`. Keep this file free of view imports to avoid circular dependencies (views import `router`, so `router.ts` must not import views).

```ts
// src/router.ts
import { Router } from '@geajs/core'
export const router = new Router()
```

Set routes in `App.tsx` where both the router and view components are available:

```tsx
// src/App.tsx
import { Component, Outlet } from '@geajs/core'
import { router } from './router'
import AppShell from './views/AppShell'
import Home from './views/Home'
import About from './views/About'
import NotFound from './views/NotFound'

router.setRoutes({
  '/': {
    layout: AppShell,
    children: {
      '/': Home,
      '/about': About,
      '/users/:id': UserProfile,
    },
  },
  '*': NotFound,
})

export default class App extends Component {
  template() {
    return <Outlet />
  }
}
```

Layouts receive the resolved child as a `page` prop:

```tsx
export default class AppShell extends Component {
  template({ page }: any) {
    return (
      <div class="app">
        <nav>
          <Link to="/" label="Home" />
          <Link to="/about" label="About" />
        </nav>
        <main>{page}</main>
      </div>
    )
  }
}
```

For simple apps without layouts/guards (no circular dependency risk), you can use `createRouter` directly in `router.ts` and render with `<RouterView router={router} />`:

```ts
import { createRouter } from '@geajs/core'
import Home from './views/Home'
import About from './views/About'

export const router = createRouter({
  '/': Home,
  '/about': About,
} as const)
```

```tsx
import { Component, RouterView } from '@geajs/core'
import { router } from './router'

export default class App extends Component {
  template() {
    return <RouterView router={router} />
  }
}
```

### Guards

Guards are synchronous functions on route groups that control access. A guard returns:
- `true` — proceed to the route
- `string` — redirect to that path
- `Component` — render it instead of the route

```ts
import authStore from './stores/auth-store'

const AuthGuard = () => {
  if (authStore.isAuthenticated) return true
  return '/login'
}

router.setRoutes({
  '/login': Login,
  '/': {
    layout: AppShell,
    guard: AuthGuard,
    children: {
      '/dashboard': Dashboard,
      '/settings': Settings,
    },
  },
})
```

Guards on nested groups stack parent → child. Guards are intentionally synchronous — they check store state, not async APIs. For async checks, use `created()` in the component.

### Route Patterns

- Static: `/about`
- Named params: `/users/:id` — extracted as `{ id: '42' }`
- Wildcard: `*` — matches any unmatched path
- Redirects: `'/old': '/new'` — string values trigger a redirect

### Link

Renders an `<a>` tag that navigates with `history.pushState`. Modifier keys (Cmd/Ctrl+click) open in a new tab.

```jsx
<Link to="/about" label="About" class="nav-link" />
```

### Programmatic Navigation

```ts
import { router } from './router'

router.push('/about')         // pushState
router.replace('/login')      // replaceState
router.back()
router.forward()
```

### Route Parameters

Function components receive matched params as props:

```jsx
export default function UserProfile({ id }) {
  return <h1>User {id}</h1>
}
```

Class components receive them via `created(props)` and `template(props)`. Route params are also available on `router.params`.

### Active State

```ts
router.isActive('/dashboard')  // true if path starts with /dashboard
router.isExact('/dashboard')   // true only for exact match
```

### matchRoute Utility

Use `matchRoute` for manual route matching:

```ts
import { matchRoute } from '@geajs/core'

const result = matchRoute('/users/:id', '/users/42')
// { path: '/users/42', pattern: '/users/:id', params: { id: '42' } }
```

### RouterView

`RouterView` renders the current route. Use it with a `router` prop for `createRouter` setups, or with an inline `routes` array for quick prototypes:

```jsx
// With createRouter (recommended)
<RouterView router={router} />

// With inline routes (uses the singleton router)
<RouterView routes={[
  { path: '/', component: Home },
  { path: '/about', component: About },
  { path: '/users/:id', component: UserProfile },
]} />
```

## JSX Rules

Gea JSX differs from React JSX in several ways:

| Feature            | Gea                                       | React                                           |
| ------------------ | ------------------------------------------- | ----------------------------------------------- |
| CSS classes        | `class="foo"`                               | `className="foo"`                               |
| Event handlers     | `click={fn}` or `onClick={fn}`               | `onClick={fn}`, `onInput={fn}`, `onChange={fn}` |
| Checked inputs     | `checked={bool}` + `change={fn}`            | `checked={bool}` + `onChange={fn}`              |
| Conditional render | `{cond && <Child />}`                       | Same                                            |
| Lists with keys    | `{arr.map(item => <Item key={item.id} />)}` | Same                                            |
| Dynamic classes    | ``class={`btn ${active ? 'on' : ''}`}``     | Same (with `className`)                         |

Both native-style (`click`, `change`) and React-style (`onClick`, `onChange`) event attribute names are supported. Native-style is preferred by convention.

Supported event attributes: `click`, `dblclick`, `input`, `change`, `keydown`, `keyup`, `blur`, `focus`, `mousedown`, `mouseup`, `submit`, `dragstart`, `dragend`, `dragover`, `dragleave`, `drop`.

With `@geajs/mobile`: `tap`, `longTap`, `swipeRight`, `swipeUp`, `swipeLeft`, `swipeDown`.

### Style Objects

Gea supports React-style inline style objects. The compiler converts static style objects to CSS strings at build time and generates runtime conversion for dynamic values:

```jsx
// Static — compiled to a CSS string at build time (zero runtime cost)
<div style={{ backgroundColor: 'red', fontSize: '14px', fontWeight: 'bold' }}>
  Styled content
</div>

// Dynamic — converted to cssText at runtime
<div style={{ color: this.textColor, opacity: this.isVisible ? 1 : 0 }}>
  Dynamic styling
</div>

// String styles still work (passed through as-is)
<div style={`width:${this.width}px`}>Sized content</div>
```

CSS property names use camelCase (like React). The compiler converts them to kebab-case: `backgroundColor` → `background-color`, `fontSize` → `font-size`.

### `ref` Attribute

Use `ref` to get a direct reference to a DOM element after render:

```jsx
export default class Canvas extends Component {
  canvasEl = null

  template() {
    return (
      <div class="canvas-wrapper">
        <canvas ref={this.canvasEl} width="800" height="600"></canvas>
      </div>
    )
  }

  onAfterRender() {
    const ctx = this.canvasEl.getContext('2d')
    ctx.fillRect(0, 0, 100, 100)
  }
}
```

The compiler replaces `ref` with a `data-gea-ref` marker and generates a `__setupRefs()` method that assigns the DOM element to the specified component property after render. Multiple refs on different elements are supported.

### Compiler Errors (Unsupported Patterns)

The Gea compiler throws clear errors for JSX patterns it cannot compile. These are caught at build time, not at runtime:

| Pattern | Error | Fix |
| --- | --- | --- |
| `<div {...props} />` | Spread attributes not supported | Destructure and pass props individually |
| `<{DynamicTag} />` | Dynamic component tags not supported | Use conditional rendering (`{isA ? <A /> : <B />}`) |
| `{() => <div />}` | Function-as-child not supported | Use render props with named attributes instead |
| `export function Foo() { return <div /> }` | Named JSX component exports not supported | Use `export default function` |
| `<>{items.map(...)}</>` | Fragments as `.map()` item roots not supported | Wrap each item in a single root element |

## Rendering

```js
import MyApp from './my-app.jsx'

const app = new MyApp()
app.render(document.getElementById('app'))
```

Components are instantiated with `new`, then `.render(parentEl)` inserts them into the DOM.

## Gea Mobile

The `@geajs/mobile` package extends Gea with mobile-oriented UI primitives:

- **View** — a full-screen `Component` that renders to `document.body` by default.
- **ViewManager** — manages a navigation stack with iOS-style transitions, back gestures, and sidebar support.
- **Sidebar**, **TabView**, **NavBar** — pre-built layout components.
- **PullToRefresh**, **InfiniteScroll** — scroll-driven UI patterns.
- **GestureHandler** — registers `tap`, `longTap`, `swipeRight`, `swipeLeft`, `swipeUp`, `swipeDown` events.

```js
import { View, ViewManager } from '@geajs/mobile'

class HomeView extends View {
  template() {
    return (
      <view>
        <h1>Home</h1>
      </view>
    )
  }
  onActivation() {
    /* called when view enters viewport */
  }
}

const vm = new ViewManager()
const home = new HomeView()
vm.setCurrentView(home)
```

## Project Setup

### Scaffolding a New Project

```bash
npm create gea@latest my-app
cd my-app
npm install
npm run dev
```

The `create-gea` package scaffolds a Vite project with TypeScript, a sample store, class and function components, and the Vite plugin pre-configured.

### Manual Setup

```js
// vite.config.js
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'

export default defineConfig({
  plugins: [geaPlugin()]
})
```

The `@geajs/vite-plugin` Vite plugin handles JSX transformation, reactivity wiring, event delegation generation, and HMR.

## @geajs/ui Component Library

`@geajs/ui` is a Tailwind-styled, Zag.js-powered component library for Gea. It provides ~35 ready-to-use components: simple styled primitives (Button, Card, Input) and behavior-rich interactive widgets (Select, Dialog, Tabs, Toast). For full usage instructions, component API, and examples, see the **gea-ui-components** skill in `skills/gea-ui-components/`.

## npm Packages

| Package | npm | Description |
| --- | --- | --- |
| `@geajs/core` | [npm](https://www.npmjs.com/package/@geajs/core) | Core framework — stores, components, reactivity, DOM patching |
| `@geajs/ui` | [npm](https://www.npmjs.com/package/@geajs/ui) | Tailwind + Zag.js component library — Button, Select, Dialog, Tabs, Toast, etc. |
| `@geajs/mobile` | [npm](https://www.npmjs.com/package/@geajs/mobile) | Mobile UI primitives — views, navigation, gestures, layout |
| `@geajs/vite-plugin` | [npm](https://www.npmjs.com/package/@geajs/vite-plugin) | Vite plugin — JSX transform, reactivity wiring, HMR |
| `create-gea` | [npm](https://www.npmjs.com/package/create-gea) | Project scaffolder (`npm create gea@latest`) |
| `gea-tools` | — | VS Code / Cursor extension for Gea JSX code intelligence |

## VS Code / Cursor Extension

The `gea-tools` extension (in `packages/gea-tools`) provides:

- Component completion inside JSX tags
- Prop completion based on component signatures
- Event attribute completion (`click`, `input`, `change`, etc.)
- Hover details for components and props
- Unknown component warnings

## Documentation

Full documentation is in the `docs/` directory of the repository, structured for GitBook:

- Getting started, core concepts, Gea Mobile, tooling, and API reference
- Comparison pages: React vs Gea, Vue vs Gea
