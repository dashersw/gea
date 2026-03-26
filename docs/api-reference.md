# API Reference

## Store

### Import

```ts
import { Store } from '@geajs/core'
```

### Creating a Store

Extend `Store`, declare reactive properties as class fields, add methods that mutate them, and export a singleton instance.

```ts
import { Store } from '@geajs/core'

class TodoStore extends Store {
  todos: Todo[] = []
  filter: 'all' | 'active' | 'completed' = 'all'
  draft = ''

  add(text?: string): void {
    const t = (text ?? this.draft).trim()
    if (!t) return
    this.draft = ''
    this.todos.push({ id: uid(), text: t, done: false })
  }

  toggle(id: string): void {
    const todo = this.todos.find(t => t.id === id)
    if (todo) todo.done = !todo.done
  }

  remove(id: string): void {
    this.todos = this.todos.filter(t => t.id !== id)
  }

  setFilter(filter: 'all' | 'active' | 'completed'): void {
    this.filter = filter
  }

  get filteredTodos(): Todo[] {
    const { todos, filter } = this
    if (filter === 'active') return todos.filter(t => !t.done)
    if (filter === 'completed') return todos.filter(t => t.done)
    return todos
  }

  get activeCount(): number {
    return this.todos.filter(t => !t.done).length
  }
}

export default new TodoStore()
```

### Reactivity

The store instance is wrapped in a deep `Proxy`. Any mutation — direct assignment, nested property change, or array method call — is automatically tracked and batched.

```ts
this.count++
this.user.name = 'Alice'
this.todos.push({ id: '1', text: 'New', done: false })
this.items.splice(2, 1)
this.items.sort((a, b) => a.order - b.order)
this.todos = this.todos.filter(t => !t.done)
```

Changes are batched via `queueMicrotask`.

### observe(path, handler)

```ts
const unsubscribe = store.observe([], (value, changes) => {
  console.log('State changed:', changes)
})

store.observe('todos', (value, changes) => {
  console.log('Todos changed:', value)
})

store.observe('user.profile.name', (value, changes) => {
  console.log('Name changed to:', value)
})

unsubscribe()
```

| Param | Type | Description |
| --- | --- | --- |
| `path` | `string \| string[]` | Dot-separated path or array of path parts. Empty string/array observes all changes. |
| `handler` | `(value: any, changes: StoreChange[]) => void` | Called with the current value and the batch of changes. |

**Returns:** `() => void` — call to unsubscribe.

### StoreChange

```ts
interface StoreChange {
  type: 'add' | 'update' | 'delete' | 'append' | 'reorder' | 'swap'
  property: string
  target: any
  pathParts: string[]
  newValue?: any
  previousValue?: any
  start?: number
  count?: number
  permutation?: number[]
  arrayIndex?: number
  leafPathParts?: string[]
  isArrayItemPropUpdate?: boolean
  otherIndex?: number
}
```

### silent(fn)

Executes a function that may mutate the store without triggering observers. Pending changes are discarded after the function returns.

```ts
store.silent(() => {
  store.items.splice(fromIndex, 1)
  store.items.splice(toIndex, 0, draggedItem)
})
```

Useful for drag-and-drop, bulk imports, or any case where you manage DOM updates yourself.

### Intercepted Array Methods

| Method | Change type |
| --- | --- |
| `push(...items)` | `append` |
| `pop()` | `delete` |
| `shift()` | `delete` |
| `unshift(...items)` | `add` (per item) |
| `splice(start, deleteCount, ...items)` | `delete` + `add` (or `append`) |
| `sort(compareFn?)` | `reorder` with permutation |
| `reverse()` | `reorder` with permutation |

Iterator methods (`map`, `filter`, `find`, `findIndex`, `forEach`, `some`, `every`, `reduce`, `indexOf`, `includes`) are intercepted to provide proxied items with correct paths.

---

## Component

### Import

```ts
import { Component } from '@geajs/core'
```

### Class Component

```jsx
import { Component } from '@geajs/core'
import counterStore from './counter-store'

export default class Counter extends Component {
  template() {
    return (
      <div class="counter">
        <span>{counterStore.count}</span>
        <button click={counterStore.increment}>+</button>
        <button click={counterStore.decrement}>-</button>
      </div>
    )
  }
}
```

### Lifecycle

