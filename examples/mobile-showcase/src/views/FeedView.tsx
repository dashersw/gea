import { InfiniteScroll, PullToRefresh, View } from '@geajs/mobile'
import AppNavBar from '../components/AppNavBar'
import appStore from '../app-store'
import feedStore from '../feed-store'

export default class FeedView extends View {
  p2r: PullToRefresh
  infScroll: InfiniteScroll

  constructor() {
    super()
    this.hasSidebar = true
    this.supportsBackGesture = true
    this.p2r = new PullToRefresh()
    this.infScroll = new InfiniteScroll()
    this.infScroll.endOfListText = "You've reached the end!"
  }

  onActivation(): void {
    if (!feedStore.items.length) {
      feedStore.loadInitial()
    }
    this.infScroll.showSpinner()
  }

  onAfterRender() {
    super.onAfterRender()

    const scrollEl = this.$('.feed-scroll') as HTMLElement
    const contentEl = this.$('.feed-content') as HTMLElement
    if (!scrollEl) return

    this.p2r.render(this.el, 0)
    this.el.insertBefore(this.p2r.el, scrollEl)
    this.p2r.register(scrollEl, contentEl)

    this.infScroll.render(contentEl)
    this.infScroll.register(scrollEl)

    this.p2r.on(this.p2r.EventType.SHOULD_REFRESH, () => {
      setTimeout(() => {
        feedStore.refresh()
        this.p2r.reset()
      }, 1200)
    })

    this.infScroll.on(this.infScroll.EventType.SHOULD_LOAD, () => {
      setTimeout(() => {
        feedStore.loadMore()

        if (feedStore.hasMore) {
          this.infScroll.showSpinner()
        } else {
          this.infScroll.showEndOfList()
        }
      }, 2000)
    })
  }

  template() {
    return (
      <view>
        <AppNavBar title="Feed" onBackTap={() => appStore.vm.push()} onMenuTap={() => appStore.vm.toggleSidebar()} />
        <div class="feed-scroll">
          <div class="feed-content">
            <div class="feed-list">
              {feedStore.items.map((item) => (
                <article class="feed-card" key={item?.id}>
                  <div class="feed-card-avatar" style={{ backgroundColor: item?.color || '#9CA3AF' }}>
                    {item?.author ? item.author.slice(0, 1) : ''}
                  </div>
                  <div class="feed-card-content">
                    <div class="feed-card-header">
                      <span class="feed-card-author">{item?.author || ''}</span>
                      <span class="feed-card-time">{item?.time || ''}</span>
                    </div>
                    <h3 class="feed-card-title">{item?.title || ''}</h3>
                    <p class="feed-card-body">{item?.body || ''}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </view>
    )
  }

  dispose() {
    this.p2r.dispose()
    this.infScroll.dispose()
    super.dispose()
  }
}
