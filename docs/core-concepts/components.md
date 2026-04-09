# Components

Gea has two component styles — class components and function components. Both compile to the same internal representation. The Vite plugin converts function components to class components at build time.

## Class Components

Extend `Component` and implement a `template()` method that returns JSX.

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

Use class components when you need:

- Local component state (reactive class fields)
- Lifecycle hooks (`created`, `onAfterRender`, `dispose`)
- Root/container components that read from stores

## Function Components

Export a default function that receives props and returns JSX.

```jsx
export default function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>
}
```

Use function components for:

- Stateless, presentational UI
- Components that receive all data and callbacks via props
- Leaf nodes in the component tree

## Component State

Class components inherit from `Store`, so they have their own reactive properties. This is separate from external stores and is used for transient UI concerns.

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
          input={e => (this.editText = e.target.value)}
          blur={this.commit}
          keydown={e => { if (e.key === 'Enter') this.commit() }}
        />
        <button click={onRemove}>x</button>
      </li>
    )
  }
}
```

### When to Use Component State vs Store State

```
Is this state shared across components?
├── YES → Put it in a Store
└── NO
    Is it derived from other state?
    ├── YES → Use a getter on the Store
    └── NO
        Is it purely local UI feedback (editing, hover, animation)?
        ├── YES → Put it in component state
        └── NO → Probably a Store
```

**Store state examples:** todo items, user session, cart contents, form data that persists across views.

**Component state examples:** whether an item is in edit mode, tooltip visibility, text in an edit field before committing.

## Lifecycle

| Method | When called |
| --- | --- |
| `created(props)` | After constructor, before render. Override for initialization logic. |
| `onAfterRender()` | After the component's DOM element is inserted and child components are mounted. |
| `onAfterRenderAsync()` | Called in the next `requestAnimationFrame` after render. |
| `dispose()` | Removes the component from the DOM, cleans up observers and child components. |

## Typed Props

Use `declare props` to define the shape of a component's props. This gives you full autocompletion and type-checking in any TypeScript-aware editor — no framework-specific plugin required.

```tsx
import { Component } from '@geajs/core'

export default class UserCard extends Component {
  declare props: {
    name: string
    email: string
    avatar?: string
    onSelect?: () => void
  }

  template({ name, email, avatar, onSelect }: this['props']) {
    return (
      <div class="user-card" click={onSelect}>
        <img src={avatar} alt={name} />
        <span>{name}</span>
        <span>{email}</span>
      </div>
    )
  }
}
```

Two things make this fully type-safe:

1. **`declare props`** — an ambient TypeScript declaration that tells the type checker the shape of the component's props without emitting any JavaScript. When another component writes `<UserCard`, the editor knows exactly which attributes are valid, which are required, and what types they expect.

2. **`: this['props']`** on the `template()` parameter — optional, but recommended for full type safety. It types the destructured props inside the method body, so `name` is `string`, `onSelect` is `(() => void) | undefined`, etc. Without it, the destructured variables default to `any`.

Function components get the same type-checking through their parameter type:

```tsx
export default function Badge({ label, count }: { label: string; count: number }) {
  return <span class="badge">{label}: {count}</span>
}
```

## Properties

| Property | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique component identifier (auto-generated) |
| `el` | `HTMLElement` | The root DOM element. Created lazily from `template()`. |
| `props` | (typed via `declare props`) | Properties passed to the component |
| (reactive properties) | `any` | Reactive properties live directly on the instance (inherited from `Store`) |
| `rendered` | `boolean` | Whether the component has been rendered to the DOM |

## DOM Helpers

| Method | Description |
| --- | --- |
| `$(selector)` | First matching descendant element (scoped `querySelector`) |
| `$$(selector)` | All matching descendants as an array (scoped `querySelectorAll`) |

## `ref` Attribute

Use `ref` on a JSX element to get a direct reference to its DOM node:

```jsx
export default class VideoPlayer extends Component {
  videoEl = null

