# Route Configuration

Routes are a plain object passed to `createRouter`. Keys are URL patterns. Values are components, layout groups, redirects, or lazy imports.

## Flat Routes

The simplest form — map paths to components.

```ts
import { createRouter } from '@geajs/core'
import Home from './views/Home'
import Login from './views/Login'
import Projects from './views/Projects'
import Project from './views/Project'
import NotFound from './views/NotFound'

export const router = createRouter({
  '/': Home,
  '/login': Login,
  '/projects': Projects,
  '/projects/:id': Project,
  '*': NotFound,
} as const)
```

### Recommendations

- Start with flat routes. Add nesting only when you need shared layouts or guards.
- Always include a `'*'` catch-all route. Without it, unmatched URLs produce no output.
- Always add `as const` to enable type inference.

## Path Params

Prefix a path segment with `:` to capture it as a param. The component receives it as a prop.

```ts
'/projects/:id': Project,
'/users/:userId/posts/:postId': Post,
```

```tsx
export default class Project extends Component {
  created({ id }) {
    projectStore.fetch(id)
  }

  template({ id }) {
    return <h1>Project {id}</h1>
  }
}
```

Params are always strings. Parse them yourself if you need numbers.

### Pattern Reference

| Pattern | Example URL | Params |
| --- | --- | --- |
| `/about` | `/about` | `{}` |
| `/users/:id` | `/users/42` | `{ id: '42' }` |
| `/users/:userId/posts/:postId` | `/users/7/posts/99` | `{ userId: '7', postId: '99' }` |
| `/files/*` | `/files/docs/readme.md` | `{ '*': 'docs/readme.md' }` |
| `/repo/:owner/*` | `/repo/dashersw/src/index.ts` | `{ owner: 'dashersw', '*': 'src/index.ts' }` |

Named parameters (`:param`) match a single path segment. Wildcards (`*`) capture the rest of the path. Parameter values are URI-decoded automatically.

### Recommendations

- Keep param names descriptive: `:projectId` over `:id` when multiple param routes exist in the same config.
- Parse params in `created()` rather than in `template()` to avoid repeated work.

## Wildcards

The `'*'` pattern matches any path that no other route handles.

```ts
'*': NotFound,
```

Wildcards also work in nested groups — they match anything under that group's prefix that doesn't have a more specific match.

## Nested Routes with Layouts

Group routes under a layout. The layout component receives a `page` prop containing the resolved child.

```ts
export const router = createRouter({
  '/login': Login,

  '/': {
    layout: AppShell,
    children: {
      '/dashboard': {
        layout: DashboardLayout,
        children: {
          '/': Overview,
          '/projects': Projects,
          '/projects/:id': Project,
        }
      },
      '/settings': Settings,
    }
  },

  '*': NotFound,
} as const)
```

URL `/dashboard/projects/42` resolves to `AppShell > DashboardLayout > Project`.

### Recommendations

- Keep nesting shallow. Two levels of layout nesting covers most apps. Three is a code smell.
- Layouts should be dumb shells. Put business logic in stores, not layouts.

## Pathless Layouts

A layout at `'/'` with children wraps its children without adding a URL segment.

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

URL `/dashboard` resolves to `AppShell > Dashboard`. The `'/'` key doesn't appear in the URL.

Use this for auth shells, app-wide chrome, or any shared wrapper that shouldn't affect the path.

### Recommendations

- Use pathless layouts for cross-cutting concerns: auth checks, app shells, error boundaries.
- Don't nest pathless layouts inside pathless layouts. It's confusing and unnecessary.

## Query Mode

By default, children match URL path segments. Query mode matches a query parameter instead.

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

| URL | Resolved |
|---|---|
| `/settings?view=profile` | `SettingsLayout > ProfileSettings` |
| `/settings?view=billing` | `SettingsLayout > BillingSettings` |
| `/settings?view=team` | `SettingsLayout > TeamSettings` |

Query-mode children use plain string keys (no leading `/`). The layout receives extra props: `activeKey`, `keys`, and `navigate`. See [Layouts](layouts.md) for details.

### Recommendations

- Use query mode for tab-style UIs where the URL should stay the same base path.
- Prefer path mode for anything that should be independently linkable or bookmarkable.

## Lazy Loading

Replace a component with a function that returns a dynamic import. Vite handles code splitting automatically.

```ts
'/projects/:id/edit': () => import('./views/ProjectEdit'),
```

The router awaits the import before rendering. If the import fails, `router.error` is set.

Lazy loading works anywhere a component is expected — flat routes, nested children, guards.

### Recommendations

- Lazy-load routes that are not part of the initial page load: settings, admin panels, edit forms.
- Don't lazy-load the landing page or primary navigation targets. Users will see a blank frame.

## Redirects

A string value instead of a component triggers a redirect.

```ts
// Static redirect
'/old-dashboard': '/dashboard',

// Dynamic redirect
'/account': () => authStore.user ? '/dashboard' : '/login',

// Full control
'/old-projects/:id': {
  redirect: (params) => `/projects/${params.id}`,
  method: 'replace',       // 'push' | 'replace', default: 'replace'
  status: 301,             // hint for SSR/prerender
},

// External redirect via wildcard
'/blog/*': {
  redirect: (_, path) => `https://blog.example.com${path}`,
},
```

### Recommendations

- Use `replace` (the default) for redirects. Users shouldn't hit the back button and land on a redirect loop.
- Use dynamic redirects for auth-dependent routing: `/account` goes to dashboard if logged in, login if not.

## Configuration Options

```ts
export const router = createRouter({
  // routes
}, {
  base: '/app',     // URL base path, defaults to Vite's base config
  scroll: true,     // scroll to top on push, restore on back/forward (default: true)
})
```
