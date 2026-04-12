import { Component } from '../component/component.js'
import { GEA_PROXY_RAW, GEA_CREATE_TEMPLATE } from '../symbols.js'

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

interface LinkPrivate {
  clickHandler: ((e: MouseEvent) => void) | null
  observerRemover: (() => void) | null
}

const _lp = new WeakMap<object, LinkPrivate>()

function rawLink(l: Link): object {
  return (l as any)[GEA_PROXY_RAW] ?? l
}

function lp(link: Link): LinkPrivate {
  const key = rawLink(link)
  let p = _lp.get(key)
  if (!p) {
    p = { clickHandler: null, observerRemover: null }
    _lp.set(key, p)
  }
  return p
}

export default class Link extends Component {
  static _router: any = null

  override [GEA_CREATE_TEMPLATE](): Node {
    const props = (this as any).props as LinkProps
    const a = document.createElement('a')
    a.id = (this as any).id
    a.setAttribute('href', props.to || '')
    if (props.class) a.setAttribute('class', props.class)
    if (props.target) a.setAttribute('target', props.target)
    if (props.rel) a.setAttribute('rel', props.rel)
    // children may be a DOM node (from compiled JSX) or a string
    const content = props.children ?? props.label ?? ''
    if (content instanceof Node) {
      a.appendChild(content)
    } else if (typeof content === 'string' && content) {
      if (content.includes('<')) {
        a.innerHTML = content
      } else {
        a.textContent = content
      }
    }
    this.el = a
    return a
  }

  onAfterRender() {
    const el = (this as any).el as HTMLAnchorElement
    if (!el) return
    const p = lp(this)

    const prev = (el as any).__geaLinkHandler as ((e: MouseEvent) => void) | undefined
    if (prev) {
      el.removeEventListener('click', prev)
    }
    if (p.observerRemover) {
      p.observerRemover()
      p.observerRemover = null
    }

    p.clickHandler = (e: MouseEvent) => {
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
    ;(el as any).__geaLinkHandler = p.clickHandler
    el.addEventListener('click', p.clickHandler)

    const router = Link._router
    if (router) {
      _updateActive(this, router)
      p.observerRemover = router.observe('path', () => _updateActive(this, router))
    }
  }

  dispose() {
    const el = (this as any).el as HTMLAnchorElement | null
    if (el) {
      const prev = (el as any).__geaLinkHandler as ((e: MouseEvent) => void) | undefined
      if (prev) {
        el.removeEventListener('click', prev)
        delete (el as any).__geaLinkHandler
      }
    }
    const p = lp(this)
    p.clickHandler = null
    if (p.observerRemover) {
      p.observerRemover()
      p.observerRemover = null
    }
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(this)); if (typeof proto?.dispose === 'function') proto.dispose.call(this)
  }
}

function _updateActive(link: Link, router: any): void {
  const el = (link as any).el as HTMLAnchorElement
  if (!el) return
  const to = link.props.to
  const active = link.props.exact ? router.isExact(to) : router.isActive(to)
  if (active) {
    el.setAttribute('data-active', '')
  } else {
    el.removeAttribute('data-active')
  }
  const raw = el.getAttribute('class') ?? ''
  const base = raw
    .replace(/\bactive\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const nextClass = active ? (base ? `${base} active` : 'active') : base
  if (nextClass) el.setAttribute('class', nextClass)
  else el.removeAttribute('class')
}
