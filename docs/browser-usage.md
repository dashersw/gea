# Browser Usage (No Build Step)

Gea can be used directly in the browser without any build tools, bundlers, or package managers. Load the runtime from a CDN and start writing components in a plain `<script>` tag.

The browser bundle is **20 KB gzipped** and includes everything: `Store`, `Component`, `Router`, event delegation, and list reconciliation.

## Quick Start

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <script src="https://unpkg.com/@geajs/core/dist/gea.js"></script>
</head>
<body>
  <div id="app"></div>

  <script>
    const { Store, Component, GEA_OBSERVER_REMOVERS } = gea

    class CounterStore extends Store {
      count = 0
      increment() { this.count++ }
      decrement() { this.count-- }
    }

    const store = new CounterStore()

    class Counter extends Component {
      template() {
        return `
          <div id="${this.id}">
            <h1>${store.count}</h1>
            <button class="inc">+</button>
            <button class="dec">-</button>
          </div>
        `
      }

      createdHooks() {
        this[GEA_OBSERVER_REMOVERS].push(
          store.observe('count', () => {
            this.$('h1').textContent = store.count
          })
        )
      }

      get events() {
        return {
          click: {
            '.inc': () => store.increment(),
            '.dec': () => store.decrement(),
          },
        }
      }
    }

    new Counter().render(document.getElementById('app'))
  </script>
</body>
</html>
```

That's it. No npm, no Vite, no TypeScript — open it in a browser and it works.

## Core Concepts

The browser API uses four concepts, all plain JavaScript:

### 1. Stores

Exactly the same as the compiled version. Extend `Store`, declare class fields, add methods. The proxy-based reactivity system works identically.

```js
class TodoStore extends Store {
  todos = []
  filter = 'all'

  add(text) {
    this.todos.push({ id: Date.now(), text, done: false })
  }

  toggle(id) {
    const todo = this.todos.find(t => t.id == id)
    todo.done = !todo.done
  }

  get activeTodos() {
    return this.todos.filter(t => !t.done)
  }
}

const store = new TodoStore()
```

Getters are computed values that re-evaluate automatically. Array mutations (`push`, `pop`, `splice`, etc.) are intercepted and produce fine-grained change events.

### 2. Templates

The `template()` method returns an HTML string. Use JavaScript template literals with `${}` for dynamic values.

**Important:** The root element must include `id="${this.id}"`. This is how Gea's event delegation finds the component that owns each DOM element.

```js
class MyComponent extends Component {
  template() {
    return `
      <div id="${this.id}">
        <h1>${store.title}</h1>
        <ul>
          ${store.items.map(item => `
            <li data-id="${item.id}">${item.name}</li>
          `).join('')}
        </ul>
      </div>
    `
  }
}
```

### 3. Reactivity with `observe()`

In the compiled JSX path, the Vite plugin statically analyzes your templates and generates surgical DOM updates automatically. In the browser path, you write these subscriptions manually using `store.observe()`.

`observe(path, handler)` watches a property path on a store and calls the handler whenever it changes. It returns an unsubscribe function.

```js
createdHooks() {
  this[GEA_OBSERVER_REMOVERS].push(
    store.observe('todos', () => {
      this.$('.todo-list').innerHTML = this.renderItems()
      this.$('.count').textContent = store.activeTodos.length
    }),
    store.observe('filter', () => {
      this.$('.todo-list').innerHTML = this.renderItems()
    })
  )
}
```

Push the unsubscribe functions into `this[GEA_OBSERVER_REMOVERS]` so they are automatically cleaned up when the component is disposed.

`this.$()` and `this.$$()` are built-in selectors that query within the component's root element — equivalent to `this.el.querySelector()` and `this.el.querySelectorAll()`.

### 4. Events with `get events()`

Define a `get events()` getter that returns an object mapping event types to selector-handler pairs. Gea's `ComponentManager` handles delegation at the document level — no manual `addEventListener` or cleanup needed.

```js
get events() {
  return {
    click: {
      '.add-btn': () => store.add(this.$('.input').value),
      '.remove-btn': (e) => store.remove(e.target.dataset.id),
    },
    input: {
      '.search': (e) => { store.query = e.target.value },
    },
    keydown: {
      '.input': (e) => { if (e.key === 'Enter') store.add(e.target.value) },
    },
  }
}
```

Event handlers receive the native DOM event. Use `data-*` attributes on elements to pass identifiers to handlers, then read them from `e.target.dataset`.

## Adding JSX

You can use JSX in the browser by adding [Babel Standalone](https://babeljs.io/docs/babel-standalone). This compiles `<script type="text/babel">` tags in the browser at runtime.

```html
<head>
  <script src="https://unpkg.com/@geajs/core/dist/gea.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="app"></div>

  <script type="text/babel" data-presets="react">
    /** @jsxRuntime classic */
    /** @jsx gea.h */

    const { Store, Component, GEA_OBSERVER_REMOVERS } = gea

    class Counter extends Component {
      template() {
        return (
          <div id={this.id}>
            <h1>{store.count}</h1>
            <button class="inc">+</button>
            <button class="dec">-</button>
          </div>
        )
      }
    }
  </script>
