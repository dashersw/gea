import { Component } from '@geajs/core'
import { router, Link, Outlet } from '@geajs/core/router'
import authStore from '../stores/auth-store'

export default class AppShell extends Component {
  logout() {
    authStore.logout()
    router.replace('/login')
  }

  template() {
    return (
      <div class="app-shell">
        <header class="top-bar">
          <div class="top-bar-brand">Gea Router v2</div>
          <nav class="top-bar-nav">
            <Link
              to="/dashboard"
              label="Dashboard"
              class={router.isActive('/dashboard') ? 'nav-link active' : 'nav-link'}
            />
            <Link
              to="/settings?tab=profile"
              label="Settings"
              class={router.isActive('/settings') ? 'nav-link active' : 'nav-link'}
            />
          </nav>
          <div class="top-bar-user">
            <span class="user-name">{authStore.user?.name}</span>
            <button class="btn-logout" click={() => this.logout()}>
              Logout
            </button>
          </div>
        </header>
        <div class="app-content">
          <Outlet />
        </div>
      </div>
    )
  }
}
