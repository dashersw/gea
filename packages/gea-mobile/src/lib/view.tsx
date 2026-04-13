import { Component } from '@geajs/core'

interface ViewProps {
  children?: any
  [key: string]: any
}

export default class View extends Component {
  index: number
  supportsBackGesture: boolean
  backGestureTouchTargetWidth: number
  hasSidebar: boolean

  static width_: number | null = null

  private scrollToTopListener_: ((e: MouseEvent | TouchEvent) => void) | null = null

  constructor(props: ViewProps = {}) {
    super(props)
    this.index = 0
    this.supportsBackGesture = false
    this.backGestureTouchTargetWidth = 50
    this.hasSidebar = false
  }

  render(opt_rootEl: Node = document.body, opt_index: number = 0) {
    this.index = opt_index
    return super.render(opt_rootEl)
  }

  onAfterRender(): void {
    super.onAfterRender()
    this.el.style.zIndex = String(this.index)
    this.el.style.transform = `translate3d(0, 0, ${this.index}px)`

    this.scrollToTopListener_ = (e: MouseEvent | TouchEvent) => {
      const rect = this.el.getBoundingClientRect()
      const clientY = 'touches' in e ? e.changedTouches[0].clientY : e.clientY
      if (clientY - rect.top < 24) {
        this.scrollToTop()
      }
    }

    this.el.addEventListener('click', this.scrollToTopListener_)
  }

  scrollToTop(): void {
    const scrollable = this.findScrollableChild_(this.el)
    if (scrollable) {
      scrollable.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  private findScrollableChild_(root: HTMLElement): HTMLElement | null {
    const children = root.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement
      const style = getComputedStyle(child)
      const overflowY = style.overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && child.scrollHeight > child.clientHeight) {
        return child
      }
    }

    for (let i = 0; i < children.length; i++) {
      const found = this.findScrollableChild_(children[i] as HTMLElement)
      if (found) return found
    }

    return null
  }

  onActivation(): void {}

  panIn(isTheViewBeingPulled: boolean): void {
    if (isTheViewBeingPulled) {
      this.el.style.transitionDuration = '0s'
      this.el.style.transform = `translate3d(100%, 0, ${this.index}px)`
      requestAnimationFrame(() => {
        this.el.style.transitionDuration = '0.35s'
        requestAnimationFrame(() => {
          this.el.style.transform = `translate3d(0, 0, ${this.index}px)`
          this.el.style.boxShadow = '0 0 24px black'
        })
      })
    } else {
      window.requestAnimationFrame(() => {
        this.el.style.transitionDuration = '0s'
        this.el.style.transform = `translate3d(-30%,0,${this.index}px)`
        window.requestAnimationFrame(() => {
          this.el.style.transitionDuration = '0.35s'
          this.el.style.transform = `translate3d(0, 0, ${this.index}px)`
        })
      })
    }
  }

  panOut(isTheViewBeingPulled: boolean): void {
    const fn = (e: TransitionEvent) => {
      if (e.target !== this.el || e.propertyName !== 'transform') return
      this.el.style.transitionDuration = '0s'
      this.el.style.transform = `translate3d(-100%,-100%,${this.index}px)`
      this.el.removeEventListener('transitionend', fn)
    }

    this.el.addEventListener('transitionend', fn)

    if (isTheViewBeingPulled) {
      requestAnimationFrame(() => {
        this.el.style.transitionDuration = '0.35s'
        requestAnimationFrame(() => {
          this.el.style.transform = `translate3d(-30%, 0, ${this.index}px)`
        })
      })
    } else {
      window.requestAnimationFrame(() => {
        this.el.style.transitionDuration = '0s'
        window.requestAnimationFrame(() => {
          this.el.style.transitionDuration = '0.35s'
          this.el.style.transform = `translate3d(100%, 0, ${this.index}px)`
          this.el.style.boxShadow = '0 0 0 black'
        })
      })
    }
  }

  backGestureTouchMoveLastViewAnimation({
    lastViewDiff,
    currentViewIndex,
  }: {
    lastViewDiff: number
    currentViewIndex: number
  }): void {
    window.requestAnimationFrame(() => {
      this.el.style.transitionDuration = '0s'
      this.el.style.transform = `translate3d(${lastViewDiff}px, 0, ${currentViewIndex - 1}px)`
    })
  }

  backGestureTouchMoveCurrentViewAnimation({
    currentViewDiff,
    boxShadow,
  }: {
    currentViewDiff: number
    boxShadow: number
  }): void {
    window.requestAnimationFrame(() => {
      this.el.style.transitionDuration = '0s'
      this.el.style.transform = `translate3d(${currentViewDiff}px, 0, ${this.index}px)`
      this.el.style.boxShadow = `0px 0 24px rgba(0, 0, 0, ${boxShadow})`
    })
  }

  template(props: ViewProps = {}) {
    return <view>{props.children}</view>
  }

  dispose(): void {
    if (this.scrollToTopListener_) {
      this.el.removeEventListener('click', this.scrollToTopListener_)
      this.scrollToTopListener_ = null
    }
    super.dispose()
  }

  tagExtension_(): string {
    return `$1 id="${this.id}" view`
  }

  static get WIDTH(): number {
    if (!View.width_) {
      const bodyStyle = window.getComputedStyle(document.body, null)
      const width = parseInt((bodyStyle && bodyStyle.width) || '0', 10)
      View.width_ = width
      return View.width_
    } else {
      return View.width_
    }
  }
}
