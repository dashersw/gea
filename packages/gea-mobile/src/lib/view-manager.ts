import View from './view'
import { _getGestureHandler } from '../setup'
import math from './math'

enum ViewManagerState {
  DEFAULT = 'default',
  STARTED_GESTURE = 'started',
  CLOSING_SIDEBAR = 'closingSidebar',
  OPENING_SIDEBAR = 'openingSidebar',
  SIDEBAR_OPEN = 'sidebarOpen',
  GOING_TO_BACK_VIEW = 'going',
  SCROLLING = 'scrolling',
}

class ViewManager {
  history: View[]
  currentView: View | null

  private lastTouches_: number[]
  private state_: ViewManagerState
  private rootEl_: HTMLElement | null
  private hideSidebarTimeout_: ReturnType<typeof setTimeout> | null
  private firstX_: number
  private firstY_: number
  private initialized_: boolean
  private root_: Element | View | undefined
  private topIndex_: number

  constructor(opt_root?: Element | View) {
    this.history = []
    this.lastTouches_ = []
    this.state_ = ViewManagerState.DEFAULT
    this.rootEl_ = null
    this.currentView = null
    this.hideSidebarTimeout_ = null
    this.firstX_ = 0
    this.firstY_ = 0
    this.initialized_ = false
    this.root_ = undefined
    this.topIndex_ = 1

    if (opt_root) {
      this.root_ = opt_root
    }
  }

  private init_(): void {
    this.initialized_ = true

    if (this.root_ instanceof View) {
      const rootView = this.root_ as View

      if (!rootView.rendered) throw new Error(`View Manager's root is not rendered yet`)
      else this.rootEl_ = rootView.el
    } else this.rootEl_ = (this.root_ as HTMLElement | undefined) || document.body

    this.initTouchEvents_()
  }

  getLastViewInHistory(): View | null {
    return this.history[this.history.length - 1] || null
  }

  pull(view: View, opt_canGoBack?: boolean): void {
    if (!this.initialized_) this.init_()

    if (!view.rendered && this.rootEl_) view.render(this.rootEl_, (this.topIndex_ += 2))

    const currentView = this.currentView

    if (!currentView) return this.setCurrentView(view)

    if (opt_canGoBack) {
      this.history.push(currentView)
    } else {
      const history = this.history.slice(0)
      this.history = []

      setTimeout(() => {
        currentView.dispose()
        history.forEach((historicView) => historicView.dispose())
      }, 1000)
    }

    view.panIn(true)
    currentView.panOut(true)

    this.currentView = view
    this.currentView.onActivation && this.currentView.onActivation()

    this.state_ = ViewManagerState.DEFAULT
  }

  canGoBack(): boolean {
    return this.history && this.history.length > 0
  }

  push(): void {
    const lastView = this.history.pop(),
      currentView = this.currentView

    if (!lastView) return

    if (!this.initialized_) this.init_()

    lastView.panIn(false)
    currentView!.panOut(false)

    this.currentView = lastView
    lastView.onActivation && lastView.onActivation()

    setTimeout(() => currentView!.dispose(), 1000)

    this.state_ = ViewManagerState.DEFAULT
  }

  setCurrentView(view: View, opt_noDispose?: boolean): void {
    if (!this.initialized_) this.init_()

    if (!view.rendered && this.rootEl_) view.render(this.rootEl_, (this.topIndex_ += 2))

    const currentView = this.currentView

    if (!opt_noDispose) {
      setTimeout(() => currentView && currentView.dispose(), 1000)
    } else if (currentView) {
      currentView.el.style.transitionDuration = '0s'
      currentView.el.style.transform = `translate3d(100%, 0, ${currentView.index}px)`
    }

    view.index = this.topIndex_ += 2
    this.currentView = view
    this.currentView.onActivation && this.currentView.onActivation()

    this.history.forEach((historicView) => historicView.dispose())

    this.history = []

    let translation = `translate3d(0, 0, ${view.index}px)`
    view.el.style.transitionDuration = '0s'

    view.el.style.zIndex = String(view.index)

    if (this.state_ == ViewManagerState.SIDEBAR_OPEN) {
      translation = `translate3d(${128 - View.WIDTH}px, 0, ${view.index}px)`

      view.el.style.transform = translation
      this.toggleSidebar_(false)

      return
    }

    view.el.style.transform = translation

    this.state_ = ViewManagerState.DEFAULT
  }

  toggleSidebar(): void {
    if (!this.initialized_) this.init_()

    this.toggleSidebar_(this.state_ == ViewManagerState.DEFAULT)
  }

  private initTouchEvents_(): void {
    if (!this.rootEl_) return

    this.rootEl_.addEventListener('touchmove', this.onTouchMove_.bind(this), { passive: false })
    this.rootEl_.addEventListener('touchend', this.onTouchEnd_.bind(this), false)
  }

