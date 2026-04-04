---
title: Reactive Stores Deep Dive
date: 2025-03-05
excerpt: How Gea's proxy-based stores track changes and trigger surgical DOM updates.
---

Gea stores use JavaScript `Proxy` to intercept property access and mutations. When a store property changes, only the DOM nodes that depend on that specific property are updated.

## The Proxy Pattern

Every `Store` instance wraps its data in a `Proxy`:

```tsx
import { Store } from '@geajs/core'

class AppState extends Store {
  count = 0
  name = 'World'
}

const state = new AppState()
```

When you access `state.count` inside a `template()`, Gea records the dependency. When `state.count` changes, only that specific binding updates.

## No Virtual DOM

Unlike React or Vue, Gea doesn't diff a virtual tree. The compile-time JSX transform generates direct DOM update instructions:

- **React**: render → diff → patch
- **Gea**: store change → update bound node

This means updates are `O(1)` per changed property, not `O(n)` where n is the tree size.

## Nested Objects

Stores support deep reactivity. Nested objects and arrays are automatically wrapped in proxies:

```tsx
class TodoStore extends Store {
  todos = [
    { text: 'Learn Gea', done: false },
    { text: 'Build an app', done: false },
  ]
}

const store = new TodoStore()
store.todos[0].done = true // triggers update
```

## Observer Pattern

Under the hood, each property maintains an observer tree. Components subscribe during rendering and unsubscribe on disposal — no memory leaks.
