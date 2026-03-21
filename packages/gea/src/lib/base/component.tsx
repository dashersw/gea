import ComponentManager from './component-manager'
import { applyListChanges } from './list'
import { Store } from '../store'
import type { StoreChange } from '../store'
import type { ListConfig } from './list'

function __geaSyncItemKey(item: any): string {
  if (item != null && typeof item === 'object' && 'id' in item) {
    return String((item as any).id)
  }
  return String(item)
}

export default class Component extends Store {
  static __componentClasses: Map<string, Function> = new Map()

  id_: string
  element_: HTMLElement | null
  __bindings: any[]
  __selfListeners: Array<() => void>
  __childComponents: Component[]
  actions: any
  __geaDependencies: any[]
  __geaEventBindings: Map<string, any>
  __geaPropBindings: Map<string, any>
  __geaAttrBindings: Map<string, any>
  __observer_removers__: Array<() => void>
  rendered_: boolean
  props: any
  declare parentComponent?: Component;
  [key: string]: any

  constructor(props: any = {}) {
    super()
    this.id_ = ComponentManager.getInstance().getUid()
    this.element_ = null
    this.__bindings = []
    this.__selfListeners = []
    this.__childComponents = []
    this.actions = undefined
    this.__geaDependencies = []
    this.__geaEventBindings = new Map()
    this.__geaPropBindings = new Map()
    this.__geaAttrBindings = new Map()
    this.__observer_removers__ = []

    const Ctor = this.constructor
    ComponentManager.getInstance().registerComponentClass(Ctor)
    Component.__componentClasses.set(Ctor.name, Ctor)

    this.rendered_ = false

    let _propsProxy = this.__createPropsProxy(props || {})
    Object.defineProperty(this, 'props', {
      get: () => _propsProxy,
      set: (newProps: any) => {
        _propsProxy = this.__createPropsProxy(newProps || {})
      },
      configurable: true,
      enumerable: true,
    })

    ComponentManager.getInstance().setComponent(this)

    this.created(this.props)
    this.createdHooks(this.props)

    if (typeof (this as any).__setupLocalStateObservers === 'function') {
      ;(this as any).__setupLocalStateObservers()
    }
  }

  created(_props: any) {}

  createdHooks(_props: any) {}

  get id() {
    return this.id_
  }

  get el() {
    if (!this.element_) {
      const existing = document.getElementById(this.id_)
      if (existing) {
        this.element_ = existing
      } else {
        this.element_ = ComponentManager.getInstance().createElement(String(this.template(this.props)).trim())
      }
    }
    return this.element_
  }

  $$<T extends HTMLElement = HTMLElement>(selector?: string): T[] {
    let rv: T[] = []
    const el = this.el

    if (el) {
      if (selector == undefined || selector === ':scope') rv = [el as T]
      else rv = [...el.querySelectorAll<T>(selector)]
    }

    return rv
  }

  $<T extends HTMLElement = HTMLElement>(selector?: string): T | null {
    let rv: T | null = null
    const el = this.element_

    if (el) {
      rv = (selector == undefined || selector === ':scope' ? el : el.querySelector<T>(selector)) as T | null
    }

    return rv
  }

  __applyListChanges(container: HTMLElement, array: any[], changes: StoreChange[] | null, config: ListConfig) {
    const prevCount = container.childElementCount
    applyListChanges(container, array, changes, config)
    if (container.childElementCount !== prevCount) {
      this.instantiateChildComponents_()
    }
  }

  render(rootEl, opt_index = Infinity) {
    if (this.rendered_) return true

    this.element_ = this.el

    if (rootEl) {
      if (opt_index < 0) opt_index = Infinity

      if (rootEl != this.element_.parentElement) {
        rootEl.insertBefore(this.element_, rootEl.children[opt_index])
      } else {
        let newIndex = opt_index
        let elementIndex = 0
        let t = this.element_

        while ((t = t.previousElementSibling as HTMLElement)) elementIndex++

        if (elementIndex < newIndex) newIndex++

        if (
          !(
            elementIndex == newIndex ||
            (newIndex >= rootEl.childElementCount && this.element_ == rootEl.lastElementChild)
          )
        ) {
          rootEl.insertBefore(this.element_, rootEl.children[newIndex])
        }
      }
    }

    this.rendered_ = true
    ComponentManager.getInstance().markComponentRendered(this)

    this.attachBindings_()
    this.mountCompiledChildComponents_()
    this.instantiateChildComponents_()
    this.setupEventDirectives_()

    this.onAfterRender()
    this.onAfterRenderHooks()

    requestAnimationFrame(() => this.onAfterRenderAsync())

    return true
  }

