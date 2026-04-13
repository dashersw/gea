# Layouts

Layouts are normal Gea components. The router passes props to them — layouts don't know about routing. They render a shell and place the resolved child component via the `page` prop.

## Path-Mode Layout

In path mode (the default), the layout receives `page`, `route`, and `params`.

```tsx
import { Component, Link } from '@geajs/core'
import { router } from '../router'
import { cn } from '../utils/cn'
import type { RouteProps } from '../router'

export default class DashboardLayout extends Component<RouteProps['/dashboard']> {
  template({ page, route }) {
    return (
      <div class="dashboard">
        <nav>
          <Link to="/dashboard"
                class={cn('nav-link', router.isExact('/dashboard') && 'active')}>
            Overview
          </Link>
          <Link to="/dashboard/projects"
                class={cn('nav-link', router.isActive('/dashboard/projects') && 'active')}>
            Projects
          </Link>
        </nav>
        <main>{page}</main>
      </div>
    )
  }
}
```

`page` is the resolved child component. `route` is the matched pattern. `params` contains any path params from child routes.

## Query-Mode Layout

In query mode, the layout receives extra props for managing tabs or similar UI patterns.

```tsx
import { Component } from '@geajs/core'
import Tab from '../components/Tab'
import type { RouteProps } from '../router'

export default class SettingsLayout extends Component<RouteProps['/settings']> {
  template({ page, activeKey, keys, navigate }) {
    return (
      <div class="settings">
        <h1>Settings</h1>
        <Tab tabs={keys} active={activeKey} onSelect={navigate} />
        <div class="content">{page}</div>
      </div>
    )
  }
}
```

The route config that produces these props:

```ts
'/settings': {
  layout: SettingsLayout,
  mode: { type: 'query', param: 'view' },
  children: {
    'profile': ProfileSettings,
    'billing': BillingSettings,
    'team': TeamSettings,
  }
}
```

`navigate('billing')` updates the URL to `/settings?view=billing` and resolves the `BillingSettings` component into `page`.

## Layout Props Reference

| Prop | Mode | Type | Description |
|---|---|---|---|
| `page` | both | `Component` | Resolved child component |
| `route` | both | `string` | Matched route pattern |
| `params` | both | `object` | Path params from child routes |
| `activeKey` | query | `string` | Currently active child key |
| `keys` | query | `string[]` | All available child keys |
| `navigate` | query | `(key: string) => void` | Switch to a different child |

## Pathless Layouts

A layout at `'/'` wraps its children without adding a URL segment. Use it for app shells, auth boundaries, or shared wrappers.

```ts
'/': {
  layout: AppShell,
  guard: AuthGuard,
  children: {
    '/dashboard': Dashboard,
    '/settings': Settings,
  }
}
```

URL `/dashboard` resolves to `AppShell > Dashboard`. The pathless layout doesn't affect the URL.

```tsx
export default class AppShell extends Component {
  template({ page }) {
    return (
      <div class="app">
        <Header />
        <main>{page}</main>
        <Footer />
      </div>
    )
  }
}
```

## Type Safety with RouteProps

Layout types are inferred from the route config. Export `RouteProps` once from your router file and reference it by path.

```ts
// router.ts
import { createRouter, InferRouteProps } from '@geajs/core'

export const router = createRouter({ ... } as const)
export type RouteProps = InferRouteProps<typeof router>
```

```tsx
// DashboardLayout.tsx
import type { RouteProps } from '../router'

export default class DashboardLayout extends Component<RouteProps['/dashboard']> {
  template({ page, params }) {
    // page:   Overview | Projects | Project   (inferred from children)
    // params: { id?: string }                 (inferred from :id in children)
  }
}
```

No manual unions, no generated files. The types follow the route config.

See [Type Safety](type-safety.md) for the full details.

## Recommendations

- Keep layouts as dumb shells. They render chrome and place `page`. Business logic belongs in stores.
- Use path mode for URL-driven navigation (dashboards, resource pages). Use query mode for tab-style UIs where the base path stays the same.
- Type your layouts with `RouteProps['/path']`. It catches mismatches between the layout and its children at compile time.
- Don't put navigation logic in layouts. Use `Link` and `router.isActive()` for nav highlighting. The layout itself should not call `router.push()`.
