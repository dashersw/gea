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

    this._removeStale(props)

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

    if (props.meta) {
      for (const tag of props.meta) {
        const key = tag.property || tag.name
        if (key) this._setMeta(key, tag.content)
      }
    }

    if (props.link) {
      for (const attrs of props.link) {
        let selector: string | null = null
        if (attrs.rel && attrs.href) {
          selector = `link[rel="${attrs.rel}"][href="${attrs.href}"]`
        } else if (attrs.rel) {
          selector = `link[rel="${attrs.rel}"]`
        }
        let el = selector ? (document.querySelector(selector) as HTMLLinkElement) : null
        if (!el) {
          el = document.createElement('link')
          document.head.appendChild(el)
        }
        for (const [k, v] of Object.entries(attrs)) {
          el.setAttribute(k, v as string)
        }
      }
    }

    if (props.jsonld) {
      let el = document.querySelector('script[data-head-jsonld]') as HTMLScriptElement
      if (!el) {
        el = document.createElement('script')
        el.type = 'application/ld+json'
        el.setAttribute('data-head-jsonld', '')
        document.head.appendChild(el)
      }
      const data = Array.isArray(props.jsonld) ? props.jsonld : [props.jsonld]
      const items = data.map((d: any) => ({ '@context': 'https://schema.org', ...d }))
      el.textContent = JSON.stringify(items.length === 1 ? items[0] : items)
    } else {
      const el = document.querySelector('script[data-head-jsonld]')
      if (el) el.remove()
    }
  }

  _removeStale(props: Record<string, any>) {
    if (!props.url) {
      const el = document.querySelector('link[rel="canonical"]')
      if (el) el.remove()
    }
    if (!props.image) {
      this._removeMeta('og:image')
      this._removeMeta('twitter:image')
      this._removeMeta('twitter:card')
    }
    if (!props.description) {
      this._removeMeta('description')
      this._removeMeta('og:description')
      this._removeMeta('twitter:description')
    }
  }

  _removeMeta(nameOrProperty: string) {
    const isOg = nameOrProperty.startsWith('og:') || nameOrProperty.startsWith('twitter:')
    const attr = isOg ? 'property' : 'name'
    const el = document.querySelector(`meta[${attr}="${nameOrProperty}"]`)
    if (el) el.remove()
  }

  _setMeta(nameOrProperty: string, content?: string) {
    const isOg = nameOrProperty.startsWith('og:') || nameOrProperty.startsWith('twitter:')
    const attr = isOg ? 'property' : 'name'
    if (!content) {
      const el = document.querySelector(`meta[${attr}="${nameOrProperty}"]`)
      if (el) el.remove()
      return
    }
    let el = document.querySelector(`meta[${attr}="${nameOrProperty}"]`) as HTMLMetaElement
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attr, nameOrProperty)
      document.head.appendChild(el)
    }
    el.content = content
  }
}
