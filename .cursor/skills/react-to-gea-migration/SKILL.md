---
name: react-to-gea-migration
description: Step-by-step guide for migrating React applications to Gea — covering project setup, component conversion, state management, routing, styling, and known pitfalls. Use when converting an existing React codebase to Gea or when advising on migration strategy.
---

# Migrating React Codebases to Gea

This skill documents a battle-tested process for converting React applications to the Gea framework, based on a full migration of the [oldboyxx/jira_clone](https://github.com/oldboyxx/jira_clone) — a non-trivial React app with routing, state management, styled-components, modals, and drag-and-drop.

Read `reference.md` in this skill directory for the complete conversion reference with side-by-side code examples.

## Prerequisites

Before starting, read the **gea-framework** skill (`skills/gea-framework/SKILL.md`) to understand Gea's core concepts: Stores, Components, JSX rules, and the Router.

Also read the **gea-ui-components** skill (`skills/gea-ui-components/SKILL.md`) — the Jira clone uses `@geajs/ui` for Dialog, Button, Select, Avatar, Toaster, and Link. Most React apps have custom or third-party versions of these; switching to `@geajs/ui` eliminates significant migration work.

## Migration Strategy

### Phase 1: Scaffold the Gea project

1. Create a new directory alongside the React app (e.g. `jira_clone_gea/`).
2. Set up `package.json`, `vite.config.ts`, `index.html`, and `src/main.ts`.
3. Install `@geajs/core`, `@geajs/vite-plugin`, and `@geajs/ui`.
4. Copy over static assets (fonts, icons, images) and global CSS variables.
5. Optionally configure Tailwind CSS (the Jira clone uses it, but plain CSS works equally well).

### Phase 2: Convert the data layer first

Convert stores and API utilities before touching any UI. This gives you a working data layer to test components against.

1. **Stores** — Convert each React state container (Context, Redux slices, `useState`/`useMergeState` hooks) into a Gea `Store` class.
2. **Toast store** — Create a thin adapter over `@geajs/ui`'s `ToastStore` so call sites use a familiar `toastStore.success(msg)` / `toastStore.error(err)` API.
3. **Auth flow** — Move authentication from a route-level `useEffect` into `App.created()`.
4. **Validation utilities** — Port form validation helpers (if any) as plain functions.

### Phase 3: Convert components top-down

Start with the root `App` component and work down the component tree:

1. **App** → class component with `created()` for initialization
2. **Layout shell** (sidebar, navbar) → class components reading from stores
3. **Page views** (Board, Settings) → class components with `template()`
4. **Modals / dialogs** → replace custom modal components with `@geajs/ui` `Dialog`
5. **Forms** → replace custom selects with `@geajs/ui` `Select`, buttons with `@geajs/ui` `Button`
6. **Presentational components** (Avatar, Icon, Spinner) → function components or `@geajs/ui` equivalents

### Phase 4: Port styling

Convert styled-components (or CSS-in-JS) to plain CSS. Use CSS variables for design tokens.

### Phase 5: Wire up routing

Replace `react-router-dom` with Gea's built-in router. Use `matchRoute` for URL-driven modals.

### Phase 6: Test and iterate

Compare both apps side-by-side, pixel by pixel. Fix visual discrepancies by inspecting the React app's computed styles and replicating exact values.

---

## Conversion Rules

### Components

| React | Gea |
|-------|-----|
| `function MyComponent() {}` with hooks | `class MyComponent extends Component {}` with member variables |
| `function MyComponent({ props })` (stateless) | `export default function MyComponent({ props })` |
| `useState(initial)` | Member variable: `myField = initial` |
| `useEffect(() => {}, [])` | `created()` lifecycle method |
| `useEffect(() => { return cleanup }, [])` | `created()` + `dispose()` |
| `useRef()` for DOM | `this.el` (component's root element) |
| `useCallback` / `useMemo` | Not needed — use class methods or store getters |
| `React.Fragment` / `<>...</>` | Not supported — use a wrapper `<div>` |
| `className="foo"` | `class="foo"` |
| `onClick={fn}` | `click={fn}` |
| `onChange={fn}` (on input) | `input={fn}` (for text) or `change={fn}` (for checkbox/select) |
| `onKeyDown={fn}` | `keydown={fn}` |
| `dangerouslySetInnerHTML={{ __html: html }}` | Use `onAfterRender` with `el.innerHTML` |
| `children` | `children` prop (works the same) |
| Render props `renderContent={modal => <Foo />}` | Supported — render props compile to component instantiation |
| `propTypes` / `defaultProps` | Not needed — use TypeScript types and default parameter values |

### Entry Point

**React:**
```jsx
import ReactDOM from 'react-dom'
ReactDOM.render(<App />, document.getElementById('root'))
```

**Gea:**
```ts
import App from './App'
import './styles.css'

const app = new App()
app.render(document.getElementById('app'))
```

### State Management

**React (hooks + context):**
```jsx
const [filters, setFilters] = useState({ searchTerm: '', userIds: [] })
const updateFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))
```

**Gea (Store):**
```ts
class FiltersStore extends Store {
  searchTerm = ''
  userIds: string[] = []

  setSearchTerm(val: string) { this.searchTerm = val }
  toggleUserId(id: string) {
    const idx = this.userIds.indexOf(id)
    if (idx >= 0) this.userIds.splice(idx, 1)
    else this.userIds.push(id)
  }
}
export default new FiltersStore()
```

Key differences:
- **Always export a singleton instance**, not the class.
- **Mutate directly** — `this.count++`, `this.items.push(x)`, `this.items.splice(i, 1)`. No spread operators or immutable patterns needed.
- **Getters for derived values** — replace `useMemo` with class getters.
- **Array mutations are intercepted** — `push`, `pop`, `splice`, `sort`, `reverse`, `shift`, `unshift` all trigger reactivity.

### Routing

**React (react-router-dom v5):**
```jsx
import { useHistory, useRouteMatch, Route, Switch } from 'react-router-dom'

const history = useHistory()
history.push('/board')

<Route path="/board" component={Board} />
<Route path="/settings" component={Settings} />
```

**Gea:**

```ts
// src/router.ts — bare Router, no view imports (avoids circular dependencies)
import { Router } from '@geajs/core'
export const router = new Router()
```

```tsx
// App.tsx — set routes here where both router and views are available
import { router } from './router'
import Project from './views/Project'
import Board from './views/Board'

router.setRoutes({
  '/': '/project/board',
  '/project': {
    layout: Project,
    guard: AuthGuard,
    children: {
      '/board': Board,
      '/settings': ProjectSettings,
    },
  },
})
```

```tsx
// App template — render the router's resolved page
template() {
  return (
    <div class="app">
      <Outlet />
    </div>
  )
}
```

Key differences:
- `router.ts` exports a bare `Router` instance — no view imports, avoiding circular dependencies (views import `router`, so `router.ts` must not import views).
- `router.setRoutes(...)` is called in `App.tsx` where both the router and view components are available.
- `router.push(path)` for navigation, `router.replace(path)` for replacing history.
- `router.path` and `router.params` are reactive — read them in `template()` or class getters.
- Use `<Outlet />` to render the resolved page/layout hierarchy.
- Layouts receive the resolved child as a `page` prop.

### Route Guards

**React** uses route-level components or HOCs for auth protection:
```jsx
<Route path="/dashboard" render={() =>
  isAuthenticated ? <Dashboard /> : <Redirect to="/login" />
} />
```

**Gea** uses guards — synchronous functions on route groups:
```ts
import authStore from './stores/auth-store'
import PageLoader from './components/PageLoader'

export const AuthGuard = () => {
  if (authStore.isAuthenticated) return true
  return PageLoader   // show this component instead
  // or: return '/login'  — redirect to login page
}
```

Apply a guard to a route group to protect all children:
```ts
'/project': {
  layout: Project,
  guard: AuthGuard,
  children: {
    '/board': Board,
    '/settings': ProjectSettings,
  },
}
```

Guard return values:

| Return | Effect |
|--------|--------|
| `true` | Proceed to the route |
| `string` | Redirect to that path |
| `Component` | Render it instead of the route |

Guards on nested groups stack parent → child. The parent guard runs first; the child guard only runs if the parent passes.

Guards are intentionally synchronous — they check store state, not async APIs. For async checks (API calls, fetching data), use `created()` in the component.

### Styling

React apps commonly use styled-components or CSS-in-JS. Gea uses plain CSS with `class` attributes (optionally with Tailwind).

**Conversion process:**
1. Open each styled-component definition (e.g. `Styles.js`).
2. Extract every CSS property and value.
3. Create equivalent CSS rules in a stylesheet.
4. Replace styled component usage with `<div class="my-class">`.
5. For dynamic styles, use template literal classes: `` class={`btn ${active ? 'active' : ''}`} ``
6. For truly dynamic values (computed sizes, positions), use inline `style`: `` style={`width:${size}px`} ``

### Event Handlers

| React | Gea | Notes |
|-------|-----|-------|
| `onClick={fn}` | `click={fn}` | Both native and React-style names work |
| `onChange={fn}` on `<input type="text">` | `input={fn}` | `input` fires on every keystroke; `change` fires on blur |
| `onChange={fn}` on `<select>` | `change={fn}` | |
| `onChange={fn}` on `<input type="checkbox">` | `change={fn}` | Use with `checked={bool}` |
| `onBlur={fn}` | `blur={fn}` | |
| `onFocus={fn}` | `focus={fn}` | |
| `onKeyDown={fn}` | `keydown={fn}` | |
| `onSubmit={fn}` | `submit={fn}` | |
| `onDoubleClick={fn}` | `dblclick={fn}` | |
| `onDragStart={fn}` | `dragstart={fn}` | Native HTML5 drag-and-drop |
| `onDragEnd={fn}` | `dragend={fn}` | |
| `onDragOver={fn}` | `dragover={fn}` | |
| `onDragLeave={fn}` | `dragleave={fn}` | |
| `onDrop={fn}` | `drop={fn}` | |

### Hooks → Gea Equivalents

| React Hook | Gea Equivalent |
|------------|---------------|
| `useState` | Member variable (`this.myField = value`) |
| `useEffect(fn, [])` | `created()` lifecycle |
| `useEffect(fn, [dep])` | Read `dep` in `template()` — compiler creates observer automatically |
| `useEffect(() => () => cleanup)` | `dispose()` lifecycle (call `super.dispose()` if overriding) |
| `useRef` | `this.el` for DOM; member variable for mutable refs |
| `useMemo(fn, [deps])` | Store getter or class getter |
| `useCallback(fn, [deps])` | Class method (stable by default) |
| `useContext` | Import the store singleton directly |
| `useReducer` | Store with methods |
| Custom hooks (e.g. `useMergeState`) | Store class or component methods |

### Third-Party Libraries

| React Library | Gea Replacement |
|--------------|-----------------|
| `react-router-dom` | `@geajs/core` router (`Router`, `Outlet`, `Link`, `matchRoute`, guards) |
| `styled-components` / CSS-in-JS | Plain CSS + `class` attributes + inline `style` for dynamic values |
| `react-beautiful-dnd` | Manual drag-and-drop with native HTML5 drag events (`dragstart`, `dragend`, `dragover`, `drop`) |
| `react-modal` / custom modals | `@geajs/ui` `Dialog` component |
| Custom `<Select>` / `react-select` | `@geajs/ui` `Select` component |
| Custom `<Button>` | `@geajs/ui` `Button` component |
| `react-toastify` / custom toasts | `@geajs/ui` `Toaster` + `ToastStore` |
| Custom `<Avatar>` | `@geajs/ui` `Avatar` component |
| `prop-types` | TypeScript types |
| `lodash/xor` (for toggle arrays) | `Array.indexOf` + `splice` / `filter` in store methods |
| `moment` / `date-fns` | Custom utility functions or native `Intl.DateTimeFormat` |
| `react-quill` / rich text editors | Integrate via `onAfterRender` + manual DOM management |

---

## Common Patterns

### Auth-Protected App Shell

**React** typically uses a route-level `Authenticate` component with `useEffect`:

```jsx
const Authenticate = () => {
  const history = useHistory()
  useEffect(() => {
    if (!getStoredAuthToken()) {
      api.post('/authentication/guest').then(({ authToken }) => {
        storeAuthToken(authToken)
        history.push('/')
      })
    }
  }, [])
  return <PageLoader />
}
```

**Gea** uses a route guard + `router.setRoutes` in App:

```ts
// router.ts — bare Router instance (no view imports to avoid circular deps)
import { Router } from '@geajs/core'
export const router = new Router()
```

```tsx
// App.tsx — guard + route config + async init
import { router } from './router'
import authStore from './stores/auth-store'
import projectStore from './stores/project-store'
import PageLoader from './components/PageLoader'
import Project from './views/Project'
import Board from './views/Board'
import ProjectSettings from './views/ProjectSettings'

const AuthGuard = () => {
  if (authStore.isAuthenticated && !projectStore.isLoading) return true
  return PageLoader
}

router.setRoutes({
  '/': '/project/board',
  '/project': {
    layout: Project,
    guard: AuthGuard,
    children: {
      '/board': Board,
      '/settings': ProjectSettings,
    },
  },
})

export default class App extends Component {
  async created() {
    if (!authStore.isAuthenticated) {
      await authStore.authenticate()
    } else {
      await authStore.fetchCurrentUser()
    }
    await projectStore.fetchProject()
    router.replace(router.path)
  }

  template() {
    return (
      <div class="app">
        <Outlet />
        <Toaster />
      </div>
    )
  }
}
```

The guard shows `PageLoader` until auth and data loading complete. `App.created()` handles the async work, then `router.replace(router.path)` re-triggers route resolution so the guard re-evaluates and passes. Routes are set in `App.tsx` (not `router.ts`) to avoid circular dependencies — views import `router`, so `router.ts` must not import views.

### Modals with `@geajs/ui` Dialog

**React** typically uses a `Modal` component with render props and portal:

```jsx
<Route path="/issues/:id" render={props => (
  <Modal isOpen onClose={() => history.push('/board')}
    renderContent={modal => <IssueDetails issueId={props.match.params.id} />}
  />
)} />
```

**Gea** uses `@geajs/ui` `Dialog` with `open` and `onOpenChange` props:

```tsx
import { Dialog } from '@geajs/ui'

// Route-driven dialog (opens based on URL)
{this.showIssueDetail && (
  <Dialog
    open={true}
    onOpenChange={(d: any) => {
      if (!d.open) this.closeIssueDetail()
    }}
    class="dialog-issue-detail"
  >
    <IssueDetails issueId={this.issueId} onClose={() => this.closeIssueDetail()} />
  </Dialog>
)}

// State-driven dialog (opens based on component state)
{this.searchModalOpen && (
  <Dialog
    open={true}
    onOpenChange={(d: any) => {
      if (!d.open) this.closeSearchModal()
    }}
    class="dialog-search"
  >
    <IssueSearch onClose={() => this.closeSearchModal()} />
  </Dialog>
)}
```

Key Dialog patterns:
- **Controlled open state**: Pass `open={true}` and conditionally render the Dialog.
- **Close via `onOpenChange`**: Listen for `{open: false}` to trigger cleanup.
- **Route-driven dialogs**: Use `router.params` to derive `open` state from the URL. Close by navigating away.
- **State-driven dialogs**: Use a boolean member variable (e.g. `this.searchModalOpen`) to toggle.
- **Nested dialogs**: Dialogs inside other components (e.g. time tracking dialog inside IssueDetails) work fine.

### Layout Components with `page` Prop

**React** uses `<Route>` components and `useRouteMatch` for view switching. **Gea** uses layouts in the route config — the router resolves the child component and passes it as a `page` prop:

```tsx
// Project is a layout — route config passes the resolved child as `page`
export default class Project extends Component {
  get issueId(): string {
    return router.params.issueId || ''
  }

  get showIssueDetail(): boolean {
    return !!this.issueId
  }

  template({ page }: any) {
    return (
      <div class="project-page">
        <Sidebar />
        <div class="page-content">
          {page}
        </div>
        {this.showIssueDetail && (
          <Dialog open={true} onOpenChange={...}>
            <IssueDetails issueId={this.issueId} />
          </Dialog>
        )}
      </div>
    )
  }
}
```

The route config determines which child `page` resolves to:
```ts
'/project': {
  layout: Project,
  children: {
    '/board': Board,
    '/board/issues/:issueId': Board,
    '/settings': ProjectSettings,
  },
}
```

- `{page}` renders the resolved child — no manual `router.path` checks needed for view switching.
- Route params like `issueId` are available on `router.params` for overlay logic (dialogs, modals).

### Form Validation

**React** typically uses `useState` for errors plus ad-hoc validation or a library like Formik/Yup.

**Gea** uses member variables for form state and a lightweight validator utility:

```ts
// utils/validation.ts
type Validator = (value: any) => string | false

export const is = {
  required: (): Validator => value =>
    (value === undefined || value === null || value === '') && 'This field is required',
  maxLength: (max: number): Validator => value =>
    !!value && value.length > max && `Must be at most ${max} characters`,
  url: (): Validator => value =>
    !!value && !/^https?:\/\//.test(value) && 'Must be a valid URL',
}

export function generateErrors(
  fieldValues: Record<string, any>,
  fieldValidators: Record<string, Validator | Validator[]>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [name, validators] of Object.entries(fieldValidators)) {
    const list = Array.isArray(validators) ? validators : [validators]
    for (const validator of list) {
      const msg = validator(fieldValues[name])
      if (msg && !errors[name]) errors[name] = msg
    }
  }
  return errors
}
```

```tsx
// Component usage
export default class IssueCreate extends Component {
  title = ''
  errors: Record<string, string> = {}

  async handleSubmit() {
    this.errors = generateErrors(
      { title: this.title },
      { title: [is.required(), is.maxLength(200)] },
    )
    if (Object.keys(this.errors).length > 0) return
    // proceed with API call
  }

  template() {
    return (
      <div>
        <input
          class={`input ${this.errors.title ? 'input-error' : ''}`}
          value={this.title}
          input={(e: any) => { this.title = e.target.value }}
        />
        {this.errors.title && <div class="form-error">{this.errors.title}</div>}
      </div>
    )
  }
}
```

### `@geajs/ui` Select in Forms

**React** uses custom select components or `react-select`. **Gea** uses `@geajs/ui` `Select`:

```tsx
import { Select } from '@geajs/ui'

// Single select — value is always an array, wrap/unwrap manually
<Select
  class="w-full"
  items={typeOptions}
  value={[this.type]}
  onValueChange={(d: { value: string[] }) => {
    const v = d.value[0]
    if (v !== undefined) this.type = v
  }}
  placeholder="Type"
/>

// Multi-select
<Select
  class="w-full"
  multiple={true}
  items={userOptions}
  value={this.userIds}
  onValueChange={(d: { value: string[] }) => {
    this.userIds = d.value
  }}
  placeholder="Assignees"
/>
```

Key differences:
- `items` is an array of `{ value, label }` objects.
- `value` is always an array — for single select, wrap in `[val]` and extract `d.value[0]`.
- `onValueChange` receives `{ value: string[] }`, not the raw value.
- Use `class="w-full"` for full-width selects.

### Toast Notifications

**React** uses `react-toastify` or custom toast components. **Gea** uses `@geajs/ui`:

```ts
// stores/toast-store.ts
import { ToastStore } from '@geajs/ui'

const toastStore = {
  success(title: string) {
    ToastStore.success({ title })
  },
  error(err: unknown) {
    ToastStore.error({
      title: 'Error',
      description: typeof err === 'string' ? err : (err as Error)?.message || String(err),
    })
  },
}

export default toastStore
```

Add `<Toaster />` to the App template:

```tsx
import { Toaster } from '@geajs/ui'

template() {
  return (
    <div class="app">
      <Project />
      <Toaster />
    </div>
  )
}
```

### Native HTML5 Drag-and-Drop

**React** apps commonly use `react-beautiful-dnd`. **Gea** implements DnD with native events:

**Draggable card:**
```tsx
export default class IssueCard extends Component {
  _didDrag = false

  handleClick() {
    if (this._didDrag) return
    router.push(`/project/board/issues/${this.props.issueId}`)
  }

  onDragStart(e: DragEvent) {
    this._didDrag = true
    e.dataTransfer?.setData('text/plain', this.props.issueId)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('dragging')
  }

  onDragEnd(e: DragEvent) {
    ;(e.currentTarget as HTMLElement).classList.remove('dragging')
    queueMicrotask(() => { this._didDrag = false })
  }

  template({ issueId, title }: any) {
    return (
      <div
        class="issue-card"
        draggable={true}
        dragstart={(e: DragEvent) => this.onDragStart(e)}
        dragend={(e: DragEvent) => this.onDragEnd(e)}
        click={() => this.handleClick()}
      >
        {title}
      </div>
    )
  }
}
```

**Drop target column:**
```tsx
<div
  class="board-list-issues"
  dragover={(e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('board-list--drag-over')
  }}
  dragleave={(e: DragEvent) => {
    const el = e.currentTarget as HTMLElement
    const related = e.relatedTarget as Node | null
    if (!related || !el.contains(related)) el.classList.remove('board-list--drag-over')
  }}
  drop={(e: DragEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).classList.remove('board-list--drag-over')
    const id = e.dataTransfer?.getData('text/plain')
    if (id) projectStore.moveIssueToColumn(id, status)
  }}
>
  {issues.map(issue => <IssueCard key={issue.id} ... />)}
</div>
```

Key patterns:
- **`_didDrag` flag**: Prevents `click` from firing after a drag. Reset via `queueMicrotask` to let the click event fire and be ignored first.
- **`dragleave` child bubbling**: Check `e.relatedTarget` to avoid false drag-leave when moving over child elements.
- **CSS classes for visual feedback**: Add/remove classes like `dragging` and `board-list--drag-over` directly on the element.

### Debounced Search with API Calls

**React** uses `useEffect` with a debounce timeout or a library. **Gea** uses a member variable timer:

```tsx
export default class IssueSearch extends Component {
  searchTerm = ''
  matchingIssues: any[] = []
  isLoading = false
  _debounceTimer: any = null

  handleInput(e: any) {
    this.searchTerm = e.target.value
    clearTimeout(this._debounceTimer)
    if (this.searchTerm.trim()) {
      this._debounceTimer = setTimeout(() => this.doSearch(), 300)
    } else {
      this.matchingIssues = []
    }
  }

  async doSearch() {
    this.isLoading = true
    try {
      const data = await api.get('/issues', { searchTerm: this.searchTerm.trim() })
      this.matchingIssues = data || []
    } catch {
      this.matchingIssues = []
    } finally {
      this.isLoading = false
    }
  }

  template({ onClose }) {
    return (
      <div class="issue-search">
        <input
          type="text"
          autofocus
          placeholder="Search issues..."
          value={this.searchTerm}
          input={(e: any) => this.handleInput(e)}
        />
        {this.isLoading && <Spinner size={20} />}
        {this.matchingIssues.map(issue => (
          <Link key={issue.id} to={`/project/board/issues/${issue.id}`} onNavigate={() => onClose?.()}>
            {issue.title}
          </Link>
        ))}
      </div>
    )
  }
}
```

Key patterns:
- **Debounce with `setTimeout` / `clearTimeout`**: Store the timer as a member variable, clear on each keystroke.
- **`Link` with `onNavigate`**: Close the search modal when a result is clicked using the `onNavigate` callback.
- **Empty state on clear**: Reset `matchingIssues` to `[]` when the search term is cleared.

### Global Keyboard Shortcuts

**React** uses `useEffect` to attach `keydown` listeners. **Gea** uses `created()` + `dispose()`:

```tsx
export default class CommentCreate extends Component {
  isFormOpen = false
  private _onKey: ((e: KeyboardEvent) => void) | null = null

  created() {
    this._onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        this.openForm()
      }
    }
    document.addEventListener('keydown', this._onKey)
  }

  dispose() {
    if (this._onKey) document.removeEventListener('keydown', this._onKey)
    super.dispose()
  }
}
```

**Always call `super.dispose()`** when overriding `dispose()` in a class component.

### Optimistic Updates

Update local state immediately, send API request, revert on failure:

```ts
async updateIssue(fields: any): Promise<void> {
  if (!this.issue) return
  const currentFields = { ...this.issue }
  Object.assign(this.issue, fields)
  projectStore.updateLocalProjectIssues(this.issue.id, fields)
  try {
    await api.put(`/issues/${this.issue.id}`, fields)
  } catch {
    Object.assign(this.issue, currentFields)
    projectStore.updateLocalProjectIssues(this.issue.id, currentFields)
  }
}
```

### Inline Editing (e.g., issue title)

**React** uses `useState` for editing state. **Gea** uses member variables:

```tsx
export default class IssueDetails extends Component {
  isEditingTitle = false
  editTitle = ''

  startEditTitle() {
    this.editTitle = issueStore.issue?.title || ''
    this.isEditingTitle = true
  }

  saveTitle() {
    this.isEditingTitle = false
    if (this.editTitle.trim() && this.editTitle !== issueStore.issue?.title) {
      issueStore.updateIssue({ title: this.editTitle.trim() })
    }
  }

  template() {
    return (
      <div>
        {!this.isEditingTitle && (
          <h2 click={() => this.startEditTitle()}>{issueStore.issue?.title}</h2>
        )}
        {this.isEditingTitle && (
          <textarea
            value={this.editTitle}
            input={(e: any) => { this.editTitle = e.target.value }}
            blur={() => this.saveTitle()}
            keydown={(e: any) => {
              if (e.key === 'Enter') { e.preventDefault(); this.saveTitle() }
            }}
          ></textarea>
        )}
      </div>
    )
  }
}
```

### Custom Dropdown with Overlay Dismiss

Instead of `useOnOutsideClick` with `mousedown` listeners, use an overlay `<div>`:

```tsx
export default class IssueDetails extends Component {
  openDropdown: string | null = null

  toggleDropdown(name: string) {
    this.openDropdown = this.openDropdown === name ? null : name
  }

  closeDropdown() {
    this.openDropdown = null
  }

  template() {
    return (
      <div class="issue-details-right">
        {this.openDropdown && <div class="dropdown-overlay" click={() => this.closeDropdown()}></div>}

        <div class="field field--relative">
          <button click={() => this.toggleDropdown('status')}>Status</button>
          {this.openDropdown === 'status' && (
            <div class="custom-dropdown">
              {statusOptions.map(opt => (
                <div key={opt.value} click={() => {
                  issueStore.updateIssue({ status: opt.value })
                  this.closeDropdown()
                }}>
                  {opt.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
}
```

This avoids global event listeners. The overlay is a transparent full-screen `<div>` positioned behind the dropdown that catches clicks.

### Store Cleanup on Navigation

When a component reads from a store that holds per-view data (e.g. a single issue), clear the store when leaving:

```tsx
closeIssueDetail() {
  issueStore.clear()
  router.push('/project/board')
}
```

```ts
// In the store
clear(): void {
  this.issue = null
  this.isLoading = false
}
```

---

## Using `@geajs/ui` Components

Many React apps have custom implementations of common UI elements. Replace them with `@geajs/ui`:

| Custom React Component | `@geajs/ui` Replacement | Key Props |
|------------------------|------------------------|-----------|
| `<Modal>` | `<Dialog>` | `open`, `onOpenChange`, `title`, `description` |
| `<Button>` | `<Button>` | `variant` (`"default"`, `"destructive"`, `"ghost"`), `disabled`, `click` |
| `<Select>` | `<Select>` | `items`, `value` (array), `onValueChange`, `multiple`, `placeholder` |
| `<Avatar>` | `<Avatar>` | `src`, `name`, `class` |
| `<Toast>` / notifications | `<Toaster>` + `ToastStore` | Place `<Toaster />` in App root |
| `<Link>` | `<Link>` (from `@geajs/core`) | `to`, `class`, `onNavigate` |

### ConfirmModal Pattern

```tsx
import { Dialog, Button } from '@geajs/ui'

export default class ConfirmModal extends Component {
  isOpen = false

  open() { this.isOpen = true }
  close() { this.isOpen = false }

  handleConfirm() {
    this.props.onConfirm?.()
    this.close()
  }

  template({ title = 'Confirm', message = 'Are you sure?', confirmText = 'Confirm' }) {
    return (
      <Dialog
        open={this.isOpen}
        onOpenChange={(d: { open: boolean }) => { if (!d.open) this.close() }}
        title={title}
        description={message}
      >
        <div class="flex gap-2 justify-end mt-4">
          <Button variant="default" click={() => this.handleConfirm()}>{confirmText}</Button>
          <Button variant="ghost" click={() => this.close()}>Cancel</Button>
        </div>
      </Dialog>
    )
  }
}
```

---

## Migration Checklist

Use this checklist when converting a React app to Gea:

- [ ] **Project scaffold** — `package.json`, `vite.config.ts`, `index.html`, `main.ts`
- [ ] **Dependencies** — `@geajs/core`, `@geajs/vite-plugin`, `@geajs/ui`
- [ ] **Static assets** — fonts, icons, images copied to Gea project
- [ ] **CSS variables** — extract from React's styled-components/base styles into `:root`
- [ ] **Auth token** — `localStorage` helpers (usually copy as-is)
- [ ] **Validation utils** — `is.required()`, `is.maxLength()`, `generateErrors()`
- [ ] **Stores** — one per domain (auth, project, filters, issue, toast)
- [ ] **Toast store** — thin adapter over `@geajs/ui` `ToastStore`
- [ ] **Router config** — bare `Router` in `router.ts`, `setRoutes` with guards/layouts/redirects in `App.tsx`
- [ ] **Auth guard** — synchronous guard checking store state, protecting route groups
- [ ] **App component** — `created()` for async auth + data fetching, `<Outlet />` + `<Toaster />` in template
- [ ] **Layout components** — sidebar, navbar as class components; layouts receive `page` prop from router
- [ ] **Page views** — Board, Settings, IssueDetails as class components
- [ ] **Modals / dialogs** — `@geajs/ui` `Dialog` with `open` + `onOpenChange`
- [ ] **Forms** — `@geajs/ui` `Select` for dropdowns, `@geajs/ui` `Button` for actions
- [ ] **Presentational components** — `@geajs/ui` `Avatar`; custom `Icon`, `Spinner` as function components
- [ ] **Event handlers** — `onClick` → `click`, `onChange` → `input`/`change`
- [ ] **Styling** — all styled-components converted to plain CSS classes
- [ ] **Dynamic styles** — template literal `class` attributes + inline `style` for computed values
- [ ] **Drag-and-drop** — native HTML5 DnD events with `_didDrag` flag for click suppression
- [ ] **Keyboard shortcuts** — `created()` + `dispose()` with `super.dispose()`
- [ ] **Debounced search** — `setTimeout` / `clearTimeout` in member variables
- [ ] **Store cleanup** — `clear()` methods for per-view stores when navigating away
- [ ] **Side-by-side visual comparison** — pixel-match both apps at every breakpoint
