import Component from '../base/component'

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export interface LinkProps {
  to: string
  replace?: boolean
  exact?: boolean
  class?: string
  label?: string
  children?: string
  target?: string
  rel?: string
  onNavigate?: (e: MouseEvent) => void
}

export default class Link extends Component<LinkProps> {
  static _router: any = null

  private _clickHandler: ((e: MouseEvent) => void) | null = null
  private _observerRemover: (() => void) | null = null

  template(props: LinkProps) {
    const cls = props.class ? ` class="${escapeAttr(props.class)}"` : ''
    const target = props.target ? ` target="${escapeAttr(props.target)}"` : ''
    const rel = props.rel ? ` rel="${escapeAttr(props.rel)}"` : ''
    const content = props.children ?? props.label ?? ''
    return `<a id="${this.id}" href="${escapeAttr(props.to)}"${cls}${target}${rel}>${content}</a>` as any
  }

  onAfterRender() {
    const el = this.el as HTMLAnchorElement
    if (!el) return

    this._clickHandler = (e: MouseEvent) => {
      const to = this.props.to
      if (!to) return
      if (to.startsWith('http://') || to.startsWith('https://')) return
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      this.props.onNavigate?.(e)
      const router = Link._router
      if (router) {
        this.props.replace ? router.replace(to) : router.push(to)
      }
    }
    el.addEventListener('click', this._clickHandler)

    const router = Link._router
    if (router) {
      this._updateActive(router)
      this._observerRemover = router.observe('path', () => this._updateActive(router))
    }
  }

  private _updateActive(router: any): void {
    const el = this.el as HTMLAnchorElement
    if (!el) return
    const to = this.props.to
    const active = this.props.exact ? router.isExact(to) : router.isActive(to)
    if (active) {
      el.setAttribute('data-active', '')
    } else {
      el.removeAttribute('data-active')
    }
    // Keep `class` in sync with router when `path` changes — the template only
    // evaluated `class={...}` at first render; without this, `.active` stays stale.
    const raw = el.getAttribute('class') ?? ''
    const base = raw
      .replace(/\bactive\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const nextClass = active ? (base ? `${base} active` : 'active') : base
    if (nextClass) el.setAttribute('class', nextClass)
    else el.removeAttribute('class')
  }

  dispose() {
    if (this._clickHandler && this.el) {
      this.el.removeEventListener('click', this._clickHandler)
      this._clickHandler = null
    }
    if (this._observerRemover) {
      this._observerRemover()
      this._observerRemover = null
    }
    super.dispose()
  }
}