  get rendered() {
    return this.rendered_
  }

  onAfterRender() {}

  onAfterRenderAsync() {}

  onAfterRenderHooks() {}

  __createPropsProxy(raw: any) {
    const component = this // eslint-disable-line @typescript-eslint/no-this-alias
    return new Proxy(raw, {
      get(target, prop) {
        return target[prop as any]
      },
      set(target, prop, value) {
        if (typeof prop === 'symbol') {
          target[prop as any] = value
          return true
        }
        const prev = target[prop]
        target[prop] = value
        if (typeof (component as any).__onPropChange === 'function') {
          if (value !== prev || (typeof prev === 'object' && prev !== null)) {
            ;(component as any).__onPropChange(prop, value)
          }
        }
        return true
      },
    })
  }

  __reactiveProps(obj: any) {
    return obj
  }

  __geaUpdateProps(nextProps: Record<string, any>) {
    if (!this.rendered_) {
      const el = document.getElementById(this.id_)
      if (el) {
        this.element_ = el
        this.rendered_ = true
      }
    }
    for (const key in nextProps) {
      this.props[key] = nextProps[key]
    }
    if (typeof (this as any).__onPropChange !== 'function' && typeof this.__geaRequestRender === 'function') {
      this.__geaRequestRender()
    }
  }

  toString() {
    return String(this.template(this.props)).trim()
  }

  template(_props: any): any {
    return '<div></div>'
  }

  dispose() {
    ComponentManager.getInstance().removeComponent(this)

    this.element_ && this.element_.parentNode && this.element_.parentNode.removeChild(this.element_)
    this.element_ = null

    if (this.__observer_removers__) {
      this.__observer_removers__.forEach((fn) => fn())
      this.__observer_removers__ = []
    }

    this.cleanupBindings_()
    this.teardownSelfListeners_()
    this.__childComponents.forEach((child) => child && child.dispose && child.dispose())
    this.__childComponents = []
  }

  __geaRequestRender() {
    if (!this.element_ || !this.element_.parentNode) return

    const parent = this.element_.parentNode
    const nextSibling = this.element_.nextSibling
    const activeElement = document.activeElement as HTMLElement | null
    const shouldRestoreFocus = Boolean(activeElement && this.element_.contains(activeElement))
    const focusedId = shouldRestoreFocus ? activeElement?.id || null : null
    const restoreRootFocus = Boolean(shouldRestoreFocus && activeElement === this.element_)
    const selectionStart =
      shouldRestoreFocus && activeElement && 'selectionStart' in activeElement
        ? ((activeElement as HTMLInputElement | HTMLTextAreaElement).selectionStart ?? null)
        : null
    const selectionEnd =
      shouldRestoreFocus && activeElement && 'selectionEnd' in activeElement
        ? ((activeElement as HTMLInputElement | HTMLTextAreaElement).selectionEnd ?? null)
        : null
    const focusedValue =
      shouldRestoreFocus && activeElement && 'value' in activeElement
        ? String((activeElement as HTMLInputElement | HTMLTextAreaElement).value ?? '')
        : null

    this.cleanupBindings_()
    this.teardownSelfListeners_()
    if (this.__childComponents && this.__childComponents.length) {
      this.__childComponents.forEach((child) => {
        if (!child) return
        if (child['__geaCompiledChild']) {
          child.rendered_ = false
          child.element_ = null
          return
        }
        if (typeof child.dispose == 'function') child.dispose()
      })
      this.__childComponents = []
    }

    const manager = ComponentManager.getInstance()
    const newElement = manager.createElement(String(this.template(this.props)).trim())

    parent.insertBefore(newElement, nextSibling)
    parent.removeChild(this.element_)

    this.element_ = newElement
    this.rendered_ = true
    manager.markComponentRendered(this)

    this.attachBindings_()
    this.mountCompiledChildComponents_()
    this.instantiateChildComponents_()
    this.setupEventDirectives_()

    if (shouldRestoreFocus) {
      const focusTarget =
        (focusedId ? (document.getElementById(focusedId) as HTMLElement | null) || null : null) ||
        (restoreRootFocus ? this.element_ : null)
      if (focusTarget && this.element_.contains(focusTarget) && typeof focusTarget.focus === 'function') {
        focusTarget.focus()
        if (
          selectionStart !== null &&
          selectionEnd !== null &&
          'setSelectionRange' in focusTarget &&
          typeof (focusTarget as HTMLInputElement | HTMLTextAreaElement).setSelectionRange === 'function'
        ) {
          const textTarget = focusTarget as HTMLInputElement | HTMLTextAreaElement
          const nextValue = 'value' in textTarget ? String(textTarget.value ?? '') : ''
          const delta =
            focusedValue !== null && selectionStart === selectionEnd ? nextValue.length - focusedValue.length : 0
          const nextStart = Math.max(0, Math.min(nextValue.length, selectionStart + delta))
          const nextEnd = Math.max(0, Math.min(nextValue.length, selectionEnd + delta))
          textTarget.setSelectionRange(nextStart, nextEnd)
        }
      }
    }

    this.onAfterRender()
    this.onAfterRenderHooks()
    setTimeout(() => requestAnimationFrame(() => this.onAfterRenderAsync()))
  }

