import { Component } from '@geajs/core'
import { router, Link, Outlet } from '@geajs/core/router'

export default class DashboardLayout extends Component {
  template() {
    return (
      <div class="dashboard-layout">
        <aside class="sidebar">
          <nav class="sidebar-nav">
            <Link
              to="/dashboard"
              label="Overview"
              class={router.isActive('/dashboard') ? 'sidebar-link active' : 'sidebar-link'}
            />
            <Link
              to="/dashboard/projects"
              label="Projects"
              class={router.isActive('/dashboard/projects') ? 'sidebar-link active' : 'sidebar-link'}
            />
          </nav>
        </aside>
        <main class="dashboard-main">
          <Outlet />
        </main>
      </div>
    )
  }
}
