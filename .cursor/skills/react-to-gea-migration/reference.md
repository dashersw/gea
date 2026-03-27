# React → Gea Migration Reference

Complete side-by-side conversion reference with real examples from the Jira clone migration.

## Table of Contents

- [Project Setup](#project-setup)
- [Entry Point](#entry-point)
- [Store Conversion](#store-conversion)
- [Component Conversion: Class Components](#component-conversion-class-components)
- [Component Conversion: Function Components](#component-conversion-function-components)
- [Using @geajs/ui Components](#using-geajsui-components)
- [Routing](#routing) (route config, guards, layouts, `Outlet`)
- [Styling: styled-components → CSS](#styling-styled-components--css)
- [Event Handling](#event-handling)
- [Conditional & List Rendering](#conditional--list-rendering)
- [Forms & Inputs](#forms--inputs)
- [Form Validation](#form-validation)
- [Lifecycle Methods](#lifecycle-methods)
- [Drag-and-Drop](#drag-and-drop)
- [Debounced Search](#debounced-search)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Toast Notifications](#toast-notifications)
- [Third-Party Replacements](#third-party-replacements)
- [File Structure Comparison](#file-structure-comparison)
- [Known Pitfalls & Gotchas](#known-pitfalls--gotchas)

---

## Project Setup

### package.json

**React:**
```json
{
  "dependencies": {
    "react": "^16.12.0",
    "react-dom": "^16.12.0",
    "react-router-dom": "^5.1.2",
    "styled-components": "^4.4.1",
    "lodash": "^4.17.15",
    "prop-types": "^15.7.2"
  }
}
```

**Gea:**
```json
{
  "type": "module",
  "dependencies": {
    "@geajs/core": "^1.0.0",
    "@geajs/ui": "^0.1.0"
  },
  "devDependencies": {
    "@geajs/vite-plugin": "^1.0.0",
    "vite": "^8.0.0",
    "typescript": "~5.8.0"
  }
}
```

Gea eliminates `react`, `react-dom`, `react-router-dom`, `styled-components`, `lodash`, and `prop-types` as dependencies. `@geajs/ui` replaces custom Dialog, Button, Select, Avatar, and Toast components.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "noEmit": true,
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "@geajs/core"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

The `jsx` and `jsxImportSource` settings enable full JSX type-checking — prop autocompletion, type errors on invalid attributes, and hover types — in any TypeScript-aware editor without framework-specific plugins.

### vite.config.ts

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'
import { mockApiMiddleware } from './mock-api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  plugins: [
    geaPlugin(),
    {
      name: 'mock-api',
      configureServer(server) {
        mockApiMiddleware(server)
      },
    },
  ],
  server: {
    port: 3000,
  },
})
```

### index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App – Gea</title>
  </head>
  <body>
    <div id="app"></div>
    <div id="modal-root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

---

## Entry Point

### React

```jsx
import 'core-js/stable'
import 'regenerator-runtime/runtime'
import React from 'react'
import ReactDOM from 'react-dom'
import App from 'App'

ReactDOM.render(<App />, document.getElementById('root'))
```

### Gea

```ts
import App from './App'
import '../../../packages/gea-ui/src/styles/theme.css'
import './styles.css'

const root = document.getElementById('app')
if (!root) throw new Error('App root element not found')

const app = new App()
app.render(root)
```

No polyfills needed. CSS is imported directly (Vite handles it). The `App` class is instantiated and rendered into the DOM element. `App.tsx` imports `./router` and calls `router.setRoutes(...)` at module evaluation time, so routes are configured before the App instance is created. Import `@geajs/ui` theme CSS if using `@geajs/ui` components.

---

## Store Conversion

### React: useState / useMergeState

```jsx
const defaultFilters = { searchTerm: '', userIds: [], myOnly: false, recent: false }

const ProjectBoard = ({ project }) => {
  const [filters, mergeFilters] = useMergeState(defaultFilters)
  // usage: mergeFilters({ searchTerm: 'bug' })
}
```

### Gea: Store class

```ts
import { Store } from '@geajs/core'

class FiltersStore extends Store {
  searchTerm = ''
  userIds: string[] = []
  myOnly = false
  recentOnly = false

  get areFiltersCleared(): boolean {
    return !this.searchTerm && this.userIds.length === 0 && !this.myOnly && !this.recentOnly
  }

  setSearchTerm(val: string): void {
    this.searchTerm = val
  }

  toggleUserId(id: string): void {
    const idx = this.userIds.indexOf(id)
    if (idx >= 0) {
      this.userIds.splice(idx, 1)
    } else {
      this.userIds.push(id)
    }
  }

  toggleMyOnly(): void {
    this.myOnly = !this.myOnly
  }

  toggleRecentOnly(): void {
    this.recentOnly = !this.recentOnly
  }

  clearAll(): void {
    this.searchTerm = ''
    this.userIds = []
    this.myOnly = false
    this.recentOnly = false
  }
}

export default new FiltersStore()
```

### React: useEffect + API calls

```jsx
const Authenticate = () => {
  const history = useHistory()
  useEffect(() => {
    const createGuestAccount = async () => {
      const { authToken } = await api.post('/authentication/guest')
      storeAuthToken(authToken)
      history.push('/')
    }
    if (!getStoredAuthToken()) createGuestAccount()
  }, [history])
  return <PageLoader />
}
```

### Gea: Store with async methods

```ts
class AuthStore extends Store {
  token: string | null = getStoredAuthToken()
  currentUser: any = null
  isAuthenticating = false

  get isAuthenticated(): boolean {
    return !!this.token
  }

  async authenticate(): Promise<void> {
    this.isAuthenticating = true
    try {
      const data = await api.post('/authentication/guest')
      this.token = data.authToken
      storeAuthToken(data.authToken)
      const userData = await api.get('/currentUser')
      this.currentUser = userData.currentUser
    } catch (e) {
      console.error('Auth failed:', e)
    } finally {
      this.isAuthenticating = false
    }
  }

  async fetchCurrentUser(): Promise<void> {
    try {
      const data = await api.get('/currentUser')
      this.currentUser = data.currentUser
    } catch (e) {
      console.error('Failed to fetch user:', e)
    }
  }
}

export default new AuthStore()
```

### React: Shared state via Context + useReducer

When React uses Context for shared state, the entire Context + Provider + useReducer pattern maps to a single Gea Store:

```ts
class ProjectStore extends Store {
  project: any = null
  isLoading = true
  error: any = null

  async fetchProject(): Promise<void> {
    this.isLoading = true
    try {
      const data = await api.get('/project')
      this.project = data.project
      this.error = null
    } catch (e) {
      this.error = e
    } finally {
      this.isLoading = false
    }
  }

  updateLocalProjectIssues(issueId: string, fields: any): void {
    if (!this.project) return
    updateArrayItemById(this.project.issues, issueId, fields)
  }

  async moveIssueToColumn(issueId: string, newStatus: string): Promise<void> {
    if (!this.project) return
    const issue = this.project.issues.find((i: any) => i.id === issueId)
    if (!issue || issue.status === newStatus) return
    const inTarget = this.project.issues.filter((i: any) => i.status === newStatus && i.id !== issueId)
    const nextPosition =
      inTarget.length > 0 ? Math.max(...inTarget.map((i: any) => Number(i.listPosition) || 0)) + 1 : 1
    const fields = { status: newStatus, listPosition: nextPosition }
    this.updateLocalProjectIssues(issueId, fields)
    try {
      await api.put(`/issues/${issueId}`, fields)
    } catch {
      await this.fetchProject()
    }
  }

  async createIssue(data: any): Promise<void> {
    await api.post('/issues', data)
    await this.fetchProject()
  }

  async deleteIssue(issueId: string): Promise<void> {
    await api.delete(`/issues/${issueId}`)
    await this.fetchProject()
  }
}

export default new ProjectStore()
```

### Issue Store with Optimistic Updates

```ts
class IssueStore extends Store {
  issue: any = null
  isLoading = false

  async fetchIssue(issueId: string): Promise<void> {
    this.isLoading = true
    try {
      const data = await api.get(`/issues/${issueId}`)
      this.issue = data.issue
    } catch (e) {
      console.error('Failed to fetch issue:', e)
    } finally {
      this.isLoading = false
    }
  }

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

  async createComment(issueId: string, body: string): Promise<void> {
    const data = await api.post('/comments', { issueId, body })
    if (this.issue && data.comment) {
      if (!this.issue.comments) this.issue.comments = []
      this.issue.comments.push(data.comment)
    }
  }

  async updateComment(commentId: string, body: string, issueId: string): Promise<void> {
    await api.put(`/comments/${commentId}`, { body })
    await this.fetchIssue(issueId)
  }

  async deleteComment(commentId: string, issueId: string): Promise<void> {
    await api.delete(`/comments/${commentId}`)
    await this.fetchIssue(issueId)
  }

  clear(): void {
    this.issue = null
    this.isLoading = false
  }
}

export default new IssueStore()
```

Key patterns:
- **Optimistic update with rollback**: Snapshot state with `{ ...this.issue }`, apply changes with `Object.assign`, revert in `catch`.
- **Cross-store coordination**: `updateIssue` updates both `issueStore.issue` and `projectStore` issues array.
- **Push to nested arrays**: `this.issue.comments.push(data.comment)` triggers reactivity.
- **`clear()` method**: Resets store state when navigating away from the view.

---

## Component Conversion: Class Components

Use class components when the component has **local state** (editing mode, open/close, search text) or **lifecycle needs** (fetching data, attaching event listeners).

### React: Board page with hooks

```jsx
const ProjectBoard = ({ project, fetchProject, updateLocalProjectIssues }) => {
  const match = useRouteMatch()
  const history = useHistory()
  const [filters, mergeFilters] = useMergeState(defaultFilters)

  return (
    <Fragment>
      <Breadcrumbs items={['Projects', project.name, 'Kanban Board']} />
      <Header />
      <Filters projectUsers={project.users} filters={filters} mergeFilters={mergeFilters} />
      <Lists project={project} filters={filters} />
      <Route path={`${match.path}/issues/:issueId`} render={routeProps => (
        <Modal isOpen onClose={() => history.push(match.url)}>
          <IssueDetails issueId={routeProps.match.params.issueId} />
        </Modal>
      )} />
    </Fragment>
  )
}
```

### Gea: Board page as class component

```tsx
import { Component } from '@geajs/core'
import projectStore from '../stores/project-store'
import filtersStore from '../stores/filters-store'
import authStore from '../stores/auth-store'
import { IssueStatus } from '../constants/issues'
import { Avatar } from '@geajs/ui'
import Breadcrumbs from '../components/Breadcrumbs'
import BoardColumn from '../components/BoardColumn'

const statusList = [
  { id: IssueStatus.BACKLOG, label: 'Backlog' },
  { id: IssueStatus.SELECTED, label: 'Selected' },
  { id: IssueStatus.INPROGRESS, label: 'In Progress' },
  { id: IssueStatus.DONE, label: 'Done' },
]

function filterIssues(
  issues: any[], status: string, searchTerm: string,
  userIds: string[], myOnly: boolean, recentOnly: boolean, currentUser: any,
): any[] {
  let result = issues.filter((i: any) => i.status === status)
  if (searchTerm) {
    const term = searchTerm.toLowerCase()
    result = result.filter(
      (i: any) => i.title.toLowerCase().includes(term) || i.description?.toLowerCase().includes(term),
    )
  }
  if (userIds.length > 0) {
    result = result.filter((i: any) => i.userIds.some((uid: string) => userIds.includes(uid)))
  }
  if (myOnly && currentUser) {
    result = result.filter((i: any) => i.userIds.includes(currentUser.id))
  }
  if (recentOnly) {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    result = result.filter((i: any) => i.updatedAt > threeDaysAgo)
  }
  return result.sort((a: any, b: any) => a.listPosition - b.listPosition)
}

export default class Board extends Component {
  template() {
    const project = projectStore.project
    if (!project) return <div></div>

    return (
      <div class="board">
        <Breadcrumbs items={['Projects', project.name, 'Kanban Board']} />
        <div class="board-header">
          <h1 class="board-header-title">Kanban board</h1>
        </div>

        <div class="board-filters">
          <div class="board-filters-search">
            <i class="icon icon-search board-filters-search-icon"></i>
            <input
              type="text"
              placeholder="Search"
              value={filtersStore.searchTerm}
              input={(e: any) => filtersStore.setSearchTerm(e.target.value)}
            />
          </div>
          <div class="board-filters-avatars">
            {project.users.map((user: any) => (
              <div
                key={user.id}
                class={`board-filters-avatar ${filtersStore.userIds.includes(user.id) ? 'active' : ''}`}
                click={() => filtersStore.toggleUserId(user.id)}
              >
                <Avatar src={user.avatarUrl} name={user.name} class="!h-8 !w-8" />
              </div>
            ))}
          </div>
          <button
            class={`board-filters-button ${filtersStore.myOnly ? 'active' : ''}`}
            click={() => filtersStore.toggleMyOnly()}
          >
            Only My Issues
          </button>
          <button
            class={`board-filters-button ${filtersStore.recentOnly ? 'active' : ''}`}
            click={() => filtersStore.toggleRecentOnly()}
          >
            Recently Updated
          </button>
          {!filtersStore.areFiltersCleared && (
            <div class="board-filters-clear" click={() => filtersStore.clearAll()}>
              Clear all
            </div>
          )}
        </div>

        <div class="board-lists">
          {statusList.map((col) => (
            <BoardColumn
              key={col.id}
              status={col.id}
              issues={filterIssues(
                project.issues, col.id,
                filtersStore.searchTerm, filtersStore.userIds,
                filtersStore.myOnly, filtersStore.recentOnly,
                authStore.currentUser,
              )}
            />
          ))}
        </div>
      </div>
    )
  }
}
```

Key differences:
- Filters state lives in `FiltersStore` instead of local `useState`.
- Store is imported directly — no prop drilling or context consumers.
- `<Fragment>` replaced with a wrapper `<div>`.
- Route-based modal replaced with route params check in the parent `Project` layout.
- `@geajs/ui` `Avatar` replaces custom Avatar with `src`, `name`, and CSS override `class="!h-8 !w-8"`.
- **Filter function is pure** — defined outside the component, takes all parameters explicitly. Store values are passed in from `template()` to ensure the compiler tracks them.

### Gea: Project as a router layout with `page` prop

`Project` is registered as a layout in the route config. The router resolves the child component (Board or ProjectSettings) and passes it as `page`:

```tsx
import { Component } from '@geajs/core'
import { Dialog } from '@geajs/ui'
import { router } from '../router'
import issueStore from '../stores/issue-store'

export default class Project extends Component {
  searchModalOpen = false
  createModalOpen = false

  get issueId(): string {
    return router.params.issueId || ''
  }

  get showIssueDetail(): boolean {
    return !!this.issueId
  }

  closeIssueDetail() {
    issueStore.clear()
    router.push('/project/board')
  }

  template({ page }: any) {
    return (
      <div class="project-page">
        <NavbarLeft
          onSearchClick={() => { this.searchModalOpen = true }}
          onCreateClick={() => { this.createModalOpen = true }}
        />
        <Sidebar />

        <div class="page-content">
          {page}
        </div>

        {this.showIssueDetail && (
          <Dialog
            open={true}
            onOpenChange={(d: any) => { if (!d.open) this.closeIssueDetail() }}
            class="dialog-issue-detail"
          >
            <IssueDetails issueId={this.issueId} onClose={() => this.closeIssueDetail()} />
          </Dialog>
        )}

        {this.searchModalOpen && (
          <Dialog
            open={true}
            onOpenChange={(d: any) => { if (!d.open) this.searchModalOpen = false }}
            class="dialog-search"
          >
            <IssueSearch onClose={() => { this.searchModalOpen = false }} />
          </Dialog>
        )}

        {this.createModalOpen && (
          <Dialog
            open={true}
            onOpenChange={(d: any) => { if (!d.open) this.createModalOpen = false }}
            class="dialog-create"
          >
            <IssueCreate onClose={() => { this.createModalOpen = false }} />
          </Dialog>
        )}
      </div>
    )
  }
}
```

Key patterns:
- **Layout receives `page`**: The router resolves the child and passes it via `page` prop — no manual `router.path` checks for view switching.
- **Route params for overlays**: `router.params.issueId` drives the issue detail dialog. The Board is still the `page` — the dialog is an overlay.
- **Mixed dialog triggers**: Issue detail opens from URL params; search/create open from local state.
- **Store cleanup on close**: `issueStore.clear()` resets issue data when dialog closes.
- **Callback props for child actions**: `onSearchClick`, `onCreateClick` passed to `NavbarLeft`.

---

## Component Conversion: Function Components

Use function components for **stateless, presentational** components.

### React: Breadcrumbs

```jsx
const Breadcrumbs = ({ items }) => (
  <div className="breadcrumbs">
    {items.map((item, i) => (
      <Fragment key={i}>
        {i > 0 && <span>/</span>}
        <span>{item}</span>
      </Fragment>
    ))}
  </div>
)
```

### Gea: Breadcrumbs

```tsx
export default function Breadcrumbs({ items = [] }) {
  return (
    <div class="breadcrumbs">
      {items.map((item: string, i: number) => (
        <span key={i} class="breadcrumb-item">
          {i > 0 && <span class="breadcrumb-separator">/</span>}
          {item}
        </span>
      ))}
    </div>
  )
}
```

### React: Icon

```jsx
const Icon = ({ type, size = 16, ...props }) => (
  <i className={`icon icon-${type}`} style={{ fontSize: `${size}px` }} {...props} />
)
```

### Gea: Icon

```tsx
export default function Icon({ type, size = 16, left = 0, top = 0 }) {
  return <i class={`icon icon-${type}`} style={`font-size:${size}px;position:relative;left:${left}px;top:${top}px`}></i>
}
```

### React: Spinner

```jsx
const Spinner = ({ size = 24 }) => (
  <div className="spinner" style={{ width: size, height: size }} />
)
```

### Gea: Spinner

```tsx
export default function Spinner({ size = 24 }) {
  return <div class="spinner" style={`width:${size}px;height:${size}px`}></div>
}
```

---

## Using @geajs/ui Components

### Replacing Custom Modals with Dialog

**React (custom Modal):**
```jsx
<Modal isOpen={isOpen} onClose={handleClose}
  renderContent={modal => <IssueDetails />}
/>
```

**Gea (@geajs/ui Dialog):**
```tsx
import { Dialog } from '@geajs/ui'

{isOpen && (
  <Dialog
    open={true}
    onOpenChange={(d: any) => { if (!d.open) handleClose() }}
    class="dialog-custom-class"
  >
    <IssueDetails />
  </Dialog>
)}
```

### Replacing Custom Buttons

**React:**
```jsx
<StyledButton variant="primary" disabled={isWorking} onClick={handleSubmit}>
  {isWorking && <Spinner size={16} />}
  Save
</StyledButton>
```

**Gea (@geajs/ui Button):**
```tsx
import { Button } from '@geajs/ui'

<Button variant="default" disabled={this.isCreating} click={() => this.handleSubmit()}>
  {this.isCreating ? (
    <span class="inline-flex items-center gap-2">
      <Spinner size={16} />
      Save
    </span>
  ) : 'Save'}
</Button>
```

Button variants: `"default"`, `"destructive"`, `"ghost"`, `"outline"`, `"secondary"`, `"link"`.

### Replacing Custom Selects

**React (custom Select with useState):**
```jsx
const [type, setType] = useState('task')
<Select value={type} options={typeOptions} onChange={setType} />
```

**Gea (@geajs/ui Select):**
```tsx
import { Select } from '@geajs/ui'

// Single select — value is always an array
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

Important: `@geajs/ui` Select always uses array values. For single select, wrap the value in `[val]` and extract with `d.value[0]`.

### Replacing Custom Avatars

**React:**
```jsx
<Avatar avatarUrl={user.avatarUrl} name={user.name} size={32} />
```

**Gea (@geajs/ui Avatar):**
```tsx
import { Avatar } from '@geajs/ui'

<Avatar src={user.avatarUrl} name={user.name} class="!h-8 !w-8" />
```

Use CSS `!important` (or Tailwind's `!` prefix if using Tailwind) to override default Avatar dimensions.

### Using Link with onNavigate

**React:**
```jsx
<Link to={`/issues/${issue.id}`} onClick={() => closeModal()}>
  {issue.title}
</Link>
```

**Gea:**
```tsx
import { Link } from '@geajs/core'

<Link to={`/project/board/issues/${issue.id}`} class="issue-search-item" onNavigate={() => onClose?.()}>
  {issue.title}
</Link>
```

`onNavigate` fires after the navigation completes — use it to close modals, reset state, etc.

---

## Routing

### React Router v5

```jsx
import { Router, Switch, Route, Redirect } from 'react-router-dom'
import history from 'browserHistory'

const Routes = () => (
  <Router history={history}>
    <Switch>
      <Redirect exact from="/" to="/project/board" />
      <Route path="/authenticate" component={Authenticate} />
      <Route path="/project" component={Project} />
    </Switch>
  </Router>
)
```

### Gea: Router with guards and layouts

The Jira clone uses a bare `Router` in `router.ts` and sets routes from `App.tsx` to avoid circular dependencies (views import `router`, so `router.ts` must not import views):

```ts
// src/router.ts — bare Router, no view imports
import { Router } from '@geajs/core'
export const router = new Router()
```

Routes, guards, and layouts are configured in `App.tsx`:

```tsx
// src/App.tsx (route setup section)
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
      '/board/issues/:issueId': Board,
      '/settings': ProjectSettings,
    },
  },
})
```

Key patterns:
- `router.ts` exports a bare `Router` instance — no view imports, no circular dependencies.
- `router.setRoutes(...)` is called at module evaluation time in `App.tsx`, where both the router and view components are available.
- `'/': '/project/board'` is a static redirect — equivalent to React Router's `<Redirect from="/" to="/project/board" />`.
- `layout: Project` wraps all child routes — `Project` receives the resolved child as a `page` prop.
- `guard: AuthGuard` protects all children — the guard runs before the route renders.
- `/board/issues/:issueId` maps to the same `Board` component (the issue detail is a Dialog overlay handled by the `Project` layout).

### Auth guard

Guards are synchronous functions that check store state and return one of three values:

| Return | Effect |
|--------|--------|
| `true` | Proceed to the route |
| `string` | Redirect to that path (e.g. `'/login'`) |
| `Component` | Render it instead of the route |

```ts
export const AuthGuard = () => {
  if (authStore.isAuthenticated && !projectStore.isLoading) return true
  return PageLoader   // show loading spinner until auth + data are ready
}
```

Guards on nested groups stack parent → child. A user hitting `/admin/users` must pass both `AuthGuard` and `AdminGuard`:
```ts
'/': {
  guard: AuthGuard,
  children: {
    '/admin': {
      guard: AdminGuard,
      children: {
        '/': AdminPanel,
        '/users': UserManagement,
      }
    }
  }
}
```

Guards are intentionally synchronous — they check store state, not async APIs. For async checks, use `created()` in the component.

### App component with `Outlet`

The `App` class handles async initialization in `created()` and renders with `<Outlet />`. The route setup (shown above) runs at module evaluation time, before the App instance is created.

```tsx
// src/App.tsx (class section — route setup shown above)
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

- `<Outlet />` renders the resolved route component (or guard component if blocked).
- `router.replace(router.path)` after async init re-triggers route resolution so the guard re-evaluates and passes.
- No conditional `PageLoader` logic needed in template — the guard handles it.

### Layout components with `page` prop

```tsx
// src/views/Project.tsx — layout receives resolved child as `page`
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
        <NavbarLeft />
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

- `{page}` renders the child component resolved by the router (Board or ProjectSettings) — no manual `router.path` checks needed.
- `router.params.issueId` is available when the URL matches `/project/board/issues/:issueId`, used for the Dialog overlay.

### Sidebar navigation

```tsx
export default class Sidebar extends Component {
  template() {
    return (
      <div class="sidebar">
        <div
          class={`sidebar-link ${router.isActive('/project/board') ? 'active' : ''}`}
          click={() => router.push('/project/board')}
        >
          <Icon type="board" size={20} />
          <span>Kanban Board</span>
        </div>
        <div
          class={`sidebar-link ${router.isActive('/project/settings') ? 'active' : ''}`}
          click={() => router.push('/project/settings')}
        >
          <Icon type="settings" size={20} />
          <span>Project Settings</span>
        </div>
      </div>
    )
  }
}
```

- Use `router.isActive(path)` instead of manual `path.includes()` checks.
- `router.push(path)` for navigation (equivalent to React's `history.push`).

---

## Styling: styled-components → CSS

### Process

1. Open the React component's `Styles.js` file.
2. For each styled component, create an equivalent CSS class.
3. Extract all CSS properties verbatim — padding, margin, colors, fonts, transitions, shadows.
4. Map dynamic props (`${props => props.isActive && ...}`) to conditional CSS classes.

### Example: Filter Button

**React (styled-components):**
```js
export const StyledButton = styled(Button)`
  margin-left: 6px;
  font-size: 13px;
  ${props => props.isActive && `
    color: #fff;
    background: ${color.primary};
  `}
`
```

**Gea (CSS):**
```css
.board-filters-button {
  margin-left: 6px;
  font-size: 13px;
  background: #fff;
  line-height: 1;
}

.board-filters-button.active {
  color: #fff;
  background: var(--color-primary);
}
```

**Gea (JSX):**
```tsx
<button
  class={`board-filters-button ${filtersStore.myOnly ? 'active' : ''}`}
  click={() => filtersStore.toggleMyOnly()}
>
  Only My Issues
</button>
```

### Example: Overriding `@geajs/ui` Component Dimensions

`@geajs/ui` components have default dimensions. Override them with CSS:

```tsx
<Avatar src={user.avatarUrl} name={user.name} class="avatar-sm" />
```

```css
.avatar-sm { width: 32px !important; height: 32px !important; }
```

Or if using Tailwind, use the `!` prefix shorthand:

```tsx
<Avatar src={user.avatarUrl} name={user.name} class="!h-8 !w-8" />
```

---

## Event Handling

### React → Gea mapping

```jsx
// React                              // Gea
<input onChange={e => ...} />         <input input={(e: any) => ...} />
<button onClick={fn} />              <button click={fn} />
<div onDoubleClick={fn} />           <div dblclick={fn} />
<input onBlur={fn} />                <input blur={fn} />
<input onFocus={fn} />               <input focus={fn} />
<input onKeyDown={fn} />             <input keydown={fn} />
<form onSubmit={fn} />               <form submit={fn} />
<div draggable onDragStart={fn} />   <div draggable={true} dragstart={fn} />
```

React-style names (`onClick`, `onChange`, `onInput`) also work in Gea, but native names are preferred by convention.

### Event handler binding

**React:** Arrow functions in JSX (new function per render, but React optimizes this).

**Gea:** Method references are stable. Use arrow functions only when passing arguments:

```tsx
// Method reference — stable, preferred for simple handlers
<button click={this.handleClick} />

// Arrow function — use when passing arguments
<button click={() => this.selectItem(item.id)} />

// Arrow function — use for inline mutations
<button click={() => { this.isEditing = false }} />
```

---

## Conditional & List Rendering

### Conditional rendering

Both React and Gea use the same JSX patterns:

```tsx
{condition && <Component />}
{condition ? <A /> : <B />}
```

### List rendering

Both use `.map()` with `key`:

```tsx
{items.map(item => (
  <ItemCard key={item.id} title={item.title} />
))}
```

### Nested conditional in lists

```tsx
{issueUserIds.map((uid: string) => {
  const u = users.find((usr: any) => usr.id === uid)
  if (!u) return null
  return (
    <div class="assignee-chip" key={uid}>
      <img src={u.avatarUrl} alt={u.name} />
      <span>{u.name}</span>
      <span click={() => this.removeAssignee(uid)}>&times;</span>
    </div>
  )
})}
```

---

## Forms & Inputs

### Text input

**React:**
```jsx
<input value={value} onChange={e => setValue(e.target.value)} />
```

**Gea:**
```tsx
<input value={this.searchTerm} input={(e: any) => { this.searchTerm = e.target.value }} />
```

Use `input` for real-time updates (fires on every keystroke). Use `change` for update-on-blur.

### Number input

```tsx
<input
  class="input"
  type="number"
  min="0"
  value={this.editTimeSpent}
  input={(e: any) => { this.editTimeSpent = Number(e.target.value) || 0 }}
/>
```

### Textarea

```tsx
<textarea
  class="textarea"
  value={this.editTitle}
  input={(e: any) => { this.editTitle = e.target.value }}
  blur={() => this.saveTitle()}
  keydown={(e: any) => {
    if (e.key === 'Enter') { e.preventDefault(); this.saveTitle() }
  }}
></textarea>
```

### Select with @geajs/ui

```tsx
<Select
  class="w-full"
  items={categoryOptions}
  value={this.category ? [this.category] : []}
  onValueChange={(d: { value: string[] }) => {
    const v = d.value[0]
    if (v !== undefined) this.category = v
  }}
  placeholder="Category"
/>
{this.errors.category && <div class="form-error">{this.errors.category}</div>}
```

### Complete form example

```tsx
export default class ProjectSettings extends Component {
  name = ''
  url = ''
  category = ''
  description = ''
  isUpdating = false
  errors: Record<string, string> = {}

  created() {
    const p = projectStore.project
    if (!p) return
    this.name = p.name || ''
    this.url = p.url || ''
    this.category = p.category || ''
    this.description = p.description || ''
  }

  async handleSubmit() {
    this.errors = generateErrors(
      { name: this.name, url: this.url, category: this.category },
      {
        name: [is.required(), is.maxLength(100)],
        url: is.url(),
        category: is.required(),
      },
    )
    if (Object.keys(this.errors).length > 0) return

    this.isUpdating = true
    try {
      await projectStore.updateProject({
        name: this.name, url: this.url,
        category: this.category, description: this.description,
      })
      toastStore.success('Changes have been saved successfully.')
    } catch (e) {
      toastStore.error(e)
    } finally {
      this.isUpdating = false
    }
  }

  template() {
    return (
      <div class="project-settings">
        <div class="form-field">
          <label class="form-label">Name</label>
          <input
            class={`input ${this.errors.name ? 'input-error' : ''}`}
            type="text"
            value={this.name}
            input={(e: any) => { this.name = e.target.value }}
          />
          {this.errors.name && <div class="form-error">{this.errors.name}</div>}
        </div>

        <div class="form-field">
          <label class="form-label">Category</label>
          <Select
            class="w-full"
            items={categoryOptions}
            value={this.category ? [this.category] : []}
            onValueChange={(d: { value: string[] }) => {
              const v = d.value[0]
              if (v !== undefined) this.category = v
            }}
            placeholder="Category"
          />
          {this.errors.category && <div class="form-error">{this.errors.category}</div>}
        </div>

        <Button variant="default" disabled={this.isUpdating} click={() => this.handleSubmit()}>
          {this.isUpdating ? (
            <span class="inline-flex items-center gap-2"><Spinner size={16} /> Save changes</span>
          ) : 'Save changes'}
        </Button>
      </div>
    )
  }
}
```

---

## Form Validation

### Validator utilities

```ts
type Validator = (value: any, fieldValues?: any) => string | false

function isNilOrEmpty(value: any): boolean {
  return value === undefined || value === null || value === ''
}

export const is = {
  required: (): Validator => value => isNilOrEmpty(value) && 'This field is required',
  minLength: (min: number): Validator => value =>
    !!value && value.length < min && `Must be at least ${min} characters`,
  maxLength: (max: number): Validator => value =>
    !!value && value.length > max && `Must be at most ${max} characters`,
  url: (): Validator => value =>
    !!value && !/^(?:https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+/.test(value) && 'Must be a valid URL',
}

export function generateErrors(
  fieldValues: Record<string, any>,
  fieldValidators: Record<string, Validator | Validator[]>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [name, validators] of Object.entries(fieldValidators)) {
    const list = Array.isArray(validators) ? validators : [validators]
    for (const validator of list) {
      const msg = validator(fieldValues[name], fieldValues)
      if (msg && !errors[name]) errors[name] = msg
    }
  }
  return errors
}
```

### Usage pattern

```tsx
this.errors = generateErrors(
  { type: this.type, title: this.title, reporterId: this.reporterId, priority: this.priority },
  {
    type: is.required(),
    title: [is.required(), is.maxLength(200)],
    reporterId: is.required(),
    priority: is.required(),
  },
)
if (Object.keys(this.errors).length > 0) return
```

---

## Lifecycle Methods

| React | Gea | When it runs |
|-------|-----|-------------|
| `useEffect(() => {}, [])` | `created(props)` | After component instantiation, before first render |
| `useEffect(() => () => cleanup)` | `dispose()` | When component is removed from DOM |
| `useLayoutEffect` | `onAfterRender()` | After every render cycle |
| N/A | `onAfterRender()` | After every DOM update (use for manual DOM manipulation) |

### Example: Fetching data on mount

**React:**
```jsx
useEffect(() => {
  fetchIssue(issueId)
}, [issueId])
```

**Gea:**
```tsx
created(props: any) {
  if (props.issueId) {
    issueStore.fetchIssue(props.issueId)
  }
}
```

### Example: Pre-populating form from store

```tsx
created() {
  const p = projectStore.project
  if (!p) return
  this.name = p.name || ''
  this.url = p.url || ''
  this.category = p.category || ''
}
```

### Example: Pre-populating from auth state

```tsx
created() {
  if (authStore.currentUser) {
    this.reporterId = authStore.currentUser.id
  }
}
```

### Example: Adding/removing event listeners

**React:**
```jsx
useEffect(() => {
  const handler = e => { /* ... */ }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [])
```

**Gea:**
```tsx
private _onKey: ((e: KeyboardEvent) => void) | null = null

created() {
  this._onKey = (e: KeyboardEvent) => { /* ... */ }
  document.addEventListener('keydown', this._onKey)
}

dispose() {
  if (this._onKey) document.removeEventListener('keydown', this._onKey)
  super.dispose()
}
```

**Always call `super.dispose()`** when overriding `dispose()`.

---

## Drag-and-Drop

### Draggable card with click suppression

```tsx
export default class IssueCard extends Component {
  _didDrag = false

  handleClick() {
    if (this._didDrag) return
    router.push(`/project/board/issues/${this.props.issueId}`)
  }

  onDragStart(e: DragEvent) {
    this._didDrag = true
    const id = this.props.issueId as string
    e.dataTransfer?.setData('text/plain', id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('dragging')
  }

  onDragEnd(e: DragEvent) {
    ;(e.currentTarget as HTMLElement).classList.remove('dragging')
    queueMicrotask(() => { this._didDrag = false })
  }

  template({ issueId, title, type, priority, assignees = [] }: any) {
    return (
      <div
        class="issue-card"
        draggable={true}
        dragstart={(e: DragEvent) => this.onDragStart(e)}
        dragend={(e: DragEvent) => this.onDragEnd(e)}
        click={() => this.handleClick()}
      >
        <p class="issue-card-title">{title}</p>
        <div class="issue-card-footer">
          <div class="issue-card-footer-left">
            <IssueTypeIcon type={type} />
            <IssuePriorityIcon priority={priority} top={-1} left={4} />
          </div>
          <div class="issue-card-footer-right">
            {assignees.map((user: any) => (
              <Avatar key={user.id} src={user.avatarUrl} name={user.name} class="!h-6 !w-6" />
            ))}
          </div>
        </div>
      </div>
    )
  }
}
```

### Drop target column

```tsx
export default class BoardColumn extends Component {
  template({ status, issues = [] }: any) {
    return (
      <div class="board-list">
        <div class="board-list-title">
          {IssueStatusCopy[status]} <span class="board-list-issues-count">{issues.length}</span>
        </div>
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
            const el = e.currentTarget as HTMLElement
            el.classList.remove('board-list--drag-over')
            const id = e.dataTransfer?.getData('text/plain')
            if (id) projectStore.moveIssueToColumn(id, status)
          }}
        >
          {issues.map((issue: any) => (
            <IssueCard
              key={issue.id}
              issueId={issue.id}
              title={issue.title}
              type={issue.type}
              priority={issue.priority}
              assignees={resolveAssignees(issue, users)}
            />
          ))}
        </div>
      </div>
    )
  }
}
```

Key implementation details:
- **`_didDrag` flag + `queueMicrotask`**: After a drag, the browser fires `click`. Set `_didDrag = true` on `dragstart`, check it in `handleClick`, reset it via `queueMicrotask` (runs after `click` event) so subsequent clicks work normally.
- **`dragleave` child bubbling**: Check `e.relatedTarget` to avoid removing the drag-over class when moving between child elements within the drop target.
- **Direct class manipulation**: Use `classList.add/remove` for transient visual feedback (dragging, drag-over) instead of reactive state to avoid unnecessary re-renders.

---

## Debounced Search

```tsx
import { Component, Link } from '@geajs/core'
import api from '../utils/api'
import { sortByNewest } from '../utils/javascript'

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
    const project = projectStore.project
    const recentIssues = project ? sortByNewest([...project.issues], 'createdAt').slice(0, 10) : []
    const isSearchEmpty = !this.searchTerm.trim()

    return (
      <div class="issue-search">
        <div class="issue-search-input-cont">
          <Icon type="search" size={22} />
          <input
            class="issue-search-input"
            type="text"
            autofocus
            placeholder="Search issues by summary, description..."
            value={this.searchTerm}
            input={(e: any) => this.handleInput(e)}
          />
          {this.isLoading && <Spinner size={20} />}
        </div>

        {isSearchEmpty && recentIssues.length > 0 && (
          <div class="issue-search-section">
            <div class="issue-search-section-title">Recent Issues</div>
            {recentIssues.map((issue: any) => (
              <div key={issue.id}>
                <Link to={`/project/board/issues/${issue.id}`} class="issue-search-item" onNavigate={() => onClose?.()}>
                  <IssueTypeIcon type={issue.type} size={22} />
                  <div class="issue-search-item-data">
                    <div class="issue-search-item-title">{issue.title}</div>
                    <div class="issue-search-item-id">{issue.type}-{issue.id}</div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}

        {!isSearchEmpty && !this.isLoading && this.matchingIssues.length === 0 && (
          <div class="issue-search-no-results">
            <p>We couldn't find anything matching your search</p>
          </div>
        )}
      </div>
    )
  }
}
```

Key patterns:
- **Debounce timer as member variable**: `clearTimeout` on every keystroke, `setTimeout` to delay the search.
- **Three states**: empty (show recent), loading (show spinner), results/no results.
- **`Link` with `onNavigate`**: Close the search dialog when navigating to an issue.
- **`autofocus`**: Auto-focus the search input when the dialog opens.

---

## Keyboard Shortcuts

```tsx
export default class CommentCreate extends Component {
  isFormOpen = false
  body = ''
  isCreating = false
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

  openForm() {
    if (this.isFormOpen) return
    this.isFormOpen = true
  }

  async handleSubmit() {
    if (!this.body.trim()) return
    this.isCreating = true
    try {
      await issueStore.createComment(this.props.issueId, this.body)
      this.body = ''
      this.isFormOpen = false
    } catch (e) {
      console.error(e)
    } finally {
      this.isCreating = false
    }
  }

  template({ issueId }: any) {
    const user = authStore.currentUser
    return (
      <div class="comment-create">
        {!this.isFormOpen && (
          <div class="comment-create-collapsed">
            <div class="comment-create-fake" click={() => this.openForm()}>
              <Avatar src={user?.avatarUrl} name={user?.name || ''} class="!h-8 !w-8" />
              <span class="comment-create-placeholder">Add a comment...</span>
            </div>
            <p class="comment-pro-tip">
              <strong>Pro tip:</strong> press <strong>M</strong> to comment
            </p>
          </div>
        )}
        {this.isFormOpen && (
          <div class="comment-create-form">
            <textarea
              class="textarea"
              placeholder="Add a comment..."
              autofocus
              value={this.body}
              input={(e: any) => { this.body = e.target.value }}
            ></textarea>
            <div class="comment-create-actions">
              <Button variant="default" disabled={this.isCreating} click={() => this.handleSubmit()}>
                {this.isCreating ? (
                  <span class="inline-flex items-center gap-2"><Spinner size={16} /> Save</span>
                ) : 'Save'}
              </Button>
              <Button variant="ghost" click={() => { this.isFormOpen = false; this.body = '' }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }
}
```

Key patterns:
- **Skip when focus is on inputs**: Check `e.target.tagName` to avoid capturing keystrokes in text fields.
- **`super.dispose()`**: Always call when overriding `dispose()`.
- **Collapsed/expanded form**: Use a boolean member variable to toggle between placeholder and full form.

---

## Toast Notifications

### Store adapter

```ts
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

### App root

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

### Usage in components

```tsx
import toastStore from '../stores/toast-store'

try {
  await projectStore.createIssue(data)
  toastStore.success('Issue has been successfully created.')
  this.props.onClose?.()
} catch (e: any) {
  toastStore.error(e)
}
```

---

## Third-Party Replacements

### lodash/xor → manual toggle

```js
// React: import { xor } from 'lodash'
// mergeFilters({ userIds: xor(userIds, [user.id]) })

// Gea:
toggleUserId(id: string): void {
  const idx = this.userIds.indexOf(id)
  if (idx >= 0) this.userIds.splice(idx, 1)
  else this.userIds.push(id)
}
```

### moment/date-fns → native Intl

```ts
export function formatDateTimeConversational(date: string | null): string {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) return 'a few seconds ago'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
```

### react-beautiful-dnd → native drag events

See the [Drag-and-Drop](#drag-and-drop) section for the full implementation.

---

## File Structure Comparison

### React (Jira Clone)

```
client/src/
├── index.jsx
├── browserHistory.js
├── App/
│   ├── index.jsx
│   ├── Routes.jsx
│   ├── BaseStyles.js
│   ├── NormalizeStyles.js
│   └── Toast/
├── Auth/
│   └── Authenticate.jsx
├── Project/
│   ├── index.jsx
│   ├── ProjectSettings/
│   ├── Sidebar/
│   ├── NavbarLeft/
│   └── Board/
│       ├── index.jsx
│       ├── Header/
│       ├── Filters/
│       ├── Lists/
│       └── IssueDetails/
└── shared/
    ├── components/
    │   ├── Avatar/
    │   ├── Button/
    │   ├── Icon/
    │   ├── Modal/
    │   ├── Select/
    │   └── ...
    ├── hooks/
    ├── constants/
    └── utils/
```

### Gea (Jira Clone)

```
src/
├── main.ts
├── router.ts                    ← bare Router instance (routes set from App.tsx)
├── App.tsx
├── styles.css
├── assets/
│   └── fonts/
├── stores/
│   ├── auth-store.ts
│   ├── project-store.ts
│   ├── issue-store.ts
│   ├── filters-store.ts
│   └── toast-store.ts          ← thin adapter over @geajs/ui ToastStore
├── views/
│   ├── Board.tsx
│   ├── Project.tsx              ← router layout (receives `page` prop)
│   ├── Sidebar.tsx
│   ├── NavbarLeft.tsx
│   ├── ProjectSettings.tsx
│   ├── IssueDetails.tsx
│   ├── IssueCreate.tsx
│   ├── IssueSearch.tsx
│   ├── CommentCreate.tsx
│   └── CommentItem.tsx
├── components/
│   ├── BoardColumn.tsx
│   ├── Breadcrumbs.tsx
│   ├── ConfirmModal.tsx        ← wraps @geajs/ui Dialog
│   ├── Icon.tsx
│   ├── IssueCard.tsx
│   ├── IssueTypeIcon.tsx
│   ├── IssuePriorityIcon.tsx
│   ├── PageLoader.tsx
│   └── Spinner.tsx
├── constants/
│   ├── issues.ts
│   └── projects.ts
└── utils/
    ├── api.ts
    ├── authToken.ts
    ├── browser.ts
    ├── dateTime.ts
    ├── javascript.ts
    └── validation.ts
```

Key structural differences:
- **No `hooks/` directory** — Gea doesn't use hooks. State lives in stores and member variables.
- **No `Styles.js` files** — styling in `styles.css` (plain CSS).
- **Flatter component tree** — no `index.jsx` + `Styles.js` pairs per component.
- **`stores/` directory** — centralized state management replaces scattered `useState`/Context.
- **`views/` vs `components/`** — views are page-level class components; components are reusable primitives.
- **No custom Modal, Select, Button, Avatar** — provided by `@geajs/ui`.
- **`toast-store.ts`** — thin adapter over `@geajs/ui` `ToastStore`, not a full Store subclass.

---

## Known Pitfalls & Gotchas

These issues were discovered during the Jira clone migration. Most have been fixed in the Gea compiler, but understanding them helps avoid confusion.

### 1. `class` not `className`

Gea uses `class` (the native HTML attribute), not React's `className`. This is the single most common thing you'll need to search-and-replace.

### 2. Event naming: `input` not `onChange` for text inputs

React's `onChange` on text inputs fires on every keystroke. In Gea, `change` fires on blur. Use `input` for real-time updates.

### 3. No `<Fragment>` / `<>...</>`

Gea doesn't support fragments. Always wrap in a single root element:

```tsx
// Won't work
template() {
  return (
    <>
      <Header />
      <Content />
    </>
  )
}

// Use this instead
template() {
  return (
    <div>
      <Header />
      <Content />
    </div>
  )
}
```

### 4. Store must be a singleton

Always export `new MyStore()`, never the class. Multiple instances break the reactivity system.

### 5. `@geajs/ui` Select value is always an array

`@geajs/ui` Select always uses array values, even for single-select. Wrap single values in `[val]` and extract with `d.value[0]`:

```tsx
// WRONG
<Select value={this.type} onValueChange={(d) => { this.type = d.value }} />

// CORRECT
<Select
  value={[this.type]}
  onValueChange={(d: { value: string[] }) => {
    const v = d.value[0]
    if (v !== undefined) this.type = v
  }}
/>
```

### 6. Always call `super.dispose()`

When overriding `dispose()` in a class component, always call `super.dispose()` to ensure Gea's internal cleanup runs:

```tsx
dispose() {
  if (this._cleanup) this._cleanup()
  super.dispose()
}
```

### 7. `dangerouslySetInnerHTML` → manual innerHTML

Gea's `{variable}` interpolation renders as text, not HTML. For HTML content, use `onAfterRender`:

```tsx
onAfterRender() {
  const descEl = this.el?.querySelector('.description')
  if (descEl && this.props.html) {
    descEl.innerHTML = this.props.html
  }
}
```

### 8. Read store values in template(), not just in getters (older compiler)

For older Gea compiler versions, the compiler traces store dependencies by analyzing `template()` bodies. If you hide a store read behind a component getter, the compiler may not detect the dependency. This is fixed in later versions, but it's still good practice to be explicit:

```tsx
// Preferred: explicit store read in template
template() {
  const path = router.path
  return <div>{path.includes('/board') && <Board />}</div>
}
```

### 9. Proxy-based arrays work with standard methods

Store arrays are Proxy-wrapped, but they support all standard array methods: `.map()`, `.filter()`, `.find()`, `.some()`, `.every()`, `.reduce()`, `.includes()`, `.indexOf()`, `.length`. You don't need to spread them before using these methods.

### 10. `_didDrag` flag for drag-and-drop click suppression

After a drag operation, the browser fires a `click` event. Use a `_didDrag` flag set on `dragstart` and reset via `queueMicrotask` after `dragend`:

```tsx
_didDrag = false

handleClick() {
  if (this._didDrag) return
  router.push(...)
}

onDragStart(e: DragEvent) {
  this._didDrag = true
  // ...
}

onDragEnd(e: DragEvent) {
  // ...
  queueMicrotask(() => { this._didDrag = false })
}
```

`queueMicrotask` ensures the flag is still `true` when `click` fires (synchronously after `dragend`), but resets before the next user interaction.

### 11. Mock API tips

When the React app has a separate backend server, create a Vite middleware mock that:
- Intercepts `/api/*` routes
- Stores data in memory (arrays and objects)
- Supports CRUD operations
- Returns the same response shape as the real API

This keeps the Gea clone fully self-contained with zero external dependencies.

### 12. Copy CSS values exactly

When porting styled-components to plain CSS, copy every value verbatim — `17px` not `16px`, `#4FADE6` not `#4fade6`. Even 1px differences are visible when comparing side by side. Use the browser DevTools on the React app to inspect computed styles if the styled-components source is unclear.

### 13. Overriding `@geajs/ui` component dimensions

`@geajs/ui` components have default dimensions. Override them with `!important` in your CSS, or with Tailwind's `!` prefix if using Tailwind:

```css
.avatar-sm { width: 32px !important; height: 32px !important; }
```

### 14. Use CSS design tokens via `:root` variables

Extract design tokens from styled-components into CSS custom properties:

```css
:root {
  --color-primary: #0052cc;
  --color-success: #0B875B;
  --color-danger: #E13C3C;
  --color-text-darkest: #172B4D;
  --color-bg-medium: #dfe1e6;
  --color-bg-light-primary: #D2E5FE;
}
```

Use them in both CSS and inline styles: `background: var(--color-primary)`.

### 15. Style objects work like React

Gea supports React-style inline style objects with camelCase property names. Static objects are compiled to CSS strings at build time; dynamic values are converted at runtime. Both approaches work:

```tsx
// Style object (same as React)
<div style={{ backgroundColor: 'red', fontSize: '14px' }}>Styled</div>

// Style string (Gea-specific, also works)
<div style={`background-color:red;font-size:14px`}>Styled</div>
```

When migrating, you can keep most `style={{...}}` expressions unchanged. Gea handles the `camelCase` → `kebab-case` conversion automatically.

### 16. `ref` attribute for DOM access

React's `useRef` maps to Gea's `ref` attribute. Declare a member variable and use `ref={this.myField}`:

```tsx
export default class VideoPlayer extends Component {
  videoEl = null

  template() {
    return (
      <div class="player">
        <video ref={this.videoEl} src={this.props.src}></video>
        <button click={() => this.videoEl.play()}>Play</button>
      </div>
    )
  }
}
```

The element is assigned after render, so it's available in `onAfterRender()` and event handlers. For the component's root element, use `this.el` instead.

### 17. Spread attributes are not supported

React's `<div {...props} />` pattern does not compile in Gea. Destructure the props you need and pass them individually:

```tsx
// React
const Button = ({ className, ...rest }) => <button className={className} {...rest} />

// Gea — destructure explicitly
export default function Button({ class: cls, disabled, click, children }) {
  return <button class={cls} disabled={disabled} click={click}>{children}</button>
}
```

The compiler throws a clear error at build time if spread attributes are used.

### 18. Function-as-child is not supported

React's render-prop-as-children pattern (`<Parent>{(data) => <Child />}</Parent>`) does not work in Gea. Use a named render prop attribute instead:

```tsx
// React
<DataProvider>{(data) => <Display data={data} />}</DataProvider>

// Gea — use a named prop
<DataProvider renderContent={(data) => <Display data={data} />} />
```

Named render props (`renderContent`, `renderItem`, etc.) are fully supported.

### 19. Store object updates — direct mutation

Update store object fields directly. Each assignment triggers reactivity:

```ts
this.issue.name = 'New name'
this.issue.assignees.push({ id: '1', name: 'Alice' })
this.issue.status = 'done'
```

For bulk updates, `Object.assign` works too:

```ts
Object.assign(this.issue, fields)
```

Both approaches preserve the reactive proxy. There's no need for immutable patterns or spread operators.