  attachBindings_() {
    this.cleanupBindings_()
  }

  static _register(ctor: any) {
    if (!ctor || !ctor.name || ctor.__geaAutoRegistered) return
    if (Object.getPrototypeOf(ctor.prototype) === Component.prototype) {
      ctor.__geaAutoRegistered = true
      Component.__componentClasses.set(ctor.name, ctor)
      const manager = ComponentManager.getInstance()
      const tagName = manager.generateTagName_(ctor)
      manager.registerComponentClass(ctor, tagName)
    }
  }

  instantiateChildComponents_() {
    if (!this.element_) return

    const manager = ComponentManager.getInstance()
    const selectors = manager.getComponentSelectors()

    let elements = []
    if (selectors.length > 0) {
      elements = Array.from(this.element_.querySelectorAll(selectors.join(',')))
    }

    elements.forEach((el) => {
      if (el.getAttribute('data-gea-component-mounted')) return
      if (el.hasAttribute('data-gea-compiled-child-root')) return

      const ctorName = el.constructor.name
      if (ctorName !== 'HTMLUnknownElement' && ctorName !== 'HTMLElement') return

      const tagName = el.tagName.toLowerCase()

      let Ctor = manager.getComponentConstructor(tagName)

      if (!Ctor && Component.__componentClasses) {
        const pascalCase = tagName
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('')
        Ctor = Component.__componentClasses.get(pascalCase)
        if (Ctor) {
          manager.registerComponentClass(Ctor, tagName)
        }
      }

      if (!Ctor) return

      const props = this.extractComponentProps_(el)
      const itemId = el.getAttribute('data-prop-item-id')
      const child = new Ctor(props)
      child.parentComponent = this
      this.__childComponents.push(child)

      const parent = el.parentElement
      if (!parent) return
      const children = Array.prototype.slice.call(parent.children)
      const index = children.indexOf(el)

      child.render(parent, index)
      if (itemId != null && child.el) {
        const wrapper = document.createElement('div')
        wrapper.setAttribute('data-gea-item-id', itemId)
        parent.replaceChild(wrapper, child.el)
        wrapper.appendChild(child.el)
      }
      child.el && child.el.setAttribute('data-gea-component-root', child.id)
      parent.removeChild(el)
    })
  }

  mountCompiledChildComponents_() {
    const manager = ComponentManager.getInstance()
    const seen = new Set<Component>()

    const collect = (value: any) => {
      if (!value) return
      if (Array.isArray(value)) {
        value.forEach(collect)
        return
      }
      if (value && typeof value === 'object' && value.__geaCompiledChild && value.parentComponent === this) {
        if (!seen.has(value)) {
          seen.add(value)
          if (!this.__childComponents.includes(value)) {
            this.__childComponents.push(value)
          }
        }
      }
    }

    Object.keys(this).forEach((key) => {
      collect(this[key])
    })

    seen.forEach((child) => {
      const existing = document.getElementById(child.id)
      if (!existing) return
      if (child.rendered_ && child.element_ === existing) return
      existing.setAttribute('data-gea-compiled-child-root', '')
      child.element_ = existing
      child.rendered_ = true
      manager.markComponentRendered(child)
      child.attachBindings_()
      child.mountCompiledChildComponents_()
      child.instantiateChildComponents_()
      child.setupEventDirectives_()
      child.onAfterRender()
      child.onAfterRenderHooks()
      requestAnimationFrame(() => child.onAfterRenderAsync())
    })
  }

