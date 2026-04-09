import getUid from './uid'
import { Store } from '../store'
import { engineThis } from './component-internal'
import {
  GEA_COMPILED_CHILD,
  GEA_CTOR_TAG_NAME,
  GEA_DOM_EVENT_HINT,
  GEA_DOM_KEY,
  GEA_DOM_PARENT_CHAIN,
  GEA_ELEMENT,
  GEA_HANDLE_ITEM_HANDLER,
  GEA_SKIP_ITEM_HANDLER,
} from '../symbols'

export { GEA_SKIP_ITEM_HANDLER }

interface GeaEvent extends Event {
  targetEl?: EventTarget | Node | null
}

type GeaHTMLElement = HTMLElement & { [GEA_DOM_PARENT_CHAIN]?: string }

type EventPlugin = (manager: ComponentManager) => void

interface ComponentLike {
  constructor: Function & { prototype: any; [GEA_CTOR_TAG_NAME]?: string; displayName?: string; name: string }
  id: string
  el?: HTMLElement
  /** Component root when mounted; prefer over `el` for hot paths (avoids forcing render). */
  [GEA_ELEMENT]?: HTMLElement | null
  rendered: boolean
  render(rootEl?: any, opt_index?: number): boolean
  [GEA_COMPILED_CHILD]?: boolean
  [GEA_HANDLE_ITEM_HANDLER]?: (itemId: string, e: Event) => any
  events?: Record<string, Record<string, ((this: ComponentLike, e: Event, ...args: any[]) => any) | undefined>>
  [key: string]: any
}

