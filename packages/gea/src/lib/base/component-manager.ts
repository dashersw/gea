import getUid from './uid'

interface GeaEvent extends Event {
  targetEl?: EventTarget | Node | null
}

interface GeaHTMLElement extends HTMLElement {
  parentComps?: string
}

type EventPlugin = (manager: ComponentManager) => void

const RESERVED_HTML_TAG_NAMES = new Set([
  'a',
  'abbr',
  'address',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'bdi',
  'bdo',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'link',
  'main',
  'map',
  'mark',
  'menu',
  'meta',
  'meter',
  'nav',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'picture',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'script',
  'search',
  'section',
  'select',
  'slot',
  'small',
  'source',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
])

interface ComponentLike {
  constructor: Function & { prototype: any; __geaTagName?: string; displayName?: string; name: string }
  id: string
  el?: HTMLElement
  rendered: boolean
  render(rootEl?: any, opt_index?: number): boolean
  __handleItemHandler?: (itemId: string, e: Event) => any
  [key: string]: any
}

const createElement = (() => {
  const template = document.createElement('template')

  return (htmlString: string): HTMLElement => {
    template.innerHTML = htmlString.trim()
    return template.content.firstElementChild as HTMLElement
  }
})()

export default class ComponentManager {
  static instance: ComponentManager | undefined = undefined
  static customEventTypes_: string[] = []
  static eventPlugins_: EventPlugin[] = []

  componentRegistry: Record<string, ComponentLike> = {}
  componentsToRender: Record<string, ComponentLike> = {}
  eventPlugins_: EventPlugin[] = []
  registeredDocumentEvents_: Set<string> = new Set()
  loaded_: boolean = false
  componentClassRegistry: Record<string, Function> = {}
  componentSelectorsCache_: string[] | null = null
  boundHandleEvent_: (e: Event) => void
  getUid: () => string
  createElement: (htmlString: string) => HTMLElement

  constructor() {
    this.boundHandleEvent_ = this.handleEvent.bind(this)

    if (document.body) this.onLoad()
    else document.addEventListener('DOMContentLoaded', () => this.onLoad())

    this.getUid = getUid
    this.createElement = createElement
  }

  handleEvent(e: GeaEvent): void {
    e.targetEl = e.target

    const comps = this.getParentComps(e.target as HTMLElement)
    let broken = false

    do {
      if (broken || e.cancelBubble) break

      broken = this.callHandlers(comps, e)
    } while ((e.targetEl = (e.targetEl as Node).parentNode) && e.targetEl != document.body)
  }

  onLoad(): void {
    this.loaded_ = true
    this.addDocumentEventListeners_(this.getActiveDocumentEventTypes_())
    this.installConfiguredPlugins_()

    new MutationObserver((_mutations) => {
      for (const cmpId in this.componentsToRender) {
        const comp = this.componentsToRender[cmpId]
        if (comp.__geaCompiledChild) {
          delete this.componentsToRender[cmpId]
          continue
        }
        const rendered = comp.render()

        if (rendered) delete this.componentsToRender[cmpId]
      }
    }).observe(document.body, { childList: true, subtree: true })
  }

  private static NON_BUBBLING_EVENTS_ = new Set(['blur', 'focus', 'scroll', 'mouseenter', 'mouseleave'])

  addDocumentEventListeners_(eventTypes: string[]): void {
    if (!document.body) return

    eventTypes.forEach((type) => {
      if (this.registeredDocumentEvents_.has(type)) return
      const useCapture = ComponentManager.NON_BUBBLING_EVENTS_.has(type)
      document.body.addEventListener(type, this.boundHandleEvent_, useCapture)
      this.registeredDocumentEvents_.add(type)
    })
  }

  installConfiguredPlugins_(): void {
    ComponentManager.eventPlugins_.forEach((plugin) => this.installEventPlugin_(plugin))
  }

  installEventPlugin_(plugin: EventPlugin): void {
    if (this.eventPlugins_.includes(plugin)) return
    this.eventPlugins_.push(plugin)
    plugin(this)
  }

  getParentComps(child: GeaHTMLElement): ComponentLike[] {
    let node: GeaHTMLElement = child,
      comp,
      ids
    const parentComps = []

    if ((ids = node.parentComps)) {
      ids.split(',').forEach((id) => parentComps.push(this.componentRegistry[id]))

      return parentComps
    }

    ids = []

    do {
      if ((comp = this.componentRegistry[node.id])) {
        parentComps.push(comp)
        ids.push(node.id)
      }
    } while ((node = node.parentNode as GeaHTMLElement))

    child.parentComps = ids.join(',')
    return parentComps
  }

  callHandlers(comps: ComponentLike[], e: Event): boolean {
    let broken = false

    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i]

      if (this.callEventsGetterHandler(comp, e) === false) {
        broken = true
        break
      }