  __geaSwapChild(markerId: string, newChild: Component | false | null | undefined) {
    const marker = document.getElementById(this.id_ + '-' + markerId)
    if (!marker) return

    const oldEl = marker.nextElementSibling as HTMLElement | null

    if (newChild && newChild.rendered_ && newChild.element_ === oldEl) return

    if (oldEl && oldEl.tagName !== 'TEMPLATE') {
      const oldChild = this.__childComponents.find((c) => c.element_ === oldEl)
      if (oldChild) {
        oldChild.rendered_ = false
        oldChild.element_ = null
      }
      oldEl.remove()
    }

    if (!newChild) return

    const html = String(newChild.template(newChild.props)).trim()
    marker.insertAdjacentHTML('afterend', html)
    const newEl = marker.nextElementSibling as HTMLElement | null
    if (!newEl) return

    newChild.element_ = newEl
    newChild.rendered_ = true
    if (!this.__childComponents.includes(newChild)) {
      this.__childComponents.push(newChild)
    }
    const mgr = ComponentManager.getInstance()
    mgr.markComponentRendered(newChild)
    newChild.attachBindings_()
    newChild.mountCompiledChildComponents_()
    newChild.instantiateChildComponents_()
    newChild.setupEventDirectives_()
    newChild.onAfterRender()
    newChild.onAfterRenderHooks()
  }

  cleanupBindings_() {
    this.__bindings = []
  }

  setupEventDirectives_() {
    return
  }

  teardownSelfListeners_() {
    this.__selfListeners.forEach((remove) => {
      if (typeof remove == 'function') remove()
    })
    this.__selfListeners = []
  }

  extractComponentProps_(el) {
    const props = {}
    if (!el.getAttributeNames) return props

    el.getAttributeNames()
      .filter((name) => name.startsWith('data-prop-'))
      .forEach((name) => {
        const value = el.getAttribute(name)
        const propName = this.normalizePropName_(name.slice(10))

        if (this.__geaPropBindings && value && value.startsWith('__gea_prop_')) {
          const propValue = this.__geaPropBindings.get(value)
          if (propValue === undefined) {
            console.warn(`[gea] Prop binding not found for ${value} on component ${this.constructor.name}`)
          }
          props[propName] = propValue
        } else {
          props[propName] = this.coerceStaticPropValue_(value)
        }

        el.removeAttribute(name)
      })

    if (!('children' in props)) {
      const inner = el.innerHTML
      if (inner) props['children'] = inner
    }

    return props
  }

  coerceStaticPropValue_(value) {
    if (value == null) return undefined
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
    return value
  }

  normalizePropName_(name) {
    return name.replace(/-([a-z])/g, (_, chr) => chr.toUpperCase())
  }

  __geaRegisterMap(
    idx: number,
    containerProp: string,
    getContainer: () => HTMLElement | null,
    getItems: () => any[],
    createItem: (item: any) => HTMLElement,
  ): void {
    if (!this.__geaMaps) this.__geaMaps = {}
    this.__geaMaps[idx] = { containerProp, getContainer, getItems, createItem, container: null as HTMLElement | null }
  }