  private onTouchMove_(e: TouchEvent): void {
    const clientX = (e.changedTouches && e.changedTouches[0].clientX) || 0
    const clientY = (e.changedTouches && e.changedTouches[0].clientY) || 0
    clearTimeout(this.hideSidebarTimeout_!)

    if (this.state_ == ViewManagerState.DEFAULT || this.state_ == ViewManagerState.SIDEBAR_OPEN) {
      this.firstX_ = clientX
      this.firstY_ = clientY
    }

    if (this.state_ == ViewManagerState.DEFAULT) {
      this.lastTouches_ = []

      this.state_ = ViewManagerState.STARTED_GESTURE
    }

    if (this.state_ == ViewManagerState.STARTED_GESTURE) {
      const deltaX = Math.abs(this.firstX_ - clientX)
      const deltaY = Math.abs(this.firstY_ - clientY)

      if (deltaY > 10 && deltaY > deltaX) {
        this.state_ = ViewManagerState.SCROLLING
      } else if (clientX <= this.currentView!.backGestureTouchTargetWidth) {
        if (this.history.length && this.currentView && this.currentView.supportsBackGesture)
          this.state_ = ViewManagerState.GOING_TO_BACK_VIEW
      } else if (this.currentView && this.currentView.hasSidebar) {
        if (this.firstX_ - clientX > 10) {
          this.state_ = ViewManagerState.OPENING_SIDEBAR
          this.firstX_ = clientX
        }
      }
    }

    if (this.state_ == ViewManagerState.SIDEBAR_OPEN) this.state_ = ViewManagerState.CLOSING_SIDEBAR

    switch (this.state_) {
      case ViewManagerState.GOING_TO_BACK_VIEW:
        this.backGestureTouchMove_(e)
        break
      case ViewManagerState.CLOSING_SIDEBAR:
        this.closeSidebarTouchMove_(e)
        break
      case ViewManagerState.OPENING_SIDEBAR:
        this.openSidebarTouchMove_(e)
        break
    }
  }

  private onTouchEnd_(e: TouchEvent): void {
    switch (this.state_) {
      case ViewManagerState.GOING_TO_BACK_VIEW:
        this.backGestureTouchEnd_(e)
        break
      case ViewManagerState.OPENING_SIDEBAR: {
        const openClientX = (e.changedTouches && e.changedTouches[0].clientX) || 0
        const openDragDist = openClientX - this.firstX_
        const openThreshold = (128 - View.WIDTH) / 3
        const openLen = this.lastTouches_.length
        const openVelocity = openLen >= 2 ? this.lastTouches_[openLen - 1] - this.lastTouches_[0] : 0
        this.toggleSidebar_(openVelocity > 5 || openDragDist < openThreshold)
        break
      }
      case ViewManagerState.CLOSING_SIDEBAR: {
        const closeClientX = (e.changedTouches && e.changedTouches[0].clientX) || 0
        const closeViewPos = closeClientX - this.firstX_ + (128 - View.WIDTH)
        const closeThreshold = (128 - View.WIDTH) / 2
        const closeLen = this.lastTouches_.length
        const closeVelocity = closeLen >= 2 ? this.lastTouches_[closeLen - 1] - this.lastTouches_[0] : 0
        this.toggleSidebar_(closeVelocity >= -5 && closeViewPos < closeThreshold)
        break
      }
      case ViewManagerState.SIDEBAR_OPEN:
        if (_getGestureHandler().canTap) return
        this.toggleSidebar_(false)
        break
      default:
        this.state_ = ViewManagerState.DEFAULT
    }
  }

  private backGestureTouchEnd_(e: TouchEvent): void {
    if (!this.firstX_) return

    const history = this.history,
      lastView = this.getLastViewInHistory()!,
      currentView = this.currentView!,
      clientX = (e.changedTouches && e.changedTouches[0].clientX) || 0,
      duration = math.lerp(0.15, 0.35, (View.WIDTH - clientX) / View.WIDTH)

    window.requestAnimationFrame(() => {
      currentView.el.style.transitionDuration = duration + 's'
      lastView.el.style.transitionDuration = duration + 's'

      let currentViewX = '100%',
        lastViewX = '0'

      if (clientX < View.WIDTH / 2) {
        currentViewX = '0'
        lastViewX = '-30%'

        const fn = () => {
          lastView.el.style.transitionDuration = '0s'
          lastView.el.style.transform = `translate3d(-100%,-100%,${lastView.index}px)`
          lastView.el.removeEventListener('transitionend', fn)
        }

        lastView.el.addEventListener('transitionend', fn)
      } else {
        this.currentView = this.getLastViewInHistory()
        history.pop()

        lastView.onActivation && lastView.onActivation()

        setTimeout(() => {
          currentView.dispose()
        }, 1000)
      }

      currentView.el.style.transform = `translate3d(${currentViewX}, 0, ${currentView.index}px)`
      lastView.el.style.transform = `translate3d(${lastViewX}, 0, ${currentView.index - 1}px)`
      currentView.el.style.boxShadow = '0px 0 0px black'
    })

    this.state_ = ViewManagerState.DEFAULT
  }