  template() {
    return (
      <div class="player">
        <video ref={this.videoEl} src={this.props.src}></video>
        <button click={() => this.videoEl.play()}>Play</button>
      </div>
    )
  }
}
```

The element is assigned to the component property after render. Use `onAfterRender()` for initialization that needs the DOM node. For the component's root element, use `this.el` instead.

## Rendering

```ts
const app = new App()
app.render(document.getElementById('app'))
```

The `render(rootEl, index?)` method inserts the component's DOM element into the given parent. Components render once — subsequent state changes trigger surgical DOM patches, not full re-renders.

## Composing Components

A root component reads from stores and passes data down as props to children:

```jsx
import { Component } from '@geajs/core'
import todoStore from './todo-store'
import TodoInput from './TodoInput'
import TodoItem from './TodoItem'

export default class App extends Component {
  template() {
    const { draft } = todoStore
    const todos = todoStore.filteredTodos

    return (
      <div class="todo-app">
        <TodoInput
          draft={draft}
          onDraftChange={e => (todoStore.draft = e.target.value)}
          onAdd={() => todoStore.add()}
        />
        <ul>
          {todos.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => todoStore.toggle(todo.id)}
              onRemove={() => todoStore.remove(todo.id)}
            />
          ))}
        </ul>
      </div>
    )
  }
}
```

Pass callbacks as props from root components down to children rather than importing stores in every component.

### Passing components as props

Pass components as props to build layouts with multiple named regions — the same idea other frameworks call “named slots,” without a separate API.

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

## Props and Data Flow

Gea's props follow standard JavaScript semantics. There are no framework-invented concepts like `emit`, `v-model`, or callback-based state lifting for parent-child communication. When a parent passes data to a child, it works exactly like passing arguments to a function:

- **Primitives** (numbers, strings, booleans) are passed **by value**. The child gets a copy. Reassigning the prop in the child does not affect the parent.
- **Objects and arrays** are passed **by reference**. The child gets the same reactive proxy the parent holds. Mutating properties on the object or calling array methods in the child updates the parent's state and DOM automatically — because it's the same object.

### Objects and Arrays: Two-Way by Nature

When a parent passes a reactive object or array as a prop, the child receives the parent's proxy directly. Any mutation the child makes is visible to the parent — and to every other component observing that data.

```jsx
// parent.tsx
import { Component } from '@geajs/core'

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
// editor.tsx — a class component that mutates the parent's data
import { Component } from '@geajs/core'

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

Clicking "Rename" updates `user.name` on the shared proxy. Both the parent's `<span>` and the child's `<span>` update. No callbacks, no events, no indirection.

### Primitives: One-Way, Like JavaScript

Primitive props (numbers, strings, booleans) are copied on assignment. If the child reassigns a primitive prop, only the child's local view of that prop changes — the parent is unaffected.

```jsx
// counter-display.tsx
import { Component } from '@geajs/core'

export default class CounterDisplay extends Component {
  template({ count }) {
    return <span>{count}</span>
  }
}
```

If a parent passes `count={this.count}` and the child does `this.props.count = 99`, the child's DOM updates to show `99`, but the parent's state is unchanged. This is standard pass-by-value behavior — the same thing that happens when you reassign a function parameter in plain JavaScript.

When the parent later updates `this.count`, the new value flows down to the child, overwriting the child's local reassignment.

### Deep Nesting

The same rules apply at any depth. A grandchild or great-grandchild that receives the same object reference can mutate it, and the change propagates to every ancestor that observes it:

```jsx
// grandparent passes `config` to parent, parent passes it to child
// child mutates config.theme = 'dark'
// grandparent's DOM updates — same proxy all the way through
```

There is no prop drilling penalty for objects and arrays. As long as the same reference is passed down, reactivity is preserved across the entire component tree.

### Comparison with Other Frameworks

| Concern | React | Vue | Gea |
| --- | --- | --- | --- |
| Parent → child (primitives) | Props (one-way) | Props (one-way) | Props (one-way, JS pass-by-value) |
| Parent → child (objects) | Props (one-way, immutable by convention) | Props (one-way by convention, `emit` to update) | Props (two-way — same proxy reference) |
| Child → parent (objects) | Callback props | `emit` + `v-model` / `defineModel` | Direct mutation on the shared proxy |
| Child → parent (primitives) | Callback props | `emit` + `v-model` | Not possible — JS pass-by-value |

Gea doesn't introduce a new data flow model. It uses the one JavaScript already has.