| Method | When called |
| --- | --- |
| `created(props)` | After constructor, before render |
| `onAfterRender()` | After DOM insertion and child mounting |
| `onAfterRenderAsync()` | Next `requestAnimationFrame` after render |
| `dispose()` | Removes from DOM, cleans up observers and children |

### Properties

| Property | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique component identifier (auto-generated) |
| `el` | `HTMLElement` | Root DOM element (created lazily from `template()`) |
| `props` | `any` | Properties passed to the component |
| `rendered` | `boolean` | Whether the component has been rendered |

### DOM Helpers

| Method | Description |
| --- | --- |
| `$(selector)` | First matching descendant (scoped `querySelector`) |
| `$$(selector)` | All matching descendants (scoped `querySelectorAll`) |

### Rendering

```ts
const app = new MyApp()
app.render(document.getElementById('app'))
```

`render(rootEl, index?)` inserts the component's DOM element into the given parent. Components render once; subsequent state changes trigger surgical DOM patches.

### events Getter

Generated by the Vite plugin for event delegation. Maps event types to selector-handler pairs:

```ts
get events() {
  return {
    click: {
      '.btn-add': this.addItem,
      '.btn-remove': this.removeItem
    },
    change: {
      '.checkbox': this.toggle
    }
  }
}
```

### Props and Data Flow

Props follow JavaScript's native value semantics:

- **Primitives** (numbers, strings, booleans) are passed **by value**. The child receives a copy. Reassigning the prop in the child does not affect the parent.
- **Objects and arrays** are passed **by reference**. The child receives the parent's reactive proxy. Mutating properties on the object or calling array methods updates the parent's state and DOM automatically.

```jsx
// parent passes object and primitive
<Child user={this.user} count={this.count} />

// In the child:
this.props.user.name = 'Bob'   // two-way — updates parent's DOM
this.props.count = 99           // one-way — only child's DOM updates
```

When the parent updates a prop, the new value flows down to the child, overwriting any local reassignment the child may have made to a primitive.

For objects and arrays, reactivity propagates at any depth. A grandchild receiving the same object proxy can mutate it, and every ancestor observing that data updates.

---

## Function Components

```jsx
export default function TodoInput({ draft, onDraftChange, onAdd }) {
  const handleKeyDown = e => {
    if (e.key === 'Enter') onAdd()
  }

  return (
    <div class="todo-input-wrap">
      <input
        type="text"
        placeholder="What needs to be done?"
        value={draft}
        input={onDraftChange}
        keydown={handleKeyDown}
      />
      <button click={onAdd}>Add</button>
    </div>
  )
}
```

Function components are converted to class components at build time by the Vite plugin.

---

## JSX Syntax

### Attributes

| Gea | HTML equivalent | Notes |
| --- | --- | --- |
| `class="foo"` | `class="foo"` | Use `class`, not `className` |
| `` class={`btn ${active ? 'on' : ''}`} `` | Dynamic class | Template literal |
| `value={text}` | `value="..."` | For inputs |
| `checked={bool}` | `checked` | For checkboxes |
| `disabled={bool}` | `disabled` | For buttons/inputs |
| `aria-label="Close"` | `aria-label="Close"` | ARIA pass-through |

### Event Attributes

```jsx
<button click={handleClick}>Click</button>
<input input={handleInput} />
<input change={handleChange} />
<input keydown={handleKeyDown} />
<input blur={handleBlur} />
<input focus={handleFocus} />
<span dblclick={handleDoubleClick}>Text</span>
<form submit={handleSubmit}>...</form>
```

Both native-style (`click`, `change`) and React-style (`onClick`, `onChange`) names are supported.

Supported: `click`, `dblclick`, `input`, `change`, `keydown`, `keyup`, `blur`, `focus`, `mousedown`, `mouseup`, `submit`, `dragstart`, `dragend`, `dragover`, `dragleave`, `drop`.

With `@geajs/mobile`: `tap`, `longTap`, `swipeRight`, `swipeUp`, `swipeLeft`, `swipeDown`.

### Text Interpolation

```jsx
<span>{count}</span>
<span>{user.name}</span>
<span>{activeCount} {activeCount === 1 ? 'item' : 'items'} left</span>
```

### Style Objects

Inline style objects with camelCase property names are supported:

