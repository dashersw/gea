import { TabView, View } from '@geajs/mobile'
import AppNavBar from '../components/AppNavBar'
import appStore from '../app-store'

class PhotosView extends View {
  template() {
    return (
      <view>
        <div class="tab-content">
          <h2>Photos</h2>
          <div class="photo-grid">
            <div class="photo-item" style={{ backgroundColor: '#4F46E5' }}></div>
            <div class="photo-item" style={{ backgroundColor: '#059669' }}></div>
            <div class="photo-item" style={{ backgroundColor: '#D97706' }}></div>
            <div class="photo-item" style={{ backgroundColor: '#DC2626' }}></div>
            <div class="photo-item" style={{ backgroundColor: '#7C3AED' }}></div>
            <div class="photo-item" style={{ backgroundColor: '#0891B2' }}></div>
            <div class="photo-item" style={{ backgroundColor: '#BE185D' }}></div>
            <div class="photo-item" style={{ backgroundColor: '#65A30D' }}></div>
            <div class="photo-item" style={{ backgroundColor: '#CA8A04' }}></div>
          </div>
        </div>
      </view>
    )
  }
}

class MessagesView extends View {
  template() {
    return (
      <view>
        <div class="tab-content">
          <h2>Messages</h2>
          <div class="message-list">
            <div class="message-item">
              <div class="message-avatar" style={{ backgroundColor: '#4F46E5' }}>
                A
              </div>
              <div class="message-body">
                <strong>Armagan</strong>
                <p>Have you tried the new gea-mobile components?</p>
              </div>
            </div>
            <div class="message-item">
              <div class="message-avatar" style={{ backgroundColor: '#059669' }}>
                K
              </div>
              <div class="message-body">
                <strong>Kai</strong>
                <p>The gesture handler is fantastic!</p>
              </div>
            </div>
            <div class="message-item">
              <div class="message-avatar" style={{ backgroundColor: '#D97706' }}>
                S
              </div>
              <div class="message-body">
                <strong>Sofia</strong>
                <p>Pull to refresh works smoothly on mobile.</p>
              </div>
            </div>
            <div class="message-item">
              <div class="message-avatar" style={{ backgroundColor: '#DC2626' }}>
                L
              </div>
              <div class="message-body">
                <strong>Leo</strong>
                <p>ViewManager transitions feel native!</p>
              </div>
            </div>
          </div>
        </div>
      </view>
    )
  }
}

class SettingsView extends View {
  template() {
    return (
      <view>
        <div class="tab-content">
          <h2>Settings</h2>
          <div class="settings-list">
            <div class="settings-item">
              <span>Notifications</span>
              <span class="settings-value">On</span>
            </div>
            <div class="settings-item">
              <span>Theme</span>
              <span class="settings-value">Light</span>
            </div>
            <div class="settings-item">
              <span>Language</span>
              <span class="settings-value">English</span>
            </div>
            <div class="settings-item">
              <span>Cache</span>
              <span class="settings-value">12 MB</span>
            </div>
            <div class="settings-item">
              <span>Version</span>
              <span class="settings-value">1.0.0</span>
            </div>
          </div>
        </div>
      </view>
    )
  }
}

export default class TabDemoView extends TabView {
  constructor() {
    super()
    this.hasSidebar = true
    this.supportsBackGesture = true
  }

  onAfterRender() {
    const viewsEl = this.$('views')
    if (!viewsEl) return

    const photos = new PhotosView()
    const messages = new MessagesView()
    const settings = new SettingsView()

    photos.render(viewsEl)
    messages.render(viewsEl)
    settings.render(viewsEl)

    this.views = [photos, messages, settings]

    super.onAfterRender()
  }

  template() {
    return (
      <tab-view>
        <AppNavBar title="Tabs" onBackTap={() => appStore.vm.push()} onMenuTap={() => appStore.vm.toggleSidebar()} />
        <views></views>
        <tab-bar>
          <tab-items>
            <tab-item data-view="photos">Photos</tab-item>
            <tab-item data-view="messages">Messages</tab-item>
            <tab-item data-view="settings">Settings</tab-item>
          </tab-items>
        </tab-bar>
      </tab-view>
    )
  }
}
