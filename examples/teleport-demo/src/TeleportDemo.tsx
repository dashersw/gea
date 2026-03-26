import { Component, Store } from '@geajs/core'

class AppState extends Store {
  showModal = false
  showSidebar = false
  counter = 0
  notifications: Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }> = []
  teleportEnabled = true

  toggleModal() {
    this.showModal = !this.showModal
  }

  toggleSidebar() {
    this.showSidebar = !this.showSidebar
  }

  incrementCounter() {
    this.counter++
  }

  decrementCounter() {
    this.counter--
  }

  resetCounter() {
    this.counter = 0
  }

  addNotification(type: 'success' | 'error' | 'info', message: string) {
    const id = Date.now().toString()
    this.notifications.push({ id, type, message })
    setTimeout(() => this.removeNotification(id), 5000)
  }

  removeNotification(id: string) {
    const index = this.notifications.findIndex((n) => n.id === id)
    if (index > -1) {
      this.notifications.splice(index, 1)
    }
  }

  toggleTeleport() {
    this.teleportEnabled = !this.teleportEnabled
  }
}

const appState = new AppState()

export default class TeleportDemo extends Component {
  constructor() {
    super()
    // Make this component reactive to appState changes
    appState.observe('', () => {
      if (this.rendered) {
        this.__geaRequestRender()
      }
    })
  }

  events = {
    click: {
      '#show-modal': () => appState.toggleModal(),
      '#show-sidebar': () => appState.toggleSidebar(),
      '#add-success': () => appState.addNotification('success', 'Success! Operation completed.'),
      '#add-error': () => appState.addNotification('error', 'Error! Something went wrong.'),
      '#add-info': () => appState.addNotification('info', 'Info: This is a notification.'),
      '#toggle-teleport': () => appState.toggleTeleport(),
      '.modal-close': () => appState.toggleModal(),
      '.sidebar-close': () => appState.toggleSidebar(),
      '.modal-overlay': (e: MouseEvent) => {
        if (e.target === e.currentTarget) {
          appState.toggleModal()
        }
      },
      '.increment-btn': () => appState.incrementCounter(),
      '.decrement-btn': () => appState.decrementCounter(),
      '.reset-btn': () => appState.resetCounter(),
      '.notification-close': (e: MouseEvent) => {
        const notificationEl = (e.target as HTMLElement).closest('.notification')
        const id = notificationEl?.getAttribute('data-notification-id')
        if (id) appState.removeNotification(id)
      },
      '.inline-test': () => appState.incrementCounter(),
    },
  }

  template() {
    return (
      <div class="container">
        <div class="section">
          <h1>🚀 GEA Teleport Demo</h1>
          <p>
            Counter: <strong class="counter-display">{appState.counter}</strong>
          </p>
          <p>
            Teleport Status:{' '}
            <span class={`status ${appState.teleportEnabled ? 'enabled' : 'disabled'}`}>
              {appState.teleportEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </p>
        </div>

        <div class="section">
          <h3>🎛️ Controls</h3>
          <div class="controls">
            <button id="show-modal">{appState.showModal ? 'Hide Modal' : 'Show Modal'}</button>
            <button id="show-sidebar">{appState.showSidebar ? 'Hide Sidebar' : 'Show Sidebar'}</button>
            <button id="add-success">Add Success</button>
            <button id="add-error">Add Error</button>
            <button id="add-info">Add Info</button>
            <button id="toggle-teleport" class={appState.teleportEnabled ? 'active' : ''}>
              Toggle Teleport
            </button>
            <button class="inline-test">Inline Test ({appState.counter})</button>
          </div>
        </div>

        <div class="section">
          <h3>📋 Features Demonstrated</h3>
          <ul>
            <li>✅ Modal dialogs teleported to different DOM locations</li>
            <li>✅ Sidebar panels with dynamic content</li>
            <li>✅ Toast notifications with auto-dismiss</li>
            <li>✅ Conditional teleporting (enable/disable)</li>
            <li>✅ Event delegation testing</li>
            <li>✅ State preservation during teleport</li>
          </ul>
        </div>

        {/* Modal Teleport */}
        <Teleport to-selector="#modal-root" disabled={!appState.teleportEnabled}>
          <div class="modal-overlay" style={appState.showModal ? 'display: flex;' : 'display: none;'}>
            <div class="modal">
              <h3>🎉 Teleported Modal</h3>
              <p>This modal is teleported to a different DOM location!</p>
              <div class="modal-content">
                <p>
                  Counter value: <strong>{appState.counter}</strong>
                </p>
                <div class="controls">
                  <button class="increment-btn">+ Increment</button>
                  <button class="decrement-btn">- Decrement</button>
                  <button class="reset-btn">Reset</button>
                </div>
              </div>
              <div class="modal-actions">
                <button class="modal-close">Close</button>
              </div>
            </div>
          </div>
        </Teleport>

        {/* Sidebar Teleport */}
        <Teleport to-selector="#sidebar-root" disabled={!appState.teleportEnabled}>
          <div class="sidebar" style={appState.showSidebar ? 'display: block;' : 'display: none;'}>
            <div class="sidebar-header">
              <h3>📱 Sidebar Panel</h3>
              <button class="sidebar-close">✕</button>
            </div>
            <div class="sidebar-content">
              <p>This sidebar is also teleported!</p>
              <p>
                <strong>Counter:</strong> {appState.counter}
              </p>
              <div class="controls">
                <button class="increment-btn">Count Up</button>
                <button class="decrement-btn">Count Down</button>
              </div>
            </div>
          </div>
        </Teleport>

        {/* Notifications Teleport */}
        <Teleport to-selector="#notification-root" disabled={!appState.teleportEnabled}>
          <div class="notifications-container">
            {appState.notifications.map((notification) => (
              <div
                key={notification.id}
                class={`notification notification-${notification.type}`}
                data-notification-id={notification.id}
              >
                <span>{notification.message}</span>
                <button class="notification-close">✕</button>
              </div>
            ))}
          </div>
        </Teleport>
      </div>
    )
  }
}