```jsx
<div style={{ backgroundColor: 'red', fontSize: '14px' }}>Styled</div>
<div style={{ color: this.textColor }}>Dynamic</div>
<div style="color:red">String style</div>
```

Static objects are compiled to CSS strings at build time. Dynamic values are converted to `cssText` at runtime.

### `ref` Attribute

```jsx
export default class Canvas extends Component {
  canvasEl = null

  template() {
    return (
      <div>
        <canvas ref={this.canvasEl} width="800" height="600"></canvas>
      </div>
    )
  }
}
```

Assigns the DOM element to the component property after render. Available in `onAfterRender()` and event handlers.

---

## Conditional Rendering

```jsx
{step === 1 && <StepOne onContinue={() => store.setStep(2)} />}
{!paymentComplete ? <PaymentForm /> : <div class="success">Done</div>}
```

Compiled into `<template>` markers with swap logic.

---

## List Rendering

```jsx
<ul>
  {todos.map(todo => (
    <TodoItem key={todo.id} todo={todo} onToggle={() => store.toggle(todo.id)} />
  ))}
</ul>
```

The `key` prop is required. Gea uses `applyListChanges` for efficient add, delete, append, reorder, and swap operations. By default the runtime uses `item.id` when available. You can use any property as the key (`key={option.value}`), or the item itself for primitives (`key={tag}`).

---

## Router

### Import

```ts
import { router, Router, RouterView, Link, matchRoute } from '@geajs/core'
import type { RouteConfig, RouteMatch, RouteParams, RouteComponent } from '@geajs/core'
```

### `router` (Singleton)

The `router` singleton is a `Store` that tracks the current URL state. Its properties are reactive.

#### Properties

| Property | Type | Description |
| --- | --- | --- |
| `path` | `string` | Current pathname (e.g. `'/users/42'`) |
| `hash` | `string` | Current hash (e.g. `'#section'`) |
| `search` | `string` | Current search string (e.g. `'?q=hello&page=2'`) |
| `query` | `Record<string, string>` | Parsed key-value pairs from `search` (getter) |

#### Methods

| Method | Description |
| --- | --- |
| `navigate(path)` | Push a new history entry and update `path`, `hash`, `search` |
| `replace(path)` | Replace the current history entry (no new back-button entry) |
| `back()` | Go back one entry (`history.back()`) |
| `forward()` | Go forward one entry (`history.forward()`) |

```ts
router.navigate('/users/42?tab=posts#bio')
console.log(router.path)   // '/users/42'
console.log(router.search) // '?tab=posts'
console.log(router.hash)   // '#bio'
console.log(router.query)  // { tab: 'posts' }
```

### `matchRoute(pattern, path)`

Pure function that tests a URL path against a route pattern and extracts named parameters.

| Param | Type | Description |
| --- | --- | --- |
| `pattern` | `string` | Route pattern with optional `:param` and `*` segments |
| `path` | `string` | Actual URL pathname to match against |

**Returns:** `RouteMatch | null`

```ts
interface RouteMatch {
  path: string
  pattern: string
  params: Record<string, string>
}
```

| Pattern | Matches | Params |
| --- | --- | --- |
| `/about` | `/about` | `{}` |
| `/users/:id` | `/users/42` | `{ id: '42' }` |
| `/files/*` | `/files/docs/readme.md` | `{ '*': 'docs/readme.md' }` |
| `/repo/:owner/*` | `/repo/dashersw/src/index.ts` | `{ owner: 'dashersw', '*': 'src/index.ts' }` |

### `RouterView`

Renders the first matching route from a `routes` array. Observes `router.path` and swaps the rendered component when the URL changes.

| Prop | Type | Description |
| --- | --- | --- |
| `routes` | `RouteConfig[]` | Array of `{ path, component }` objects. First match wins. |

```jsx
<RouterView routes={[
  { path: '/', component: Home },
  { path: '/about', component: About },
  { path: '/users/:id', component: UserProfile },
]} />
```

Both class components and function components are supported. Matched params are passed as props. Navigating between URLs that match the same pattern updates props instead of re-creating the component.

### `Link`

