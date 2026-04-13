import { Component } from '../runtime/component'
import { GEA_CREATE_TEMPLATE } from '../runtime/symbols'
import { GEA_PROXY_RAW } from '../runtime/symbols'
import { getDefaultRouter } from './context'

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

export default class Link extends Component<LinkProps> {
  _createLinkTemplate() {
    const props = (this.props || {}) as LinkProps
    const el = document.createElement('a')
    el.id = this.id
    if (props.to != null) el.setAttribute('href', props.to)
    if (props.class) el.setAttribute('class', props.class)
    if (props.target) el.setAttribute('target', props.target)
    if (props.rel) el.setAttribute('rel', props.rel)
    const content = props.children ?? props.label ?? ''
    if (content) {
      if (typeof content === 'string') el.textContent = content
      else if (typeof (content as any).nodeType === 'number') el.appendChild(content as any)
      else el.textContent = String(content)
    }
    return el
  }

  onAfterRender() {
    const el = this.el as HTMLAnchorElement
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
      const router = getDefaultRouter()
      if (router) {
        this.props.replace ? router.replace(to) : router.push(to)
      }
    }
    ;(el as any).__geaLinkHandler = p.clickHandler
    el.addEventListener('click', p.clickHandler)

    const router = getDefaultRouter()
    if (router) {
      _updateActive(this, router)
      p.observerRemover = router.observe('path', () => _updateActive(this, router))
    }
  }

  dispose() {
    const el = this.el as HTMLAnchorElement | null
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
    super.dispose()
  }
}

Object.defineProperty(Link.prototype, GEA_CREATE_TEMPLATE, {
  value: (Link.prototype as any)._createLinkTemplate,
  enumerable: false,
  writable: true,
  configurable: true,
})

function _updateActive(link: Link, router: any): void {
  const el = link.el as HTMLAnchorElement
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