  private backGestureTouchMove_(e: TouchEvent): void {
    if (!this.history.length) return

    if (e.cancelable) e.preventDefault()
    const clientX = (e.changedTouches && e.changedTouches[0].clientX) || 0

    const lastView = this.history[this.history.length - 1]
    const currentView = this.currentView!
    const currentViewDiff = clientX - this.firstX_
    const viewWidth = View.WIDTH
    const lastViewDiff = Math.floor(math.lerp(-viewWidth * 0.3, 0, currentViewDiff / (viewWidth - this.firstX_)))
    const boxShadow = Math.floor(math.lerp(1, 0, currentViewDiff / (viewWidth - this.firstX_)) * 5) / 5
    const currentViewIndex = currentView.index
    if (currentViewDiff < 0) return

    lastView.backGestureTouchMoveLastViewAnimation({ lastViewDiff, currentViewIndex })
    currentView.backGestureTouchMoveCurrentViewAnimation({ currentViewDiff, boxShadow })
  }

  private closeSidebarTouchMove_(e: TouchEvent): void {
    const clientX = (e.changedTouches && e.changedTouches[0].clientX) || 0

    this.lastTouches_.push(this.firstX_ - clientX)

    if (this.lastTouches_.length == 4) this.lastTouches_.shift()

    if (e.cancelable) e.preventDefault()

    const currentView = this.currentView!
    const viewWidth = View.WIDTH
    const sidebarOpenPos = 128 - viewWidth
    let currentViewDiff = clientX - this.firstX_ + sidebarOpenPos

    if (currentViewDiff > 0) {
      currentViewDiff = currentViewDiff * 0.5
    } else if (currentViewDiff < sidebarOpenPos) {
      const overshoot = currentViewDiff - sidebarOpenPos
      currentViewDiff = sidebarOpenPos + overshoot * 0.5
    }

    window.requestAnimationFrame(() => {
      currentView.el.style.transitionDuration = '0s'
      currentView.el.style.transform = `translate3d(${currentViewDiff}px, 0, ${currentView.index}px)`
    })
  }

  private toggleSidebar_(state: boolean): void {
    const currentView = this.currentView!,
      sidebar = document.querySelector('sidebar') as HTMLElement | null

    if (!sidebar) return

    requestAnimationFrame(() => {
      currentView.el.style.transitionDuration = '0.35s'

      let currentViewX = `${128 - View.WIDTH}px`,
        sidebarX = '0',
        sidebarZ = `${currentView.index - 1}px`

      if (!state) {
        currentViewX = '0'
        sidebarX = '100%'
        sidebarZ = '0'
        this.hideSidebarTimeout_ = setTimeout(() => {
          if (this.state_ == ViewManagerState.DEFAULT)
            sidebar.style.transform = `translate3d(${sidebarX}, 0, ${sidebarZ})`
        }, 1000)
      } else {
        sidebar.style.transform = `translate3d(${sidebarX}, 0, ${sidebarZ})`
      }
      currentView.el.style.transform = `translate3d(${currentViewX}, 0, ${currentView.index}px)`
    })

    if (state) this.state_ = ViewManagerState.SIDEBAR_OPEN
    else this.state_ = ViewManagerState.DEFAULT
  }

  private openSidebarTouchMove_(e: TouchEvent): void {
    if (_getGestureHandler().canTap) return

    const clientX = (e.changedTouches && e.changedTouches[0].clientX) || 0
    this.lastTouches_.push(this.firstX_ - clientX)

    if (this.lastTouches_.length == 4) this.lastTouches_.shift()

    if (e.cancelable) e.preventDefault()

    const sidebar = document.querySelector('sidebar') as HTMLElement | null
    const currentView = this.currentView!
    let currentViewDiff = clientX - this.firstX_

    if (!sidebar || currentViewDiff >= 0) return
    this.state_ = ViewManagerState.OPENING_SIDEBAR

    const sidebarOpenPos = 128 - View.WIDTH
    if (currentViewDiff < sidebarOpenPos) {
      const overshoot = currentViewDiff - sidebarOpenPos
      currentViewDiff = sidebarOpenPos + overshoot * 0.5
    }

    window.requestAnimationFrame(() => {
      sidebar.style.transform = `translate3d(0, 0, ${currentView.index - 1}px)`
      sidebar.style.transitionDuration = '0s'

      currentView.el.style.transitionDuration = '0s'
      currentView.el.style.transform = `translate3d(${currentViewDiff}px, 0, ${currentView.index}px)`
    })
  }

  static State = ViewManagerState
}

window.requestAnimationFrame =
  window.requestAnimationFrame || ((callback: FrameRequestCallback) => window.setTimeout(callback, 1000 / 60))

export default ViewManager