Renders an `<a>` tag for SPA navigation. Left-clicks call `router.push()` (or `router.replace()` with the `replace` prop) instead of triggering a full page reload. Modifier-key clicks (Cmd, Ctrl, Shift, Alt), non-left-button clicks, and external URLs pass through to the browser.

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `to` | `string` | Yes | Target path |
| `label` | `string` | No | Text content (alternative to children) |
| `children` | `string` | No | Inner HTML content: `<Link to="/about">About</Link>` |
| `class` | `string` | No | CSS class(es) for the `<a>` tag |
| `replace` | `boolean` | No | Use `router.replace()` instead of `router.push()` |
| `target` | `string` | No | Link target (e.g. `_blank`) |
| `rel` | `string` | No | Link relationship (e.g. `noopener`) |
| `onNavigate` | `(e: MouseEvent) => void` | No | Callback fired before SPA navigation |

```jsx
<Link to="/about" label="About" />
<Link to="/about">About</Link>
<Link to="/users/1" class="nav-link">Alice</Link>
<Link to="/external" target="_blank" rel="noopener">Docs</Link>
```

---

## Gea Mobile

### Import

```js
import { View, ViewManager, GestureHandler, Sidebar, TabView, NavBar, PullToRefresh, InfiniteScroll } from '@geajs/mobile'
```

### View

Full-screen `Component` rendering to `document.body` by default.

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `index` | `number` | `0` | Z-axis position |
| `supportsBackGesture` | `boolean` | `false` | Enable swipe-back |
| `backGestureTouchTargetWidth` | `number` | `50` | Touch area width (px) |
| `hasSidebar` | `boolean` | `false` | Allow sidebar reveal |

| Method | Description |
| --- | --- |
| `onActivation()` | Called when the view becomes active in a ViewManager |
| `panIn(isBeingPulled)` | Animate into viewport |
| `panOut(isBeingPulled)` | Animate out of viewport |

### ViewManager

| Method | Description |
| --- | --- |
| `pull(view, canGoBack?)` | Navigate forward. `canGoBack` saves history. |
| `push()` | Go back to previous view. |
| `setCurrentView(view, noDispose?)` | Set active view without animation. |
| `canGoBack()` | `true` if history exists. |
| `toggleSidebar()` | Toggle sidebar. |
| `getLastViewInHistory()` | Last view in the stack. |

### GestureHandler

Supported gestures: `tap`, `longTap`, `swipeRight`, `swipeLeft`, `swipeUp`, `swipeDown`.

### UI Components

| Component | Description |
| --- | --- |
| `Sidebar` | Slide-out navigation panel |
| `TabView` | Tab-based view switching |
| `NavBar` | Top navigation bar with back/menu buttons |
| `PullToRefresh` | Pull-down-to-refresh (emits `SHOULD_REFRESH`) |
| `InfiniteScroll` | Load-more-on-scroll (emits `SHOULD_LOAD`) |

---

## Teleport

### Import

```ts
import type { TeleportProps } from '@geajs/core'
```

### Usage

Teleport renders content in a different part of the DOM tree while keeping it logically part of your component. This is useful for modals, tooltips, and other UI elements that need to escape their parent's styling or z-index context.

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

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `to-selector` | `string` | Yes | CSS selector for target element where content should be teleported |
| `disabled` | `boolean` | No | When `true`, prevents teleporting and keeps content in original location |

### Features

- **Zero-Reset**: Component state is preserved during teleporting
- **Event Delegation**: Event handlers work normally on teleported content
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

// Multiple teleports
<div>
  <Teleport to-selector="#modals">
    <ConfirmDialog />
  </Teleport>
  <Teleport to-selector="#notifications">
    <Toast message={this.message} />
  </Teleport>
</div>
```

### Target Element Requirements

- The target element must exist in the DOM when the component renders
- If the target is not found, a warning is logged and content remains in its original location
- Target elements can be anywhere in the document, including outside the Gea root

### TypeScript

```ts
import type { TeleportProps } from '@geajs/core'

// Type-safe teleport props
const teleportProps: TeleportProps = {
  'to-selector': '#modal-root',
  disabled: false
}
```

---

## Project Setup

### Vite Configuration

```ts
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'

export default defineConfig({
  plugins: [geaPlugin()]
})
```

### Entry Point

```ts
import App from './app'
import './styles.css'

const app = new App()
app.render(document.getElementById('app'))
```

### Scaffolding

```bash
npm create gea@latest my-app
cd my-app
npm install
npm run dev
```
