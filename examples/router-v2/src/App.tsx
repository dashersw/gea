import { Component } from '@geajs/core'
import { router, RouterView } from '@geajs/core/router'
import { AuthGuard } from './guards'
import AppShell from './layouts/AppShell'
import DashboardLayout from './layouts/DashboardLayout'
import SettingsLayout from './layouts/SettingsLayout'
import Login from './views/Login'
import Overview from './views/Overview'
import Projects from './views/Projects'
import Project from './views/Project'
import ProfileSettings from './views/ProfileSettings'
import BillingSettings from './views/BillingSettings'
import NotFound from './views/NotFound'

const routes = {
  '/login': Login,

  '/old-dashboard': '/dashboard',

  '/': {
    layout: AppShell,
    guard: AuthGuard,
    children: {
      '/': '/dashboard',
      '/dashboard': {
        layout: DashboardLayout,
        children: {
          '/': Overview,
          '/projects': Projects,
          '/projects/:id': Project,
          '/projects/:id/edit': () => import('./views/ProjectEdit'),
        },
      },
      '/settings': {
        layout: SettingsLayout,
        mode: { type: 'query' as const, param: 'tab' },
        children: {
          profile: ProfileSettings,
          billing: BillingSettings,
        },
      },
    },
  },

  '*': NotFound,
}

export default class App extends Component {
  template() {
    if (router.error) {
      return (
        <div class="error-page">
          <h1>Something went wrong</h1>
          <p>{router.error}</p>
          <button click={() => router.replace('/')}>Go home</button>
        </div>
      )
    }
    return <RouterView routes={routes} />
  }
}