const createElement = (() => {
  let template: HTMLTemplateElement | null = null

  return (htmlString: string): HTMLElement => {
    if (!template) template = document.createElement('template')
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

    if (typeof document !== 'undefined') {
      if (document.body) this.onLoad()
      else document.addEventListener('DOMContentLoaded', () => this.onLoad())
    }

    this.getUid = getUid
    this.createElement = createElement
  }

  handleEvent(e: GeaEvent): void {
    e.targetEl = e.target

    const comps = this.getParentComps(e.target as HTMLElement)
    const target = e.target as Node

    const bubbleStepMap = new Map<Node, number>()
    let si = 0
    for (let n: Node | null = target; n && n !== document.body; n = n.parentNode) {
      bubbleStepMap.set(n, si++)
    }

    const compCount = comps.length
    const eventsByComp: Array<ComponentLike['events'] | undefined> = new Array(compCount)
    const rootSteps: Array<number | undefined> = new Array(compCount)
    for (let i = 0; i < compCount; i++) {
      const c = comps[i]
      eventsByComp[i] = c?.events
      if (!c) {
        rootSteps[i] = undefined
        continue
      }
      const root =
        (engineThis(c)[GEA_ELEMENT] as HTMLElement | undefined | null) ??
        (typeof document !== 'undefined' ? document.getElementById(c.id) : null)
      rootSteps[i] = root ? bubbleStepMap.get(root) : undefined
    }

    let broken = false
    let step = 0

    do {
      if (broken || e.cancelBubble) break

      broken = this.callHandlers(comps, eventsByComp, e, rootSteps, step)
      step++
    } while ((e.targetEl = (e.targetEl as Node).parentNode) && e.targetEl != document.body)

    Store.flushAll()
  }

  onLoad(): void {
    this.loaded_ = true
    this.addDocumentEventListeners_(this.getActiveDocumentEventTypes_())
    this.installConfiguredPlugins_()

    new MutationObserver((_mutations) => {
      for (const cmpId in this.componentsToRender) {
        const comp = this.componentsToRender[cmpId]
        if (comp[GEA_COMPILED_CHILD]) {
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

    for (const type of eventTypes) {
      if (this.registeredDocumentEvents_.has(type)) continue
      const useCapture = ComponentManager.NON_BUBBLING_EVENTS_.has(type)
      document.body.addEventListener(type, this.boundHandleEvent_, useCapture)
      this.registeredDocumentEvents_.add(type)
    }
  }

  installConfiguredPlugins_(): void {
    for (const plugin of ComponentManager.eventPlugins_) this.installEventPlugin_(plugin)
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

    if ((ids = node[GEA_DOM_PARENT_CHAIN])) {
      const parts = ids.split(',')
      let stale = false
      for (let i = 0; i < parts.length; i++) {
        const c = this.componentRegistry[parts[i]]
        if (!c) {
          stale = true
          break
        }
        parentComps.push(c)
      }
      if (!stale) {
        return parentComps
      }
      parentComps.length = 0
      delete child[GEA_DOM_PARENT_CHAIN]
    }

    ids = []
    node = child

    do {
      if ((comp = this.componentRegistry[node.id])) {
        parentComps.push(comp)
        ids.push(node.id)
      } else if (node.id && node.nodeType === 1) {
        const cid = (node as HTMLElement).getAttribute('data-gcc')
        if (cid && (comp = this.componentRegistry[cid])) {
          parentComps.push(comp)
          ids.push(cid)
        }
      }
    } while ((node = node.parentNode as GeaHTMLElement))

    child[GEA_DOM_PARENT_CHAIN] = ids.join(',')
    return parentComps
  }

  callHandlers(
    comps: Array<ComponentLike | undefined>,
    eventsByComp: Array<ComponentLike['events'] | undefined>,
    e: Event,
    rootSteps: Array<number | undefined>,
    step: number,
  ): boolean {
    let broken = false

    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i]
      if (!comp) continue

      const rootStep = rootSteps[i]
      if (rootStep !== undefined && step > rootStep) continue

      const evResult = this.callEventsGetterHandler(comp, e as GeaEvent, eventsByComp[i])
      if (evResult === false) {
        broken = true
        break
      }

      if (evResult !== GEA_SKIP_ITEM_HANDLER && this.callItemHandler(comp, e as GeaEvent) === false) {
        broken = true
        break
      }
    }

    return broken
  }

  callEventsGetterHandler(comp: ComponentLike, e: GeaEvent, events?: ComponentLike['events']): any {
    const ev = events ?? comp.events
    if (!comp || !ev) return true

    const targetEl = e.targetEl as HTMLElement
    if (!targetEl || typeof targetEl.matches !== 'function') return true

    const eventType = e.type
    const handlers = ev[eventType]
    if (!handlers) return true

    const geaEvt = (targetEl as any)[GEA_DOM_EVENT_HINT] ?? targetEl.getAttribute?.('data-ge')
    if (geaEvt) {
      const selector = `[data-ge="${geaEvt}"]`
      const handler = handlers[selector]
      if (typeof handler === 'function') {
        Object.defineProperty(e, 'currentTarget', { value: targetEl, configurable: true })
        const result = handler.call(comp, e)
        if (result === false) return false
      }
      return true
    }

    for (const selector in handlers) {
      const matchedEl: HTMLElement | null =
        selector.charAt(0) === '#'
          ? targetEl.id === selector.slice(1)
            ? targetEl
            : null
          : selector.includes('data-ge') && typeof targetEl.closest === 'function'
            ? targetEl.closest(selector)
            : targetEl.matches(selector)
              ? targetEl
              : null

      if (matchedEl) {
        const handler = handlers[selector]
        if (typeof handler === 'function') {
          const targetComponent = this.getOwningComponent(targetEl)
          Object.defineProperty(e, 'currentTarget', { value: matchedEl, configurable: true })
          const result = handler.call(comp, e, targetComponent !== comp ? targetComponent : undefined)
          if (result === false) return false
          const hasItemRow = (targetEl as any)[GEA_DOM_KEY] != null || targetEl.getAttribute?.('data-gid') != null
          if (hasItemRow && matchedEl !== targetEl) return GEA_SKIP_ITEM_HANDLER
          return true
        }
      }
    }

    return true
  }

  callItemHandler(comp: ComponentLike, e: GeaEvent): any {
    const handleItem = comp?.[GEA_HANDLE_ITEM_HANDLER]
    if (!comp || typeof handleItem !== 'function') return true

    const targetEl = e.targetEl as HTMLElement
    if (!targetEl) return true

    let itemEl: HTMLElement | null = targetEl
    const root = (engineThis(comp)[GEA_ELEMENT] as HTMLElement | undefined) ?? comp.el
    while (itemEl && itemEl !== root) {
      if ((itemEl as any)[GEA_DOM_KEY] != null || itemEl.getAttribute?.('data-gid')) break
      itemEl = itemEl.parentElement
    }
    if (itemEl && itemEl !== root) {
      const itemId = (itemEl as any)[GEA_DOM_KEY] ?? itemEl.getAttribute?.('data-gid')
      if (itemId != null) return handleItem.call(comp, itemId, e)
    }

    return true
  }

  getOwningComponent(node: HTMLElement | null): ComponentLike | undefined {
    let current = node
    while (current) {
      if (current.id) {
        const comp = this.getComponent(current.id)
        if (comp) return comp
        if (current.nodeType === 1) {
          const cid = current.getAttribute('data-gcc')
          if (cid) {
            const comp2 = this.getComponent(cid)
            if (comp2) return comp2
          }
        }
      }
      current = current.parentNode as HTMLElement | null
    }
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
    const existingTag = ctor[GEA_CTOR_TAG_NAME] as string | undefined
    if (existingTag && this.componentClassRegistry[existingTag]) return

    const normalized = tagName || existingTag || this.generateTagName_(ctor)
    ctor[GEA_CTOR_TAG_NAME] = normalized
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
    return tagName.includes('-') ? tagName : `gea-${tagName}`
  }

  getComponentSelectors(): string[] {
    if (!this.componentSelectorsCache_) {
      this.componentSelectorsCache_ = Object.keys(this.componentClassRegistry)
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
    for (const comp of Object.values(this.componentRegistry)) {
      if (comp.events) {
        for (const type of Object.keys(comp.events)) eventTypes.add(type)
      }
    }
    return [...eventTypes]
  }

  static getInstance(): ComponentManager {
    if (!ComponentManager.instance) ComponentManager.instance = new ComponentManager()

    return ComponentManager.instance
  }

  static registerEventTypes(eventTypes: string[]): void {
    let changed = false

    for (const type of eventTypes) {
      if (ComponentManager.customEventTypes_.includes(type)) continue
      ComponentManager.customEventTypes_.push(type)
      changed = true
    }

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
