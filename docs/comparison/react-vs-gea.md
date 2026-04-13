# React vs Gea

This is a technical comparison for developers evaluating Gea who already know React. Both are component-based JavaScript UI libraries with JSX support, but they take fundamentally different approaches to rendering and state management.

## Architecture

### React

React uses a **virtual DOM**. When state changes, React re-executes your component function (or `render()` method), produces a new virtual DOM tree, diffs it against the previous tree, and applies the minimal set of real DOM mutations. This diffing step happens at runtime on every update.

### Gea

Gea uses **compile-time analysis**. The Vite plugin inspects your JSX at build time, identifies which DOM nodes depend on which state paths, and generates targeted `observe()` calls that patch only those specific nodes when the underlying state changes. There is no virtual DOM, no tree diffing, and no full component re-execution on updates.

**Practical impact:** In React, your entire component function runs on every state change — every variable is re-declared, every expression re-evaluated. In Gea, only the specific DOM patch functions run. For large component trees, this can mean significantly less work per update.

## State Management

### React

React offers several state primitives:

```jsx
// Local state
const [count, setCount] = useState(0)

// Reducers
const [state, dispatch] = useReducer(reducer, initialState)

// Context for sharing state
const ThemeContext = createContext('light')

// External libraries for complex cases
// Redux, Zustand, Jotai, MobX, etc.
```

State updates are **explicit** — you call `setState` or a dispatch function. Forgetting to call the setter means the UI doesn't update.

### Gea

Gea uses **proxy-based stores**:

```ts
import { Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0
  increment() { this.count++ }
}

export default new CounterStore()
```

State updates are **implicit** — mutate the state directly and the proxy tracks it. No setter functions, no dispatch calls, no action creators. Multiple mutations in the same method are batched into a single update via `queueMicrotask`.

### Comparison Table

| Concern | React | Gea |
| --- | --- | --- |
| Local component state | `useState`, `useReducer` | Reactive class fields on class component |
| Shared state | Context, Redux, Zustand, etc. | Store singletons |
| Derived state | `useMemo` | Getters on Store |
| State update syntax | `setState(newValue)` | `this.prop = newValue` |
| Batching | Automatic in event handlers (React 18+) | Always, via `queueMicrotask` |
| Immutability | Required (new references) | Not needed (proxy detects mutations) |

## Component Model

### React

React favors **function components** with hooks:

```jsx
function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <span>{count}</span>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  )
}
```

Hooks have rules: they must be called at the top level, in the same order, and cannot be conditional. This leads to patterns like the dependency array in `useEffect`, `useMemo`, and `useCallback` — a common source of bugs.

### Gea

Gea supports **class components** and **function components**:

```jsx
// Class component — for stateful logic
export default class Counter extends Component {
  template() {
    return (
      <div>
        <span>{counterStore.count}</span>
        <button click={counterStore.increment}>+</button>
      </div>
    )
  }
}

// Function component — for presentational UI
export default function Display({ count }) {
  return <span>{count}</span>
}
```

There are no hooks, no dependency arrays, and no rules about call order. State is managed externally in stores or locally as class component properties. The Vite plugin converts function components to classes at build time.

## JSX Differences

Side-by-side for the same counter:

### React

```jsx
function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div className="counter">
      <span>{count}</span>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <button onClick={() => setCount(c => c - 1)}>-</button>
    </div>
  )
}
```

### Gea

