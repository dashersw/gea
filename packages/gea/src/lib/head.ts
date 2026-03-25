import Component from './base/component'

export class Head extends Component {
  static _current: Record<string, any> | null = null

  template() {
    if (!Head._current) Head._current = {}
    const props = this.props || {}
    for (const [key, value] of Object.entries(props)) {
      if (key === 'id') continue
      if (Array.isArray(value) && Array.isArray(Head._current[key])) {
        Head._current[key] = [...Head._current[key], ...value]
      } else {
        Head._current[key] = value
      }
    }

    if (typeof document !== 'undefined' && !Component._ssgMode) {
      this._updateHead()
      return `<div id="${this.id}" hidden></div>`
    }

    return ''
  }

  _updateHead() {
    const props = this.props || {}
    if (props.title) document.title = props.title

    this._setMeta('description', props.description)
    this._setMeta('og:title', props.title)
    this._setMeta('og:description', props.description)
    this._setMeta('og:image', props.image)
    this._setMeta('og:url', props.url)
    this._setMeta('og:type', props.type || (props.title ? 'website' : undefined))
    this._setMeta('twitter:title', props.title)
    this._setMeta('twitter:description', props.description)
    this._setMeta('twitter:image', props.image)
    if (props.image) this._setMeta('twitter:card', 'summary_large_image')

    if (props.url) {
      let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement
      if (!el) {
        el = document.createElement('link')
        el.rel = 'canonical'
        document.head.appendChild(el)
      }
      el.href = props.url
    }
  }

  _setMeta(nameOrProperty: string, content?: string) {
    if (!content) return
    const isOg = nameOrProperty.startsWith('og:') || nameOrProperty.startsWith('twitter:')
    const attr = isOg ? 'property' : 'name'
    let el = document.querySelector(`meta[${attr}="${nameOrProperty}"]`) as HTMLMetaElement
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attr, nameOrProperty)
      document.head.appendChild(el)
    }
    el.content = content
  }
}
