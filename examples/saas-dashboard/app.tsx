import { Component } from '@geajs/core'
import { router } from '@geajs/core/router'
import Avatar from '@geajs/ui/avatar'
import { Toaster } from '@geajs/ui/toast'
import store from './store'
import OverviewView from './overview-view'
import UsersView from './users-view'
import SettingsView from './settings-view'

const pathToView: Record<string, string> = {
  '/': 'overview',
  '/users': 'users',
  '/settings': 'settings',
}

export default class App extends Component {
  created() {
    router.setRoutes({
      '/': OverviewView,
      '/users': UsersView,
      '/settings': SettingsView,
    })

    // Sync router to store
    router.observe('path', () => {
      const view = pathToView[router.path]
      if (view && view !== store.currentView) {
        store.navigate(view as any)
      }
    })

    // Sync initial route
    const view = pathToView[router.path]
    if (view) store.navigate(view as any)
  }

  template() {
    return (
      <div class="shell">
        <aside class="sidebar">
          <div class="sidebar-logo">
            <span class="logo-mark">A</span>
            <span class="logo-text">Acme Corp</span>
          </div>
          <nav class="sidebar-nav">
            <button
              class={`nav-item ${store.currentView === 'overview' ? 'active' : ''}`}
              click={() => {
                store.navigate('overview')
                router.push('/')
              }}
              data-view="overview"
            >
              <span class="nav-icon">⊞</span>Overview
            </button>
            <button
              class={`nav-item ${store.currentView === 'users' ? 'active' : ''}`}
              click={() => {
                store.navigate('users')
                router.push('/users')
              }}
              data-view="users"
            >
              <span class="nav-icon">👥</span>Users
            </button>
            <button
              class={`nav-item ${store.currentView === 'settings' ? 'active' : ''}`}
              click={() => {
                store.navigate('settings')
                router.push('/settings')
              }}
              data-view="settings"
            >
              <span class="nav-icon">⚙</span>Settings
            </button>
          </nav>
          <div class="sidebar-footer">
            <Avatar name="Admin User" />
            <div class="sidebar-user-info">
              <span class="sidebar-user-name">Admin User</span>
              <span class="sidebar-user-role">admin@acme.com</span>
            </div>
          </div>
        </aside>

        <main class="main-area">
          {store.currentView === 'overview' && <OverviewView />}
          {store.currentView === 'users' && <UsersView />}
          {store.currentView === 'settings' && <SettingsView />}
        </main>

        <Toaster />
      </div>
    )
  }
}
