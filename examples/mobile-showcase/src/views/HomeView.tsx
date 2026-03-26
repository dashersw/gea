import { View } from '@geajs/mobile'
import AppNavBar from '../components/AppNavBar'
import appStore from '../app-store'

type ViewName = 'feed' | 'tabs' | 'gestures'

export default class HomeView extends View {
  onNavigate?: (viewName: ViewName) => void

  constructor() {
    super()
    this.hasSidebar = true
  }

  template() {
    return (
      <view>
        <AppNavBar title="Gea Mobile" onMenuTap={() => appStore.vm.toggleSidebar()} />
        <div class="view-content home-content">
          <div class="home-hero">
            <h1 class="home-title">Gea Mobile</h1>
            <p class="home-subtitle">Mobile components for the Gea framework</p>
          </div>

          <div class="home-cards">
            <div class="home-card" tap={() => this.navigateTo('feed')}>
              <div class="home-card-icon" style={{ backgroundColor: '#4F46E5' }}>
                &#8595;
              </div>
              <div class="home-card-text">
                <h3>Feed</h3>
                <p>PullToRefresh + InfiniteScroll</p>
              </div>
            </div>

            <div class="home-card" tap={() => this.navigateTo('tabs')}>
              <div class="home-card-icon" style={{ backgroundColor: '#059669' }}>
                &#9644;
              </div>
              <div class="home-card-text">
                <h3>Tabs</h3>
                <p>TabView with swappable views</p>
              </div>
            </div>

            <div class="home-card" tap={() => this.navigateTo('gestures')}>
              <div class="home-card-icon" style={{ backgroundColor: '#D97706' }}>
                &#9995;
              </div>
              <div class="home-card-text">
                <h3>Gestures</h3>
                <p>Tap, swipe, and long-press</p>
              </div>
            </div>
          </div>

          <div class="home-info">
            <h2>Components</h2>
            <ul>
              <li>
                <strong>View</strong> &mdash; Full-screen navigable pages
              </li>
              <li>
                <strong>ViewManager</strong> &mdash; iOS-style push/pull transitions
              </li>
              <li>
                <strong>NavBar</strong> &mdash; Top navigation with back/menu
              </li>
              <li>
                <strong>Sidebar</strong> &mdash; Swipe to reveal navigation
              </li>
              <li>
                <strong>TabView</strong> &mdash; Tab-based view switching
              </li>
              <li>
                <strong>PullToRefresh</strong> &mdash; Pull down to refresh content
              </li>
              <li>
                <strong>InfiniteScroll</strong> &mdash; Load more on scroll
              </li>
              <li>
                <strong>GestureHandler</strong> &mdash; Touch gesture recognition
              </li>
            </ul>
          </div>

          <p class="home-hint">Swipe from the right edge to open the sidebar</p>
        </div>
      </view>
    )
  }

  navigateTo(viewName: ViewName): void {
    if (this.onNavigate) this.onNavigate(viewName)
  }
}
