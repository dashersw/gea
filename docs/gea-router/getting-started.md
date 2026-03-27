# Getting Started

## Install

```bash
npm install @geajs/core
```

You need `@geajs/core` and `@geajs/vite-plugin` already set up. See the main [Getting Started](../getting-started.md) guide if you haven't done that.

## Define Routes

Create a `router.ts` file. Map URL paths to components.

```ts
// src/router.ts
import { createRouter } from '@geajs/core'
import Home from './views/Home'
import About from './views/About'
import NotFound from './views/NotFound'

export const router = createRouter({
  '/': Home,
  '/about': About,
  '*': NotFound,
} as const)
```

The `as const` assertion enables type inference for route params and layout props. Always include it.

## Create the App Component

The `App` component uses `RouterView` to render the current page.

```tsx
// src/App.tsx
import { Component, RouterView } from '@geajs/core'
import { router } from './router'

export default class App extends Component {
  template() {
    return <RouterView router={router} />
  }
}
```

`RouterView` resolves the current URL against the router's route config and renders the matching component. It updates reactively when the user navigates, and displays `router.error` if a lazy-load or guard fails.

## Create a View

Views are normal Gea components. Route params arrive as props.

```tsx
// src/views/Home.tsx
import { Component } from '@geajs/core'
import { Link } from '@geajs/core'

export default class Home extends Component {
  template() {
    return (
      <div>
        <h1>Home</h1>
        <Link to="/about">About</Link>
      </div>
    )
  }
}
```

## Add Navigation with Link

`Link` renders an `<a>` tag. It intercepts clicks and calls `router.push`. Modifier-key clicks (ctrl, meta, shift) pass through to the browser.

```tsx
import { Link } from '@geajs/core'

<Link to="/about">About</Link>
<Link to="/login" replace>Sign in</Link>
```

The `replace` prop uses `router.replace` instead of `router.push`, so the current entry is replaced in browser history.

## Render to the DOM

```ts
// src/main.ts
import App from './App'

const app = new App()
app.render(document.getElementById('app'))
```

## Full File Structure

```
src/
  main.ts
  App.tsx
  router.ts
  views/
    Home.tsx
    About.tsx
    NotFound.tsx
```

## Next Steps

- [Route Configuration](route-config.md) — params, wildcards, nested layouts, lazy loading
- [Navigation](navigation.md) — programmatic navigation and active detection
- [Layouts](layouts.md) — path-mode and query-mode layouts
- [Guards](guards.md) — auth checks, role gates, 2FA prompts
- [Type Safety](type-safety.md) — inferred route props and params