  __geaSyncMap(idx: number): void {
    if (!this.rendered_) return
    const map = this.__geaMaps?.[idx]
    if (!map) return
    // Always re-resolve: after a full template rerender, `getContainer()` points at the
    // live subtree but a cached `map.container` would still reference a detached node.
    let container = map.getContainer()
    if (!container) return

    // When a map is inside a conditional slot, its items may be nested in a
    // descendant element (e.g. a wrapper div rendered by the slot content)
    // rather than being direct children of the registered container.
    // Resolve the actual parent by finding an item whose id starts with
    // the container's own id prefix.
    if (container.id) {
      let hasDirectItems = false
      for (let n: ChildNode | null = container.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1 && (n as HTMLElement).hasAttribute('data-gea-item-id')) {
          hasDirectItems = true
          break
        }
        if (n.nodeType === 8 && !(n as any).data) break
      }
      if (!hasDirectItems) {
        const nested = container.querySelector(`[id^="${container.id}-"][data-gea-item-id]`)
        if (nested?.parentElement && nested.parentElement !== container) {
          container = nested.parentElement
        } else if (!nested) {
          let insideCondSlot = false
          for (let s: ChildNode | null = container.firstChild; s; s = s.nextSibling) {
            if (s.nodeType === 8 && (s as Comment).data && /-c\d+$/.test((s as Comment).data)) {
              insideCondSlot = true
              break
            }
          }
          if (insideCondSlot) return
        }
      }
    }