```jsx
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

| Feature | React | Gea |
| --- | --- | --- |
| CSS classes | `className` | `class` |
| Click handler | `onClick` | `click` or `onClick` |
| Input handler | `onChange` | `input` or `change` (also `onInput`, `onChange`) |
| Key events | `onKeyDown` | `keydown` or `onKeyDown` |
| Focus events | `onBlur`, `onFocus` | `blur`, `focus` (also `onBlur`, `onFocus`) |

Gea supports both native-style (`click`, `change`) and React-style (`onClick`, `onChange`) event names. Native-style is preferred by convention and is closer to standard HTML.

## Side-by-Side: Todo List

### React

```jsx
function TodoApp() {
  const [todos, setTodos] = useState([])
  const [draft, setDraft] = useState('')

  const add = () => {
    if (!draft.trim()) return
    setTodos([...todos, { id: Date.now(), text: draft, done: false }])
    setDraft('')
  }

  const toggle = (id) => {
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  const remove = (id) => {
    setTodos(todos.filter(t => t.id !== id))
  }

  return (
    <div>
      <input value={draft} onChange={e => setDraft(e.target.value)} />
      <button onClick={add}>Add</button>
      <ul>
        {todos.map(todo => (
          <li key={todo.id}>
            <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} />
            <span>{todo.text}</span>
            <button onClick={() => remove(todo.id)}>x</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Gea

```ts
// todo-store.ts
import { Store } from '@geajs/core'

class TodoStore extends Store {
  todos = []
  draft = ''

  add() {
    if (!this.draft.trim()) return
    this.todos.push({
      id: Date.now(), text: this.draft, done: false
    })
    this.draft = ''
  }

  toggle(id) {
    const todo = this.todos.find(t => t.id === id)
    if (todo) todo.done = !todo.done
  }

  remove(id) {
    this.todos = this.todos.filter(t => t.id !== id)
  }
}

export default new TodoStore()
```

```jsx
// app.tsx
import { Component } from '@geajs/core'
import store from './todo-store'

export default class TodoApp extends Component {
  template() {
    const { todos, draft } = store
    return (
      <div>
        <input value={draft} input={e => (store.draft = e.target.value)} />
        <button click={store.add}>Add</button>
        <ul>
          {todos.map(todo => (
            <li key={todo.id}>
              <input type="checkbox" checked={todo.done} change={() => store.toggle(todo.id)} />
              <span>{todo.text}</span>
              <button click={() => store.remove(todo.id)}>x</button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
}
```

The Gea version separates state logic into a store, mutates state directly, and uses lowercase event attributes.

## Props and Data Flow

### React

React enforces **strict one-way data flow**. Props are immutable — a child cannot modify them. To communicate changes upward, you pass callback functions as props:

```jsx
function Parent() {
  const [user, setUser] = useState({ name: 'Alice', age: 30 })

  return <Editor user={user} onRename={name => setUser({ ...user, name })} />
}

function Editor({ user, onRename }) {
  return (
    <div>
      <span>{user.name}</span>
      <button onClick={() => onRename('Bob')}>Rename</button>
    </div>
  )
}
```

Every upward communication path requires an explicit callback prop. With deep component trees, this leads to "prop drilling" — passing callbacks through intermediate components that don't use them.

### Gea

Gea's props follow **JavaScript's native value semantics**:

- **Primitives** (numbers, strings, booleans) are one-way — the child gets a copy.
- **Objects and arrays** are two-way — the child gets the same reactive proxy the parent holds. Mutating the object in the child updates the parent's DOM automatically.

```jsx
// parent.tsx
export default class Parent extends Component {
  user = { name: 'Alice', age: 30 }

  template() {
    return (
      <div>
        <span>{this.user.name}</span>
        <Editor user={this.user} />
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

  template({ user }) {
    return (
      <div>
        <span>{user.name}</span>
        <button click={this.rename}>Rename</button>
      </div>
    )
  }
}
```

No callback prop, no state setter, no spread operator to create a new object. The child mutates the shared proxy and every component observing `user.name` updates.

This works identically to passing an object to a JavaScript function — if the function mutates it, the caller sees the change. Gea doesn't add a layer of indirection on top of this; it respects the language's native behavior.

### Comparison Table

| Concern | React | Gea |
| --- | --- | --- |
| Primitive props | One-way (immutable) | One-way (JS pass-by-value) |
| Object/array props | One-way (immutable by convention) | Two-way (same proxy reference) |
| Child → parent communication | Callback props | Direct mutation on shared proxy |
| Deep nesting | Prop drilling or Context | Same object reference at any depth |

## Bundle Size

| Stack | Compressed size | Includes |
| --- | --- | --- |
| React 19.2.5 + React DOM 19.2.5 hello world | 50.8 kb brotli | Rendering + minimal mount |
| React 19.2.5 + React DOM 19.2.5 todo app | 51.5 kb brotli JS / 52.3 kb brotli total | Interactive todo + identical CSS |
| React 19 + ReactDOM + React Router 7 + Zustand 5 | **~74 kb** | Rendering + state + routing |
| Gea 1.3.0 hello world | **121 B brotli** | Compiled DOM creation |
| Gea 1.3.0 todo app | **4.9 kb brotli JS / 5.6 kb brotli total** | Interactive todo + identical CSS |
| Gea hello world + router | **~7.3 kb** | Compiled output + routing |

In a fresh Vite 8.0.10 production hello-world build, React + React DOM ships 50.8 kb of brotli JavaScript. Gea ships 121 B because the compiler emits direct DOM creation and the framework runtime disappears from the bundle. In an equivalent interactive todo app with reactive state, input handling, filtering, item updates, and identical CSS, Gea ships 4.9 kb of brotli JavaScript while React ships 51.5 kb. A real-world React app usually starts by adding a router and a state manager; with React Router and Zustand, that moves the React stack to ~74 kb gzipped. Gea's useful baseline is not "how big is the framework?" but "what did this app actually use?"

## Event Handling

React attaches a synthetic event system that normalizes browser differences and delegates at the root. Gea also uses event delegation (one listener per event type on `document.body`) but passes through native DOM events directly — no synthetic wrapper.

## Learning Curve and Philosophy

The philosophical difference runs deeper than the API. React introduced hooks as a new programming model — they have rules (call order, top-level only), mental models (closures capturing stale state, dependency arrays), and optimization patterns (`React.memo`, `useMemo`, `useCallback`) that exist only because of how React works internally. Learning React means learning these framework-specific concepts on top of JavaScript.

Gea's position is that JavaScript code should be simple, understandable, and free of framework-invented concepts. A store is a class with state and methods — standard OOP. A component is a class with a `template()` method. A function component is a plain function. Computed values are getters. There are no signals, no hooks, no dependency arrays, and no rules that exist only because of the framework's internal machinery. The "magic" that makes everything reactive lives entirely in the build step — invisible to the developer.

### React concepts to learn
- Hooks (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, `useContext`, custom hooks)
- Rules of hooks (call order, top-level only, dependency arrays)
- Closures and stale state in effects
- Re-render optimization (`React.memo`, `useMemo`, `useCallback`)
- Key prop for lists
- Context API or external state libraries
- Concurrent features (Suspense, transitions, Server Components)

### Gea concepts to learn
- Store class with reactive properties and methods
- Class components with `template()`
- Function components
- Props follow JS semantics: objects are two-way (shared proxy), primitives are one-way (copy)
- `class` instead of `className`, lowercase events
- `key` prop for lists
- Lifecycle hooks (`created`, `onAfterRender`, `dispose`)

Gea has a deliberately smaller API surface. Every concept in the list above maps directly to a JavaScript language feature. There are no hooks, no dependency arrays, no effect cleanup, and no concurrent mode to reason about.

## Ecosystem

React has a massive ecosystem: React Router, Next.js, Remix, React Native, thousands of component libraries, and a huge community. If you need an off-the-shelf solution for almost anything, React likely has it.

Gea is lean and focused. It provides the core framework, a UI kit for mobile apps, a Vite plugin, and a scaffolder. It's best suited for projects where you want minimal overhead and are comfortable building with a smaller toolkit.

## When to Choose Which

**Choose React when:**
- You need a large ecosystem of third-party libraries and components
- You're building a large team project and want abundant hiring/training resources
- You need server-side rendering, static generation, or React Server Components
- You're building for React Native (mobile native)

**Choose Gea when:**
- You believe JavaScript code should be simple, readable, and free of framework-specific abstractions
- You want the smallest possible runtime overhead
- You prefer direct state mutation over immutable update patterns
- You don't want to learn signals, hooks, dependency arrays, or other invented primitives — just classes, functions, and getters
- You're building mobile web apps and want built-in navigation, gestures, and view management
- You value compile-time optimization over runtime flexibility
