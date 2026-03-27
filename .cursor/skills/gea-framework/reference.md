# Gea Framework — API Reference

## Table of Contents

- [Store](#store)
- [Component](#component)
- [Function Components](#function-components)
- [Component State](#component-state)
- [JSX Syntax](#jsx-syntax)
- [Event Handling](#event-handling)
- [Conditional Rendering](#conditional-rendering)
- [List Rendering](#list-rendering)
- [Multiple Stores](#multiple-stores)
- [Store Composition](#store-composition)
- [Computed Values](#computed-values)
- [Router](#router)
- [Gea Mobile](#gea-mobile)
- [View](#view)
- [ViewManager](#viewmanager)
- [GestureHandler](#gesturehandler)
- [UI Components](#ui-components)
- [Drag and Drop](#drag-and-drop)
- [Project Setup](#project-setup)

---

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
// All of these trigger reactive updates:
this.count++
this.user.name = 'Alice'
this.todos.push({ id: '1', text: 'New', done: false })
this.items.splice(2, 1)
this.items.sort((a, b) => a.order - b.order)
this.todos = this.todos.filter(t => !t.done)
```

Changes are batched via `queueMicrotask` — multiple synchronous mutations in the same method produce a single notification cycle.

### `observe(path, handler)`

Low-level observation API. The Vite plugin generates these calls automatically, but you can use them manually.

```ts
const store = new CounterStore()

// Observe all changes to state
const removeObserver = store.observe([], (value, changes) => {
  console.log('State changed:', changes)
})

// Observe a specific path
store.observe('todos', (value, changes) => {
  console.log('Todos array changed:', value)
})

// Observe a nested path
store.observe('user.profile.name', (value, changes) => {
  console.log('User name changed to:', value)
})

// Remove the observer
removeObserver()
```

**Parameters:**

| Param     | Type                                           | Description                                                                         |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `path`    | `string \| string[]`                           | Dot-separated path or array of path parts. Empty string/array observes all changes. |
| `handler` | `(value: any, changes: StoreChange[]) => void` | Called with the current value at the path and the batch of changes.                 |

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
  start?: number // for append
  count?: number // for append
  permutation?: number[] // for reorder (sort/reverse)
  arrayIndex?: number // for array item property updates
  leafPathParts?: string[]
  isArrayItemPropUpdate?: boolean
  otherIndex?: number // for swap
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

These array methods on store properties are intercepted to produce fine-grained change events:

| Method                                 | Change type                                   |
| -------------------------------------- | --------------------------------------------- |
| `push(...items)`                       | `append`                                      |
| `pop()`                                | `delete`                                      |
| `shift()`                              | `delete`                                      |
| `unshift(...items)`                    | `add` (per item)                              |
| `splice(start, deleteCount, ...items)` | `delete` + `add` (or `append` when appending) |
| `sort(compareFn?)`                     | `reorder` with permutation                    |
| `reverse()`                            | `reorder` with permutation                    |

Iterator methods (`map`, `filter`, `find`, `findIndex`, `forEach`, `some`, `every`, `reduce`, `indexOf`, `includes`) are also intercepted to provide proxied items with correct paths.

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

| Method                 | When called                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `created(props)`       | After constructor, before render. Override for initialization logic.            |
| `onAfterRender()`      | After the component's DOM element is inserted and child components are mounted. |
| `onAfterRenderAsync()` | Called in the next `requestAnimationFrame` after render.                        |
| `dispose()`            | Removes the component from the DOM, cleans up observers and child components.   |

### Typed Props

Use `declare props` for TypeScript type-checking and prop autocompletion:

```tsx
export default class TodoItem extends Component {
  declare props: {
    todo: { id: string; text: string; done: boolean }
    onToggle: () => void
    onRemove: () => void
  }

  template({ todo, onToggle, onRemove }: this['props']) {
    return (
      <li>
        <input type="checkbox" checked={todo.done} change={onToggle} />
        <span>{todo.text}</span>
        <button click={onRemove}>x</button>
      </li>
    )
  }
}
```

`declare props` defines the accepted JSX attributes — no JavaScript emitted. `: this['props']` on the `template()` parameter is optional but recommended — it types the destructured variables inside the method for full end-to-end type safety.

Function components get the same type-checking through their parameter type:

```tsx
export default function Badge({ label, count }: { label: string; count: number }) {
  return <span class="badge">{label}: {count}</span>
}
```

### Properties

| Property   | Type          | Description                                             |
| ---------- | ------------- | ------------------------------------------------------- |
| `id`       | `string`      | Unique component identifier (auto-generated).           |
| `el`       | `HTMLElement` | The root DOM element. Created lazily from `template()`. |
| `props`    | (typed via `declare props`) | Properties passed to the component.     |
| (fields)   | `any`         | Reactive properties declared as class fields (inherited from `Store`). |
| `rendered` | `boolean`     | Whether the component has been rendered to the DOM.     |

### DOM Helpers

| Method         | Description                                                                        |
| -------------- | ---------------------------------------------------------------------------------- |
| `$(selector)`  | Returns the first matching descendant element, or the root element if no selector. |
| `$$(selector)` | Returns all matching descendant elements as an array.                              |

### Rendering

```js
const app = new MyApp()
app.render(document.getElementById('app'))
```

The `render(rootEl, index?)` method inserts the component's DOM element into the given parent. Components render once — subsequent state changes trigger surgical DOM patches, not full re-renders.

### `events` Getter (Advanced)

The Vite plugin generates an `events` getter for event delegation. You rarely write this manually, but it maps event types to selector-handler pairs:

```jsx
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

---

## Function Components

Function components are plain functions that receive props and return JSX. The Vite plugin converts them to class components at build time.

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

**When to use function components:**

- Stateless, presentational UI
- Components that receive all data and callbacks via props
- Leaf nodes in the component tree

**When to use class components:**

- Components with local reactive properties (class fields)
- Components that need lifecycle hooks (`created`, `onAfterRender`)
- Root/container components that read from stores

---

## Component State

Class components inherit from `Store`, so they have their own reactive properties. This is separate from external stores.

```jsx
export default class TodoItem extends Component {
  editing = false
  editText = ''

  startEditing() {
    if (this.editing) return
    this.editing = true
    this.editText = this.props.todo.text
  }

  commit() {
    this.editing = false
    const val = this.editText.trim()
    if (val && val !== this.props.todo.text) this.props.onRename(val)
  }

  template({ todo, onToggle, onRemove }) {
    const { editing, editText } = this
    return (
      <li class={`todo-item ${todo.done ? 'done' : ''} ${editing ? 'editing' : ''}`}>
        <input type="checkbox" checked={todo.done} change={onToggle} />
        <span dblclick={this.startEditing}>{todo.text}</span>
        <input
          class="todo-edit"
          type="text"
          value={editText}
          input={e => this.handleEditInput(e)}
          blur={this.commit}
          keydown={e => this.handleKeyDown(e)}
        />
        <button click={onRemove}>×</button>
      </li>
    )
  }
}
```

### Component State vs. Store State — Decision Guide

```
Is this state shared across components?
├── YES → Put it in a Store
└── NO
    Is it derived from other state?
    ├── YES → Use a getter on the Store
    └── NO
        Is it purely local UI feedback (editing, hover, animation)?
        ├── YES → Put it in component properties (class fields)
        └── NO → Probably a Store
```

**Examples of store state:** todo items, user session, cart contents, form data that persists across views, API responses.

**Examples of component properties:** whether an item is in edit mode, whether a tooltip is visible, text in an edit field before committing, copy-to-clipboard success feedback.

---

## Props and Data Flow

Props follow JavaScript's native value semantics — no framework-invented concepts:

- **Primitives** (numbers, strings, booleans) are passed **by value**. The child receives a copy. Reassigning a primitive prop in the child does not affect the parent — only the child's own DOM updates.
- **Objects and arrays** are passed **by reference**. The child receives the parent's reactive proxy directly. Mutating properties on the object or calling array methods in the child updates the parent's state and DOM automatically.

### Objects and Arrays: Two-Way

```jsx
// parent.tsx
export default class Parent extends Component {
  user = { name: 'Alice', age: 30 }
  items = ['a', 'b']

  template() {
    return (
      <div>
        <span>{this.user.name}</span>
        <span>{this.items.length} items</span>
        <Editor user={this.user} items={this.items} />
      </div>
    )
  }
}
```

```jsx
// editor.tsx
export default class Editor extends Component {
  rename() {
    this.props.user.name = 'Bob'   // updates Parent's DOM too
  }

  addItem() {
    this.props.items.push('c')     // updates Parent's DOM too
  }

  template({ user, items }) {
    return (
      <div>
        <span>{user.name}</span>
        <span>{items.length} items</span>
        <button click={this.rename}>Rename</button>
        <button click={this.addItem}>Add</button>
      </div>
    )
  }
}
```

### Primitives: One-Way

```jsx
// child reassigns a primitive prop
this.props.count = 99  // child DOM updates to 99, parent is unaffected

// when parent later updates its count, the new value flows down
// and overwrites the child's local reassignment
```

### Deep Nesting

The same rules apply at any depth. A grandchild or great-grandchild that receives the same object reference can mutate it, and every ancestor observing that data updates automatically.

### Summary

| Prop type | Direction | Behavior |
| --- | --- | --- |
| Primitive (number, string, boolean) | One-way (parent → child) | Child gets a copy; reassignment is local |
| Object | Two-way | Same proxy; mutations visible to both |
| Array | Two-way | Same proxy; `push`, `splice`, etc. visible to both |

No `emit`, no `v-model`, no callback wiring for object/array mutations. The framework respects JavaScript's native pass-by-value and pass-by-reference semantics.

---

## JSX Syntax

### Attributes

| Gea                                   | HTML equivalent      | Notes                                |
| --------------------------------------- | -------------------- | ------------------------------------ |
| `class="foo"`                           | `class="foo"`        | Use `class`, not `className`         |
| `class={\`btn ${active ? 'on' : ''}\`}` | Dynamic class        | Template literal for dynamic classes |
| `value={text}`                          | `value="..."`        | For input elements                   |
| `checked={bool}`                        | `checked`            | For checkboxes                       |
| `disabled={bool}`                       | `disabled`           | For buttons/inputs                   |
| `aria-label="Close"`                    | `aria-label="Close"` | ARIA attributes pass through         |

### Event Attributes

Both native-style (`click`, `change`) and React-style (`onClick`, `onChange`) event attribute names are supported. Native-style is preferred by convention.

```jsx
<button click={handleClick}>Click</button>
<input input={handleInput} />
<input change={handleChange} />
<input keydown={handleKeyDown} />
<input blur={handleBlur} />
<input focus={handleFocus} />
<span dblclick={handleDoubleClick}>Text</span>
```

Event handlers receive the native DOM event:

```jsx
const handleInput = e => {
  store.setName(e.target.value)
}
```

### Method References vs. Arrow Functions

In class components, you can pass a method reference directly instead of wrapping it in an arrow function. The compiler wires both forms to the event delegation system:

```jsx
// Method reference — shortest form for simple forwarding
<button click={this.increment}>+</button>

// Arrow function — use when passing arguments or composing logic
<button click={() => this.increment()}>+</button>
<button click={() => store.setFilter('all')}>All</button>
<button click={e => this.handleInput(e.target.value)}>Send</button>
```

Method references (`this.methodName`) are compiled to a direct entry in the events getter with no wrapper method, making them the most efficient form.

### Text Interpolation

```jsx
<span>{count}</span>
<span>{user.name}</span>
<span>{activeCount} {activeCount === 1 ? 'item' : 'items'} left</span>
```

### Style Objects

Gea supports inline style objects with camelCase property names (like React). The compiler handles them in two ways:

**Static style objects** — converted to CSS strings at compile time (zero runtime cost):

```jsx
<div style={{ backgroundColor: 'red', fontSize: '14px', fontWeight: 'bold' }}>
  Styled content
</div>
// Compiles to: <div style="background-color:red;font-size:14px;font-weight:bold">
```

**Dynamic style objects** — converted to `cssText` at runtime:

```jsx
<div style={{ color: this.textColor, opacity: this.isVisible ? 1 : 0 }}>
  Dynamic styling
</div>
```

**String styles** continue to work and are passed through as-is:

```jsx
<div style="color:red">Static string</div>
<div style={`width:${this.width}px`}>Dynamic string</div>
```

Property name conversion: `backgroundColor` → `background-color`, `fontSize` → `font-size`, `borderTopLeftRadius` → `border-top-left-radius`.

### `ref` Attribute

Use `ref` to obtain a direct reference to a DOM element after render. Assign it to a component property:

```jsx
export default class DrawingCanvas extends Component {
  canvasEl = null
  overlayEl = null

  template() {
    return (
      <div class="drawing-area">
        <canvas ref={this.canvasEl} width="800" height="600"></canvas>
        <div ref={this.overlayEl} class="overlay"></div>
      </div>
    )
  }

  onAfterRender() {
    const ctx = this.canvasEl.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 100, 100)
  }
}
```

**How it works:** The compiler replaces the `ref` attribute with a `data-gea-ref` marker attribute and generates a `__setupRefs()` method that uses `querySelector` to find the marked element and assign it to the component property. Refs are assigned after each render cycle, so they are available in `onAfterRender()`.

**Limitations:**
- `ref` works on HTML elements, not on component tags.
- The element must be a descendant of the component's root element (not the root element itself).

### Compiler Errors (Unsupported JSX Patterns)

The Gea compiler throws clear, descriptive errors at build time for JSX patterns it cannot compile. These errors appear in the Vite dev server console and include the tag name or expression that caused the issue.

| Pattern | Error message | Suggested fix |
| --- | --- | --- |
| `<div {...props} />` | `Spread attributes (<Tag {...expr} />) are not supported. Destructure props and pass them individually.` | Extract needed props and pass them as individual attributes. |
| `<MyComp />` (without import) | `Component <MyComp> is used in JSX but not found in imports.` | Add an `import MyComp from './my-comp'` statement. |
| `{() => <div />}` (function as child) | `Bare function expressions as JSX children are not supported. Use a named render prop attribute instead.` | Pass the function as a named prop: `renderItem={() => <div />}`. |
| `export function Foo() { return <div /> }` | `Named function/const exports that return JSX are not supported. Use export default.` | Change to `export default function Foo()`. |
| `<>{items.map(x => <Item key={x.id} />)}</>` | `Fragments (<>...</>) are not supported as the root of a .map() item.` | Wrap in a single root element: `<div>...</div>`. |

---

## Conditional Rendering

Use `&&` for conditional blocks:

```jsx
{
  step === 1 && <StepOne onContinue={() => store.setStep(2)} />
}
{
  step === 2 && <StepTwo onBack={() => store.setStep(1)} />
}
```

Use ternary for either/or:

```jsx
{
  !paymentComplete ? <PaymentForm onPay={handlePay} /> : <div class="success">Payment complete</div>
}
```

Conditional children are compiled into `<template>` markers with swap logic — no wasted DOM nodes when the condition is false.

---

## List Rendering

Use `.map()` with a `key` prop to render arrays:

```jsx
<ul>
  {todos.map(todo => (
    <TodoItem key={todo.id} todo={todo} onToggle={() => store.toggle(todo.id)} onRemove={() => store.remove(todo.id)} />
  ))}
</ul>
```

The `key` prop is required for efficient list diffing. Gea uses `applyListChanges` internally to handle add, delete, append, reorder, and swap operations without re-rendering the entire list.

By default the runtime uses `item.id` when available. You can use any property as the key:

```jsx
{options.map(option => (
  <li key={option.value}>{option.label}</li>
))}
```

When items are primitives, use the item itself:

```jsx
{tags.map(tag => (
  <span key={tag}>{tag}</span>
))}
```

Callbacks inside `.map()` use event delegation — the framework resolves which array item was targeted using `data-gea-item-id` attributes.

---

## Multiple Stores

### When to Split Stores

Split into multiple stores when:

- Different domains have independent state (auth vs. cart vs. UI preferences)
- A store's state and methods become large and unfocused
- Different parts of the app need different stores

Keep a single store when:

- The state is small and cohesive
- Everything relates to one feature (e.g., a todo list)

### Pattern: Domain-Specific Stores

```
src/
├── flight-store.ts      → navigation step, boarding pass
├── options-store.ts     → luggage, seat, meal selections
├── payment-store.ts     → payment form fields, completion status
└── flight-checkin.jsx   → root component reading all three stores
```

Each store:

```ts
// options-store.ts
import { Store } from '@geajs/core'

class OptionsStore extends Store {
  luggage = 'carry-on'
  seat = 'economy'
  meal = 'none'

  setLuggage(id: string): void {
    this.luggage = id
  }
  setSeat(id: string): void {
    this.seat = id
  }
  setMeal(id: string): void {
    this.meal = id
  }

  reset(): void {
    this.luggage = 'carry-on'
    this.seat = 'economy'
    this.meal = 'none'
  }

  get luggagePrice(): number {
    return LUGGAGE_OPTIONS.find(o => o.id === this.luggage)?.price ?? 0
  }
}

export default new OptionsStore()
```

### Pattern: Root Component Reads Multiple Stores

```jsx
import { Component } from '@geajs/core'
import flightStore from './flight-store'
import optionsStore from './options-store'
import paymentStore from './payment-store'

export default class FlightCheckin extends Component {
  template() {
    const { step } = flightStore
    const { luggage, seat, meal } = optionsStore
    const { paymentComplete } = paymentStore

    return (
      <div class="flight-checkin">
        {step === 1 && (
          <OptionStep
            selectedId={luggage}
            onSelect={id => optionsStore.setLuggage(id)}
            onContinue={() => flightStore.setStep(2)}
          />
        )}
        {step === 4 && (
          <SummaryStep
            luggagePrice={optionsStore.luggagePrice}
            paymentComplete={paymentComplete}
            onPay={paymentStore.processPayment}
          />
        )}
      </div>
    )
  }
}
```

---

## Store Composition

Stores can import and coordinate other stores:

```ts
import { Store } from '@geajs/core'
import optionsStore from './options-store'
import paymentStore from './payment-store'

class FlightStore extends Store {
  step = 1
  boardingPass = null

  setStep(step: number): void {
    this.step = step
    if (step === 5 && !this.boardingPass) {
      this.boardingPass = generateBoardingPass({
        passengerName: paymentStore.passengerName || 'JOHN DOE'
      })
    }
  }

  startOver(): void {
    this.step = 1
    this.boardingPass = null
    optionsStore.reset()
    paymentStore.reset()
  }
}

export default new FlightStore()
```

This lets one store orchestrate a workflow that spans multiple domains without coupling UI components to every store.

---

## Computed Values

Use **getters** on stores for derived state:

```ts
class TodoStore extends Store {
  todos: Todo[] = []
  filter: 'all' | 'active' | 'completed' = 'all'
  draft = ''

  get filteredTodos(): Todo[] {
    const { todos, filter } = this
    if (filter === 'active') return todos.filter(t => !t.done)
    if (filter === 'completed') return todos.filter(t => t.done)
    return todos
  }

  get activeCount(): number {
    return this.todos.filter(t => !t.done).length
  }

  get completedCount(): number {
    return this.todos.filter(t => t.done).length
  }
}
```

Getters are re-evaluated on every access. Since the Vite plugin tracks which property paths the template reads, changes to `todos` or `filter` will trigger a template update, which will re-call the getter and get the new computed value.

Getters are accessed directly on the store instance, e.g. `store.filteredTodos`.

---

## Router

Gea includes a built-in client-side router for single-page applications. The router is a `Store` — its properties are reactive.

### Import

```ts
import { Router, Outlet, Link, matchRoute } from '@geajs/core'
import type { RouteMap, RouteEntry, RouteGroupConfig, GuardFn, GuardResult } from '@geajs/core'
```

### Setup

Create a bare `Router` in `router.ts` (no view imports to avoid circular dependencies), then set routes from `App.tsx`:

```ts
// src/router.ts
import { Router } from '@geajs/core'
export const router = new Router()
```

```tsx
// src/App.tsx
import { router } from './router'
import AppShell from './views/AppShell'
import Dashboard from './views/Dashboard'

router.setRoutes({
  '/login': Login,
  '/': {
    layout: AppShell,
    guard: AuthGuard,
    children: {
      '/dashboard': Dashboard,
      '/settings': Settings,
      '/users/:id': UserProfile,
    },
  },
  '*': NotFound,
})
```

For simple apps without layouts/guards (no circular dependency risk), use `createRouter` directly in `router.ts` and render with `<RouterView router={router} />`:

```ts
import { createRouter } from '@geajs/core'
export const router = createRouter({ '/': Home, '/about': About } as const)
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

Route entry types:
- **Component** — render the component: `'/about': About`
- **String** — static redirect: `'/old': '/new'`
- **RedirectConfig** — full redirect control: `'/old/:id': { redirect: (params) => '/new/' + params.id, method: 'replace' }`
- **RouteGroupConfig** — layout + guard + children: `'/': { layout: AppShell, guard: AuthGuard, children: { ... } }`
- **Lazy** — code-split: `'/admin': () => import('./views/Admin')`

Options (for `createRouter` or `new Router(routes, options)`):
- `base` — URL base path (default: `''`)
- `scroll` — scroll to top on push, restore on back/forward (default: `false`)

### Router Properties

| Property  | Type                             | Description                                       |
| --------- | -------------------------------- | ------------------------------------------------- |
| `path`    | `string`                         | Current pathname (e.g. `'/users/42'`)             |
| `params`  | `Record<string, string>`        | Extracted route params (e.g. `{ id: '42' }`)      |
| `query`   | `Record<string, string\|string[]>` | Parsed query parameters                          |
| `hash`    | `string`                         | Current hash (e.g. `'#section'`)                  |
| `route`   | `string`                         | Matched route pattern                             |
| `matches` | `string[]`                       | Match chain patterns                              |
| `error`   | `string \| null`                 | Error message (lazy load failure, etc.)           |
| `page`    | `Component`                      | Resolved component (used internally by `RouterView`) |

### Router Methods

| Method              | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `setRoutes(routes)`  | Set or replace the route config and re-resolve the current URL.   |
| `push(target)`      | Push a new history entry.                                          |
| `navigate(target)`  | Alias for `push`.                                                  |
| `replace(target)`   | Replace the current history entry.                                 |
| `back()`            | Go back one entry.                                                 |
| `forward()`         | Go forward one entry.                                              |
| `go(delta)`         | Go forward/back by `delta` entries.                                |
| `isActive(path)`    | `true` if current path starts with `path`.                         |
| `isExact(path)`     | `true` if current path equals `path` exactly.                      |

```ts
router.push('/users/42?tab=posts#bio')
console.log(router.path)   // '/users/42'
console.log(router.params) // { id: '42' }
console.log(router.query)  // { tab: 'posts' }
console.log(router.hash)   // '#bio'
```

### Guards

Guards are synchronous functions on route groups. A guard checks store state and returns one of three values:

| Return      | Effect                                  |
| ----------- | --------------------------------------- |
| `true`      | Proceed to the route                    |
| `string`    | Redirect to that path                   |
| `Component` | Render it instead of the route          |

```ts
import authStore from './stores/auth-store'

const AuthGuard = () => {
  if (authStore.isAuthenticated) return true
  return '/login'
}
```

Apply to a route group:
```ts
'/': {
  layout: AppShell,
  guard: AuthGuard,
  children: {
    '/dashboard': Dashboard,
    '/settings': Settings,
  },
}
```

Guards on nested groups stack parent → child. Guards are intentionally synchronous — for async checks, use `created()` in the component.

### Layouts and `Outlet`

Layouts are components that receive a `page` prop — the resolved child component.

```tsx
export default class AppShell extends Component {
  template({ page }: any) {
    return (
      <div class="app">
        <nav>...</nav>
        <main>{page}</main>
      </div>
    )
  }
}
```

Use `<Outlet />` in the root App component to render the resolved route:

```tsx
import { Component, Outlet } from '@geajs/core'

export default class App extends Component {
  template() {
    return <Outlet />
  }
}
```

### Type Safety

When using `createRouter` (for simple apps without circular dependency), you can infer layout props:

```ts
import { createRouter, InferRouteProps } from '@geajs/core'

export const router = createRouter({ ... } as const)
export type RouteProps = InferRouteProps<typeof router>
```

```tsx
export default class AppShell extends Component<RouteProps['/']> {
  template({ page, params }) {
    // page and params are typed from the route config
  }
}
```

When using `new Router()` + `setRoutes()`, type the layout props manually since `setRoutes` doesn't preserve `as const`.

### `matchRoute(pattern, path)`

Pure function that tests a URL path against a route pattern and extracts named parameters.

**Parameters:**

| Param     | Type     | Description                              |
| --------- | -------- | ---------------------------------------- |
| `pattern` | `string` | Route pattern with optional `:param` and `*` segments. |
| `path`    | `string` | Actual URL pathname to match against.    |

**Returns:** `RouteMatch | null`

```ts
interface RouteMatch {
  path: string                    // the matched URL path
  pattern: string                 // the pattern that matched
  params: Record<string, string>  // extracted named parameters
}
```

**Pattern syntax:**

| Pattern              | Matches                          | Params                                            |
| -------------------- | -------------------------------- | ------------------------------------------------- |
| `/`                  | `/`                              | `{}`                                              |
| `/about`             | `/about`                         | `{}`                                              |
| `/users/:id`         | `/users/42`                      | `{ id: '42' }`                                    |
| `/users/:userId/posts/:postId` | `/users/7/posts/99` | `{ userId: '7', postId: '99' }`                   |
| `/files/*`           | `/files/docs/readme.md`          | `{ '*': 'docs/readme.md' }`                       |
| `/repo/:owner/*`     | `/repo/dashersw/src/index.ts`    | `{ owner: 'dashersw', '*': 'src/index.ts' }`     |

Param values are URI-decoded automatically. Wildcards match zero or more path segments.

### `RouterView`

Renders the current route. Use with a `router` prop for `createRouter` setups, or with an inline `routes` array for quick prototypes:

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

### `Link`

A component that renders an `<a>` tag for SPA navigation. Left-clicks call `router.push()` (or `router.replace()` with the `replace` prop) instead of triggering a full page reload. Modifier-key clicks, non-left-button clicks, and external URLs pass through to the browser.

**Props:**

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `to` | `string` | Yes | Target path |
| `label` | `string` | No | Text content (alternative to children) |
| `children` | `string` | No | Inner HTML: `<Link to="/about">About</Link>` |
| `class` | `string` | No | CSS class(es) for the `<a>` tag |
| `replace` | `boolean` | No | Use `router.replace()` instead of `router.push()` |
| `target` | `string` | No | Link target (e.g. `_blank`) |
| `rel` | `string` | No | Link relationship (e.g. `noopener`) |
| `onNavigate` | `(e: MouseEvent) => void` | No | Callback fired before SPA navigation |

**Usage:**

```jsx
<Link to="/about" label="About" />
<Link to="/about">About</Link>
<Link to="/users/1" class="nav-link">Alice</Link>
<Link to="/external" target="_blank" rel="noopener">Docs</Link>
```

**Behavior:**

- Renders `<a href="/about">About</a>` with a click handler that calls `router.push(to)`.
- Only intercepts left-clicks without modifier keys (Cmd, Ctrl, Shift, Alt). Modified clicks and non-left-button clicks pass through to the browser.
- The `href` attribute is always set, so right-click → "Open in new tab" works, and the URL is visible on hover.

### Full Example

```ts
// router.ts
import { Router } from '@geajs/core'
export const router = new Router()
```

```tsx
// App.tsx
import { Component, Outlet } from '@geajs/core'
import { router } from './router'
import AppShell from './views/AppShell'
import Home from './views/Home'
import About from './views/About'
import UserProfile from './views/UserProfile'

router.setRoutes({
  '/': {
    layout: AppShell,
    children: {
      '/': Home,
      '/about': About,
      '/users/:id': UserProfile,
    },
  },
})

export default class App extends Component {
  template() {
    return <Outlet />
  }
}
```

```tsx
// views/AppShell.tsx
import { Component, Link } from '@geajs/core'

export default class AppShell extends Component {
  template({ page }: any) {
    return (
      <div class="app">
        <nav>
          <Link to="/" label="Home" />
          <Link to="/about" label="About" />
          <Link to="/users/1" label="Alice" />
          <Link to="/users/2" label="Bob" />
        </nav>
        <main>{page}</main>
      </div>
    )
  }
}
```

```jsx
// views/Home.tsx
export default function Home() {
  return (
    <div class="view">
      <h1>Home</h1>
      <p>Welcome to the app.</p>
    </div>
  )
}
```

```jsx
// views/UserProfile.tsx
export default function UserProfile({ id }) {
  return <h1>User {id}</h1>
}
```

---

## Gea Mobile

### Import

```js
import { View, ViewManager, GestureHandler, Sidebar, TabView, NavBar, PullToRefresh, InfiniteScroll } from '@geajs/mobile'
```

### View

`View` extends `Component` with defaults suited for full-screen pages:

- Renders to `document.body` by default.
- Adds a `view` attribute to the root element for uniform CSS styling.
- Supports navigation transitions (`panIn`, `panOut`).

```jsx
import { View } from '@geajs/mobile'

class HomeView extends View {
  template() {
    return (
      <view>
        <h1>Welcome</h1>
        <p>This is the home screen.</p>
      </view>
    )
  }

  onActivation() {
    // Called when this view enters the viewport
  }
}

const home = new HomeView()
home.render() // renders to document.body
```

#### View Properties

| Property                      | Type      | Default | Description                             |
| ----------------------------- | --------- | ------- | --------------------------------------- |
| `index`                       | `number`  | `0`     | Z-axis position                         |
| `supportsBackGesture`         | `boolean` | `false` | Enable swipe-back gesture               |
| `backGestureTouchTargetWidth` | `number`  | `50`    | Touch area width in px for back gesture |
| `hasSidebar`                  | `boolean` | `false` | Allow sidebar reveal via swipe          |

#### View Lifecycle

| Method                  | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `onActivation()`        | Called when the view becomes the active view in a ViewManager |
| `panIn(isBeingPulled)`  | Animate the view into the viewport                            |
| `panOut(isBeingPulled)` | Animate the view out of the viewport                          |

#### Recommended CSS

```css
[view] {
  position: absolute;
  transition: transform 0.35s;
  z-index: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  overflow: hidden;
  -webkit-overflow-scrolling: touch;
}
```

### ViewManager

Manages a stack of `View` instances with iOS-style push/pull transitions.

```js
import { ViewManager } from '@geajs/mobile'

const vm = new ViewManager() // defaults to document.body
// or
const vm = new ViewManager(rootView) // use a View's element as root
```

#### Methods

| Method                             | Description                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `pull(view, canGoBack?)`           | Navigate to a new view. If `canGoBack` is true, the current view is pushed to history. |
| `push()`                           | Go back to the previous view in history.                                               |
| `setCurrentView(view, noDispose?)` | Set the active view without animation. Disposes history.                               |
| `canGoBack()`                      | Returns `true` if there are views in history.                                          |
| `toggleSidebar()`                  | Toggle the sidebar open/closed.                                                        |
| `getLastViewInHistory()`           | Returns the last view in the history stack.                                            |

#### Navigation Example

```js
const vm = new ViewManager()
const home = new HomeView()
const detail = new DetailView()

vm.setCurrentView(home)

// Navigate forward (user can go back)
vm.pull(detail, true)

// Navigate back
vm.push()
```

### GestureHandler

Registers gesture events with the `ComponentManager`. These events work via event delegation like all other events.

Supported gestures: `tap`, `longTap`, `swipeRight`, `swipeLeft`, `swipeUp`, `swipeDown`.

```jsx
class MyView extends View {
  template() {
    return (
      <view>
        <div swipeRight={this.onSwipeRight}>Swipe me</div>
      </view>
    )
  }
}
```

### UI Components

| Component        | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| `Sidebar`        | Slide-out navigation panel, integrated with ViewManager gestures |
| `TabView`        | Tab-based view switching                                         |
| `NavBar`         | Top navigation bar                                               |
| `PullToRefresh`  | Pull-down-to-refresh pattern                                     |
| `InfiniteScroll` | Load more content on scroll                                      |

---

## Drag and Drop

`@geajs/ui` provides a pointer-event-based DnD system. Import `dndManager` (singleton) or use the wrapper components.

### Data Attribute Approach

Add `data-draggable-id` to draggable elements and `data-droppable-id` to containers:

```tsx
import { dndManager } from '@geajs/ui'

export default class Board extends Component {
  created() {
    dndManager.onDragEnd = (result) => {
      store.moveItem(result.draggableId, result.destination.droppableId, result.destination.index)
    }
  }

  dispose() {
    dndManager.onDragEnd = null
    super.dispose()
  }

  template() {
    return (
      <div>
        <div data-droppable-id="column-1">
          {items.map(item => (
            <div key={item.id} data-draggable-id={item.id}>{item.title}</div>
          ))}
        </div>
      </div>
    )
  }
}
```

### Component Approach

```tsx
import { DragDropContext, Droppable, Draggable } from '@geajs/ui'

<DragDropContext onDragEnd={(r) => this.handleDragEnd(r)}>
  <Droppable droppableId="list">
    {items.map(item => (
      <Draggable key={item.id} draggableId={item.id}>{item.title}</Draggable>
    ))}
  </Droppable>
</DragDropContext>
```

### DragResult

```ts
interface DragResult {
  draggableId: string
  source: { droppableId: string; index: number }
  destination: { droppableId: string; index: number }
}
```

### Key behaviors

- 5px drag threshold before drag starts (clicks still work)
- Escape cancels the drag
- Animated placeholders show drop position
- Real DOM element is moved on drop
- Use `Store.silent()` when reordering store arrays in `onDragEnd` to avoid redundant DOM patches
- Style the placeholder with `.gea-dnd-placeholder`

---

## Project Setup

### Scaffolding a New Project

The fastest way to start a new project:

```bash
npm create gea@latest my-app
cd my-app
npm install
npm run dev
```

`create-gea` scaffolds a Vite + TypeScript project with:

- `vite.config.ts` with `geaPlugin()` pre-configured
- A sample store (`counter-store.ts`)
- A class component (`app.tsx`, `counter-panel.tsx`)
- A function component (`counter-note.tsx`)
- Entry point, HTML, styles, and TypeScript config

It detects your package manager (npm, pnpm, yarn, bun) and prints the correct commands.

### TypeScript Configuration

Add these settings to your `tsconfig.json` for full JSX type-checking (prop autocompletion, type errors, hover types) in any TypeScript-aware editor:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@geajs/core"
  }
}
```

Projects scaffolded with `create-gea` have this configured automatically.

### Manual Vite Configuration

```js
// vite.config.js
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'

export default defineConfig({
  plugins: [geaPlugin()]
})
```

The `@geajs/vite-plugin` plugin handles:

- JSX → HTML string compilation (no `createElement` at runtime)
- Reactive binding generation (`observe()` calls for each property path)
- Event delegation wiring (one global listener per event type)
- Function-to-class component conversion
- HMR support (preserves component state across edits)
- TypeScript `gea-env.d.ts` injection

### Entry Point

```js
// main.js
import App from './app.jsx'
import './styles.css'

const app = new App()
app.render(document.getElementById('app'))
```

### Package Dependencies

```json
{
  "dependencies": {
    "@geajs/core": "^1.0.0"
  },
  "devDependencies": {
    "vite": "^7.3.1",
    "@geajs/vite-plugin": "^1.0.0"
  }
}
```

For mobile apps using navigation and gestures, also add `@geajs/mobile`:

```json
{
  "dependencies": {
    "@geajs/core": "^1.0.0",
    "@geajs/mobile": "^1.0.0"
  }
}
```

### Monorepo Development

When developing within the gea monorepo, alias `@geajs/core` to the source for live reloading:

```js
// vite.config.js
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'
import path from 'path'

export default defineConfig({
  plugins: [geaPlugin()],
  resolve: {
    alias: {
      '@geajs/core': path.resolve(__dirname, '../../packages/gea/src')
    }
  }
})
```

---

## Best Practices Summary

1. **Export store singletons**, not classes: `export default new MyStore()`.
2. **Mutate properties directly** — the proxy handles reactivity.
3. **Use getters** for computed/derived values.
4. **Split stores by domain** when state grows beyond one concern.
5. **Use class components** for stateful or root-level components.
6. **Use function components** for stateless, prop-driven UI.
7. **Keep component state local** — editing flags, animation state, transient UI.
8. **Use `class`, not `className`** in JSX.
9. **Prefer lowercase event names** (`click`, `input`, `change`) — React-style (`onClick`, `onChange`) also works.
10. **Always provide `key`** on list items rendered with `.map()`.
11. **Pass callbacks as props** from root components down to children rather than importing stores in every component.
