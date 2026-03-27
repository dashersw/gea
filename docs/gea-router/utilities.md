# Utilities

Lower-level router primitives. Most apps use `createRouter` with `RouterView` — these are available when you need more control.

## RouterView

`RouterView` is a component that renders the current route. It connects to a router instance and swaps components as the URL changes.

```tsx
import { Component, RouterView } from '@geajs/core'
import { router } from './router'

export default class App extends Component {
  template() {
    return (
      <div class="app">
        <nav>...</nav>
        <RouterView router={router} />
      </div>
    )
  }
}
```

`RouterView` renders the component at depth 0 of the router's layout chain. It observes `path`, `error`, and `query` and re-renders when they change.

### Inline Routes

You can pass routes directly to `RouterView` instead of using `createRouter`. This uses the singleton router under the hood.

```tsx
import { Component, RouterView } from '@geajs/core'
import Home from './views/Home'
import About from './views/About'
import UserProfile from './views/UserProfile'

export default class App extends Component {
  template() {
    return (
      <div class="app">
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

Routes are matched in array order — the first match wins. Matched params (e.g. `{ id: '42' }`) are passed as props to the component.

## Outlet

`Outlet` renders nested layout children. It automatically determines its depth by walking up the component tree to find the nearest parent `RouterView` or `Outlet`.

```tsx
import { Component, Outlet } from '@geajs/core'

export default class DashboardLayout extends Component {
  template() {
    return (
      <div class="dashboard">
        <nav>...</nav>
        <main>
          <Outlet />
        </main>
      </div>
    )
  }
}
```

Use `Outlet` when you need explicit control over where nested route content appears. In most cases, the `page` prop on layout components (see [Layouts](layouts.md)) is simpler.

## matchRoute

A standalone utility for matching a URL path against a route pattern. Returns the matched params or `null`.

```ts
import { matchRoute } from '@geajs/core'

const result = matchRoute('/users/:id', '/users/42')
// { pattern: '/users/:id', params: { id: '42' } }

const noMatch = matchRoute('/users/:id', '/about')
// null
```

### Use Cases

**Conditional rendering** — match routes manually in templates:

```tsx
import { Component } from '@geajs/core'
import { router, matchRoute } from '@geajs/core'

export default class App extends Component {
  template() {
    const path = router.path
    const userMatch = matchRoute('/users/:id', path)
    return (
      <div>
        {path === '/' && <Home />}
        {path === '/about' && <About />}
        {userMatch && <UserProfile id={userMatch.params.id} />}
      </div>
    )
  }
}
```

**Outside routing** — use pattern matching for non-routing purposes like URL parsing or testing:

```ts
const match = matchRoute('/api/:version/*', '/api/v2/users/list')
// { pattern: '/api/:version/*', params: { version: 'v2', '*': 'users/list' } }
```

## Singleton Router

`@geajs/core` exports a lazily-created `router` singleton. It's a `Router` instance created on first access — apps that don't use routing pay zero cost.

```ts
import { router } from '@geajs/core'

// Reactive properties
console.log(router.path)    // '/about'
console.log(router.query)   // { q: 'hello' }
console.log(router.hash)    // '#section'

// Navigation
router.push('/about')
router.replace('/login')
router.back()
router.forward()
router.go(-2)
```

The singleton is useful for simple apps or for reading the current URL reactively without setting up a full route config. For apps with defined routes, use `createRouter` instead.

### Recommendations

- Use `createRouter` with `RouterView` for apps with route configs — it gives you layouts, guards, and type safety.
- Use the singleton for quick prototypes, or when you only need reactive URL state without route matching.
- Use `RouterView` with inline routes for a middle ground — declarative routes without a separate router file.
- Use `matchRoute` for one-off pattern matching. For full routing, let the router handle matching.
