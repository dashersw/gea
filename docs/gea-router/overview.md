# Gea Router

A store-based router for Gea. Routes are a plain configuration object. The router is a Store. Navigation is method calls. No providers, no hooks, no context.

## Philosophy

**The router is a Store.** It holds reactive properties — `path`, `params`, `query`, `page` — just like any other Gea store. Components read from it directly. The Vite plugin handles reactivity. There is nothing new to learn.

**Routes are just JavaScript.** The route config is a plain object you pass to `createRouter`. Layouts are components. Guards are functions. Lazy routes are dynamic imports. No file-system conventions, no decorators, no generated code.

**Flat by default, nested when needed.** Most apps need a handful of flat routes. When you need shared layouts or grouped guards, nest them. The config stays readable either way.

## Quick Example

```ts
// router.ts
import { createRouter } from '@geajs/core'
import Home from './views/Home'
import About from './views/About'
import Projects from './views/Projects'
import Project from './views/Project'
import NotFound from './views/NotFound'

export const router = createRouter({
  '/': Home,
  '/about': About,
  '/projects': Projects,
  '/projects/:id': Project,
  '*': NotFound,
} as const)
```

```tsx
// App.tsx
import { Component, RouterView } from '@geajs/core'
import { router } from './router'

export default class App extends Component {
  template() {
    return <RouterView router={router} />
  }
}
```

```tsx
// views/Project.tsx
import { Component } from '@geajs/core'
import { Link } from '@geajs/core'
import projectStore from '../stores/project-store'

export default class Project extends Component {
  created({ id }) {
    projectStore.fetch(id)
  }

  template({ id }) {
    const { project, isLoading } = projectStore
    if (isLoading) return <div>Loading...</div>

    return (
      <div>
        <h1>{project.name}</h1>
        <Link to={`/projects/${id}/edit`}>Edit</Link>
      </div>
    )
  }
}
```

Five routes, one Store, zero ceremony. The `App` component uses `RouterView` to render the matched route. Route components receive params as props. Navigation uses `Link` or `router.push()`.

## Router Properties

The router exposes these reactive properties:

| Property | Type | Description |
|---|---|---|
| `path` | `string` | Current URL path |
| `route` | `string` | Matched route pattern |
| `params` | `Record<string, string>` | Extracted path params |
| `query` | `Record<string, string \| string[]>` | Parsed query params |
| `hash` | `string` | Hash without `#` |
| `matches` | `string[]` | Full match chain from root to leaf |
| `error` | `string \| null` | Runtime error (lazy load failure, guard error) |
| `page` | `Component` | Resolved component for current route (used internally by `RouterView`) |

Read them anywhere — templates, methods, other stores. They update reactively like any store property. To render the current route, use `<RouterView router={router} />` rather than reading `router.page` directly.