</body>
```

### The two required pragma lines

These two comment lines at the top of the `<script type="text/babel">` block are **required** — JSX will not work without them:

```js
/** @jsxRuntime classic */
/** @jsx gea.h */
```

- **`@jsxRuntime classic`** tells Babel to use the classic JSX transform, which compiles `<div>` into function calls like `h("div", ...)` instead of the newer automatic transform that imports from `react/jsx-runtime`.
- **`@jsx gea.h`** tells Babel to use `gea.h` as the JSX factory function instead of the default `React.createElement`. The `gea.h` function is built into the runtime — it takes a tag name, props, and children, and returns an HTML string, which is exactly what Gea's `template()` method expects.

Without these two lines, Babel will try to call `React.createElement`, which doesn't exist and doesn't return HTML strings.

### How `gea.h` works

`gea.h` is a simple function that converts JSX calls into HTML strings:

```js
// Babel compiles this JSX:
<button class="add-btn" data-id={todo.id}>Add</button>

// Into this function call:
gea.h("button", { class: "add-btn", "data-id": todo.id }, "Add")

// Which returns this string:
'<button class="add-btn" data-id="42">Add</button>'
```

This means JSX in the browser path is syntactic sugar over template literals. The `template()` method still returns a string — JSX just makes it look cleaner.

### Trade-offs

Babel Standalone adds **~200 KB gzipped** to the page. This is fine for prototyping and learning, but for production you should use the [Vite plugin](tooling/vite-plugin.md) which compiles JSX at build time and adds automatic reactivity wiring.

| | Browser (no build) | Browser + Babel | Vite (compiled) |
|---|---|---|---|
| Bundle size | 20 KB | ~220 KB | ~15 KB + your app |
| JSX | No (template literals) | Yes | Yes |
| Automatic reactivity | No (manual `observe()`) | No (manual `observe()`) | Yes (compiler-generated) |
| Build step | None | None | Vite |
| Best for | Production widgets, learning | Prototyping, playgrounds | Production apps |

## Compared to the Compiled Path

In the compiled Vite path, you write JSX and the compiler does the rest — it analyzes which store properties each DOM element depends on and generates the `observe()` subscriptions for you. In the browser path, you write those subscriptions by hand.

The store, component lifecycle, event delegation, `this.$()` / `this.$$()` selectors, and child component mounting all work identically in both paths. The only difference is who writes the reactivity glue — you or the compiler.

## Full Example

See the complete working examples in the repository:

- [`examples/runtime-only/`](https://github.com/dashersw/gea/tree/main/examples/runtime-only) — Template literals, no build step
- [`examples/runtime-only-jsx/`](https://github.com/dashersw/gea/tree/main/examples/runtime-only-jsx) — JSX with Babel Standalone, no build step

In the monorepo, `npx vite dev` for those folders serves **`/vendor/gea.js`** from the built IIFE bundle at `packages/gea/dist/gea.js` (run `npm run build -w @geajs/core` first) and **`/vendor/babel.min.js`** from the pinned file in [`tests/e2e/vendor/babel.min.js`](https://github.com/dashersw/gea/tree/main/tests/e2e/vendor). For a standalone HTML file outside the repo, keep using the unpkg script URLs from the quick start above.

