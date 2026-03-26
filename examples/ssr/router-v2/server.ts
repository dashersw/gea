import { handleRequest } from '../../../packages/gea-ssr/src/handle-request'
import App from '../../router-v2/src/App'
import authStore from './src/stores/auth-store'
import { AuthGuard } from '../../router-v2/src/guards'
import AppShell from '../../router-v2/src/layouts/AppShell'
import DashboardLayout from '../../router-v2/src/layouts/DashboardLayout'
import SettingsLayout from '../../router-v2/src/layouts/SettingsLayout'
import Login from '../../router-v2/src/views/Login'
import Overview from '../../router-v2/src/views/Overview'
import Projects from '../../router-v2/src/views/Projects'
import Project from '../../router-v2/src/views/Project'
import ProfileSettings from '../../router-v2/src/views/ProfileSettings'
import BillingSettings from '../../router-v2/src/views/BillingSettings'
import NotFound from '../../router-v2/src/views/NotFound'

export default handleRequest(App, {
  routes: {
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
            '/projects/:id/edit': () => import('../../router-v2/src/views/ProjectEdit'),
          },
        },
        '/settings': {
          layout: SettingsLayout,
          mode: { type: 'query', param: 'tab' },
          children: {
            profile: ProfileSettings,
            billing: BillingSettings,
          },
        },
      },
    },

    '*': NotFound,
  },
  storeRegistry: { AuthStore: authStore },
})
