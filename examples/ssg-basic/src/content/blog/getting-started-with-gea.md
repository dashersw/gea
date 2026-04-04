---
title: Getting Started with Gea
date: 2025-03-15
excerpt: Learn how to build reactive UIs with Gea — a compile-time JSX framework with no virtual DOM.
---

Gea is a lightweight reactive UI framework that compiles JSX at build time and uses proxy-based stores for surgical DOM updates. At **~13kb gzipped**, it delivers a fast, minimal footprint without a virtual DOM.

## Installation

```bash
npm create gea@latest my-app
```

## Your First Component

Components in Gea are class-based with a `template()` method that returns JSX:

```tsx
import { Component } from '@geajs/core'

export default class Hello extends Component {
  template() {
    return <h1>Hello, Gea!</h1>
  }
}
```

## Reactive Stores

Stores use JavaScript `Proxy` under the hood. When you mutate a property, only the DOM nodes that depend on it get updated — no diffing, no reconciliation:

```tsx
import { Store } from '@geajs/core'

const counter = new Store({ count: 0 })
counter.count++ // only the bound DOM node updates
```

Start building with `npm run dev` and enjoy instant HMR powered by Vite.