    map.container = container
    ;(this as any)[map.containerProp] = container
    const items = map.getItems()
    const normalizedItems = Array.isArray(items) ? items : []
    this.__geaSyncItems(container, normalizedItems, map.createItem)
  }

  __geaSyncItems(container: HTMLElement, items: any[], createItemFn: (item: any, index?: number) => HTMLElement): void {
    const c = container as any
    let prev: any[] | undefined = c.__geaPrev
    if (!prev) {
      prev = []
      for (let n: ChildNode | null = container.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) {
          const aid = (n as HTMLElement).getAttribute('data-gea-item-id')
          if (aid) prev.push(aid)
        } else if (n.nodeType === 8 && !(n as any).data) break
      }
      c.__geaCount = prev.length
    }

    if (prev.length === items.length) {
      let same = true
      for (let j = 0; j < prev.length; j++) {
        if (__geaSyncItemKey(prev[j]) !== __geaSyncItemKey(items[j])) {
          same = false
          break
        }
      }
      if (same) {
        c.__geaPrev = items.slice()
        return
      }
    }

    if (items.length > prev.length) {
      let appendOk = true
      for (let j = 0; j < prev.length; j++) {
        if (__geaSyncItemKey(prev[j]) !== __geaSyncItemKey(items[j])) {
          appendOk = false
          break
        }
      }
      if (appendOk) {
        const frag = document.createDocumentFragment()
        for (let j = prev.length; j < items.length; j++) {
          frag.appendChild(createItemFn(items[j], j))
        }
        let marker: ChildNode | null = null
        for (let sc: ChildNode | null = container.firstChild; sc; sc = sc.nextSibling) {
          if (sc.nodeType === 8 && !(sc as any).data) {
            marker = sc
            break
          }
        }
        container.insertBefore(frag, marker)
        c.__geaPrev = items.slice()
        c.__geaCount = items.length
        return
      }
    }

    if (items.length < prev.length) {
      const newSet = new Set<string>()
      for (let j = 0; j < items.length; j++) newSet.add(__geaSyncItemKey(items[j]))
      const removals: ChildNode[] = []
      for (let sc: ChildNode | null = container.firstChild; sc; sc = sc.nextSibling) {
        if (sc.nodeType === 1) {
          const aid = (sc as HTMLElement).getAttribute('data-gea-item-id')
          if (aid && !newSet.has(aid)) removals.push(sc)
        } else if (sc.nodeType === 8 && !(sc as any).data) break
      }
      if (removals.length === prev.length - items.length) {
        for (let j = 0; j < removals.length; j++) container.removeChild(removals[j])
        c.__geaPrev = items.slice()
        c.__geaCount = items.length
        return
      }
    }

    c.__geaPrev = items.slice()
    let oldCount: number = c.__geaCount
    if (oldCount == null) {
      oldCount = 0
      for (let n: ChildNode | null = container.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) oldCount++
        else if (n.nodeType === 8 && !(n as any).data) break
      }
    }
    let toRemove = oldCount
    while (toRemove > 0 && container.firstChild) {
      const rm = container.firstChild
      if (rm.nodeType === 1) toRemove--
      container.removeChild(rm)
    }
    const fragment = document.createDocumentFragment()
    for (let i = 0; i < items.length; i++) {
      fragment.appendChild(createItemFn(items[i], i))
    }
    container.insertBefore(fragment, container.firstChild)
    c.__geaCount = items.length
  }

  __geaCloneItem(
    container: HTMLElement,
    item: any,
    renderFn: (item: any) => string,
    bindingId?: string,
    itemIdProp?: string,
    patches?: any[],
  ): HTMLElement {
    const c = container as any
    const idProp = itemIdProp || 'id'
    if (!c.__geaTpl) {
      if (bindingId) c.__geaIdPfx = this.id_ + '-' + bindingId + '-'
      try {
        const tw = container.cloneNode(false) as HTMLElement
        tw.innerHTML = renderFn({ [idProp]: 0, label: '' })
        c.__geaTpl = tw.firstElementChild
      } catch {
        // Ignore template precomputation failures and fall back to full rendering below.
      }
    }
    let el: HTMLElement
    if (c.__geaTpl) {
      el = c.__geaTpl.cloneNode(true) as HTMLElement
    } else {
      const tw = container.cloneNode(false) as HTMLElement
      tw.innerHTML = renderFn(item)
      el = tw.firstElementChild as HTMLElement
    }
    const raw = item != null && typeof item === 'object' ? item[idProp] : undefined
    const itemKey = String(raw != null ? raw : item)
    el.setAttribute('data-gea-item-id', itemKey)
    if (c.__geaIdPfx) el.id = c.__geaIdPfx + itemKey
    ;(el as any).__geaItem = item
    if (patches) {
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i]
        const path: number[] = p[0]
        const type: string = p[1]
        const val = p[2]
        let target: HTMLElement = el
        for (let j = 0; j < path.length; j++) target = target.children[path[j]] as HTMLElement
        if (type === 'c') target.className = String(val).trim()
        else if (type === 't') target.textContent = String(val)
        else {
          if (val == null || val === false) target.removeAttribute(type)
          else target.setAttribute(type, String(val))
        }
      }
    }
    return el
  }

  __geaRegisterCond(
    idx: number,
    slotId: string,
    getCond: () => boolean,
    getTruthyHtml: (() => string) | null,
    getFalsyHtml: (() => string) | null,
  ): void {
    if (!this.__geaConds) this.__geaConds = {}
    this.__geaConds[idx] = { slotId, getCond, getTruthyHtml, getFalsyHtml }
  }

  __geaPatchCond(idx: number): boolean {
    const conf = this.__geaConds?.[idx]
    if (!conf) return false
    let cond: boolean
    try {
      cond = !!conf.getCond()
    } catch {
      return false
    }
    const condProp = '__geaCond_' + idx
    const prev = (this as any)[condProp]
    const needsPatch = cond !== prev
    ;(this as any)[condProp] = cond
    const root = (this as any).element_ || document.getElementById(this.id_)
    if (!root) return false
    const markerText = this.id_ + '-' + conf.slotId
    const endMarkerText = markerText + '-end'
    const findMarker = (value: string): Comment | null => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
      let current = walker.nextNode()
      while (current) {
        if (current.nodeValue === value) return current as Comment
        current = walker.nextNode()
      }
      return null
    }
    const marker = findMarker(markerText)
    const endMarker = findMarker(endMarkerText)
    const parent = endMarker && endMarker.parentNode
    if (!marker || !endMarker || !parent) return false
    const replaceSlotContent = (htmlFn: (() => string) | null) => {
      let node: ChildNode | null = marker.nextSibling
      while (node && node !== endMarker) {
        const next: ChildNode | null = node.nextSibling
        node.remove()
        node = next
      }
      if (htmlFn) {
        const html = htmlFn()
        const isSvg = 'namespaceURI' in parent && (parent as Element).namespaceURI === 'http://www.w3.org/2000/svg'
        if (isSvg) {
          const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          wrap.innerHTML = html
          while (wrap.firstChild) parent.insertBefore(wrap.firstChild, endMarker)
        } else {
          const tpl = document.createElement('template')
          tpl.innerHTML = html
          Component.__syncValueProps(tpl.content)
          parent.insertBefore(tpl.content, endMarker)
        }
      }
    }

    if (needsPatch) {
      if (!cond) {
        const disposed = new Set<Component>()
        let node: ChildNode | null = marker.nextSibling
        while (node && node !== endMarker) {
          if (node.nodeType === 1) {
            const el = node as HTMLElement
            for (const child of this.__childComponents) {
              if (
                child.__geaCompiledChild &&
                child.element_ &&
                (child.element_ === el || el.contains(child.element_))
              ) {
                disposed.add(child)
              }
            }
          }
          node = node.nextSibling
        }
        for (const child of disposed) {
          child.dispose()
          for (const key of Object.keys(this)) {
            if ((this as any)[key] === child) {
              ;(this as any)[key] = null
              break
            }
          }
        }
        if (disposed.size > 0) {
          this.__childComponents = this.__childComponents.filter((c) => !disposed.has(c))
        }
      }
      replaceSlotContent(cond ? conf.getTruthyHtml : conf.getFalsyHtml)
      if (cond) {
        this.mountCompiledChildComponents_()
        this.instantiateChildComponents_()
        this.setupEventDirectives_()
        Component.__syncAutofocus(marker, endMarker)
      }
    } else if (cond && conf.getTruthyHtml) {
      const existingNode = marker.nextSibling as HTMLElement | null
      if (existingNode && existingNode !== endMarker && existingNode.nodeType === 1) {
        if (existingNode.hasAttribute('data-gea-compiled-child-root')) return needsPatch
        const newHtml = conf.getTruthyHtml()
        const tpl = document.createElement('template')
        tpl.innerHTML = newHtml
        const newEl = tpl.content.firstElementChild
        if (newEl) {
          Component.__patchNode(existingNode, newEl)
        }
      }
    }
    return needsPatch
  }

  static __syncValueProps(root: DocumentFragment | Element): void {
    const els = (root as Element).querySelectorAll?.('textarea[value], input[value], select[value]')
    if (!els) return
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLInputElement | HTMLTextAreaElement
      el.value = el.getAttribute('value') || ''
    }
  }

  static __syncAutofocus(startMarker: Comment, endMarker: Comment): void {
    let node: ChildNode | null = startMarker.nextSibling
    while (node && node !== endMarker) {
      if (node.nodeType === 1) {
        const el = node as HTMLElement
        const target = el.hasAttribute('autofocus') ? el : el.querySelector('[autofocus]')
        if (target) {
          ;(target as HTMLElement).focus()
          return
        }
      }
      node = node.nextSibling
    }
  }

  static __patchNode(existing: Element, desired: Element): void {
    if (existing.tagName !== desired.tagName) {
      existing.replaceWith(desired.cloneNode(true))
      return
    }

    const oldAttrs = existing.attributes
    const newAttrs = desired.attributes
    for (let i = oldAttrs.length - 1; i >= 0; i--) {
      const name = oldAttrs[i].name
      if (!desired.hasAttribute(name)) existing.removeAttribute(name)
    }
    for (let i = 0; i < newAttrs.length; i++) {
      const { name, value } = newAttrs[i]
      if (existing.getAttribute(name) !== value) existing.setAttribute(name, value)
      if (name === 'value' && 'value' in existing) {
        ;(existing as HTMLInputElement | HTMLTextAreaElement).value = value
      }
    }

    const oldChildren = existing.childNodes
    const newChildren = desired.childNodes
    const max = Math.max(oldChildren.length, newChildren.length)
    for (let i = 0; i < max; i++) {
      const oldChild = oldChildren[i] as ChildNode | undefined
      const newChild = newChildren[i] as ChildNode | undefined
      if (!oldChild && newChild) {
        existing.appendChild(newChild.cloneNode(true))
      } else if (oldChild && !newChild) {
        oldChild.remove()
        i--
      } else if (oldChild && newChild) {
        if (oldChild.nodeType !== newChild.nodeType) {
          oldChild.replaceWith(newChild.cloneNode(true))
        } else if (oldChild.nodeType === 3) {
          if (oldChild.textContent !== newChild.textContent) oldChild.textContent = newChild.textContent
        } else if (oldChild.nodeType === 1) {
          Component.__patchNode(oldChild as Element, newChild as Element)
        }
      }
    }
  }

  static register(tagName?: string) {
    const manager = ComponentManager.getInstance()
    manager.registerComponentClass(this, tagName)
    if (Component.__componentClasses) {
      Component.__componentClasses.set(this.name, this)
    }
  }
}
