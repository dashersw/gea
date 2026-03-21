import { Component, Outlet } from '@geajs/core'
import { Toaster } from '@geajs/ui'
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