      if (this.callItemHandler(comp, e) === false) {
        broken = true
        break
      }
    }

    return broken
  }

  callEventsGetterHandler(comp: ComponentLike, e: GeaEvent): any {
    if (!comp || !comp.events) return true

    const targetEl = e.targetEl as HTMLElement
    if (!targetEl || typeof targetEl.matches !== 'function') return true

    const eventType = e.type
    const handlers = comp.events[eventType]
    if (!handlers) return true

    const geaEvt = targetEl.getAttribute?.('data-gea-event')
    if (geaEvt) {
      const selector = `[data-gea-event="${geaEvt}"]`
      const handler = handlers[selector]
      if (typeof handler === 'function') {
        Object.defineProperty(e, 'currentTarget', { value: targetEl, configurable: true })
        const result = handler.call(comp, e)
        if (result === false) return false
      }
      return true
    }

    for (const selector in handlers) {
      const matched = selector.charAt(0) === '#' ? targetEl.id === selector.slice(1) : targetEl.matches(selector)

      if (matched) {
        const handler = handlers[selector]
        if (typeof handler === 'function') {
          const targetComponent = this.getOwningComponent(targetEl)
          Object.defineProperty(e, 'currentTarget', { value: targetEl, configurable: true })
          const result = handler.call(comp, e, targetComponent !== comp ? targetComponent : undefined)
          if (result === false) return false
        }
      }
    }

    return true
  }

  callItemHandler(comp: ComponentLike, e: GeaEvent): any {
    if (!comp || typeof comp.__handleItemHandler !== 'function') return true

    const targetEl = e.targetEl as HTMLElement
    if (!targetEl || typeof targetEl.getAttribute !== 'function') return true

    const itemEl = targetEl.closest?.('[data-gea-item-id]') as HTMLElement | null
    if (itemEl && comp.el && comp.el.contains(itemEl)) {
      const itemId = itemEl.getAttribute('data-gea-item-id')
      if (itemId != null) return comp.__handleItemHandler(itemId, e)
    }

    return true
  }

  getOwningComponent(node: HTMLElement | null): ComponentLike | undefined {
    let current = node
    while (current) {
      if (current.id) {
        const comp = this.getComponent(current.id)
        if (comp) return comp
      }
      current = current.parentNode as HTMLElement | null
    }
    return undefined
  }

  getComponent(id: string): ComponentLike {
    return this.componentRegistry[id]
  }

  setComponent(comp: ComponentLike): void {
    this.componentRegistry[comp.id] = comp
    if (!comp.rendered) this.componentsToRender[comp.id] = comp
    if (this.loaded_) {
      if (comp.events) {
        this.addDocumentEventListeners_(Object.keys(comp.events))
      }
    }
  }

  removeComponent(comp: ComponentLike): void {
    delete this.componentRegistry[comp.id]
    delete this.componentsToRender[comp.id]
  }

  registerComponentClass(ctor: any, tagName?: string): void {
    if (!ctor || !ctor.name) return
    if (ctor.__geaTagName && this.componentClassRegistry[ctor.__geaTagName]) return

    const normalized = tagName || ctor.__geaTagName || this.generateTagName_(ctor)
    ctor.__geaTagName = normalized
    if (!this.componentClassRegistry[normalized]) {
      this.componentClassRegistry[normalized] = ctor
      this.componentSelectorsCache_ = null
    }
  }

  generateTagName_(ctor: { displayName?: string; name?: string }): string {
    const base = ctor.displayName || ctor.name || 'component'
    const tagName = base
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
    return RESERVED_HTML_TAG_NAMES.has(tagName) ? `gea-${tagName}` : tagName
  }

  getComponentSelectors(): string[] {
    if (!this.componentSelectorsCache_) {
      this.componentSelectorsCache_ = Object.keys(this.componentClassRegistry).map((name) => `${name}`)
    }
    return this.componentSelectorsCache_
  }

  getComponentConstructor(tagName: string): Function {
    return this.componentClassRegistry[tagName]
  }

  markComponentRendered(comp: ComponentLike): void {
    delete this.componentsToRender[comp.id]
  }

  getActiveDocumentEventTypes_(): string[] {
    const eventTypes = new Set<string>(ComponentManager.customEventTypes_)
    Object.values(this.componentRegistry).forEach((comp) => {
      if (comp.events) {
        Object.keys(comp.events).forEach((type) => eventTypes.add(type))
      }
    })
    return [...eventTypes]
  }

  static getInstance(): ComponentManager {
    if (!ComponentManager.instance) ComponentManager.instance = new ComponentManager()

    return ComponentManager.instance
  }

  static registerEventTypes(eventTypes: string[]): void {
    let changed = false

    eventTypes.forEach((type) => {
      if (ComponentManager.customEventTypes_.includes(type)) return
      ComponentManager.customEventTypes_.push(type)
      changed = true
    })

    if (!changed || !ComponentManager.instance) return

    ComponentManager.instance.addDocumentEventListeners_(eventTypes)
  }

  static installEventPlugin(plugin: EventPlugin): void {
    if (ComponentManager.eventPlugins_.includes(plugin)) return
    ComponentManager.eventPlugins_.push(plugin)

    if (ComponentManager.instance && ComponentManager.instance.loaded_) {
      ComponentManager.instance.installEventPlugin_(plugin)
    }
  }
}
