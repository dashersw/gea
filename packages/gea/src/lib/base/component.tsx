import ComponentManager from './component-manager'
import { applyListChanges } from './list'
import { Store } from '../store'
import type { StoreChange } from '../store'
import type { ListConfig } from './list'
type AnyComponent = Component<any>

const _URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

export function __escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function __sanitizeAttr(name: string, value: string): string {
  if (_URL_ATTRS.has(name)) {
    // eslint-disable-next-line no-control-regex -- intentional: strip null bytes and control chars for XSS prevention
    const stripped = value.replace(/[\s\u0000-\u001F]+/g, '').toLowerCase()
    if (/^(javascript|vbscript|data):/.test(stripped) && !stripped.startsWith('data:image/')) {
      return ''
    }
  }
  return value
}

// Make XSS helpers globally available for compiled template code.
// The compiler generates calls to __escapeHtml() and __sanitizeAttr() in template
// methods. These must be accessible regardless of how the compiled code is executed
// (direct imports, new Function eval, dynamic import with different module resolution).
if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).__escapeHtml ??= __escapeHtml
  ;(globalThis as any).__sanitizeAttr ??= __sanitizeAttr
}

/**
 * Declared React `Component` surface + `render(): ReactNode` overload so Gea classes are valid JSX class
 * tags while `JSX.IntrinsicElements` is sourced from `@types/react`. Runtime is still Gea-only.
 */
export default class Component<P = Record<string, any>> extends Store {
  declare context: unknown
  declare state: unknown
  declare setState: (...args: any[]) => void
  declare forceUpdate: (...args: any[]) => void
  static __componentClasses: Map<string, Function> = new Map()

  id_: string
  element_: HTMLElement | null
  __bindings: any[]
  __selfListeners: Array<() => void>
  __childComponents: AnyComponent[]
  actions: any
  __geaDependencies: any[]
  __geaEventBindings: Map<string, any>
  __geaPropBindings: Map<string, any>
  __geaAttrBindings: Map<string, any>
  __observer_removers__: Array<() => void>
  rendered_: boolean
  declare props: P
  declare parentComponent?: AnyComponent
  /** Set by the compiler for nested component instances */
  declare __geaCompiledChild?: boolean
  declare __geaItemKey?: string
  /** Compiler-registered keyed list / map state */
  declare __geaMaps?: Record<number, Record<string, any>>
  /** Compiler-registered conditional slot state */
  declare __geaConds?: Record<number, Record<string, any>>
  /** Compiler-generated: clears cached `__eN` element refs used by `__onPropChange` */
  declare __resetEls?: () => void
  __rawProps_: Record<string, any> = {}

  constructor(props: P = {} as P, _unusedReactContext?: unknown) {
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

    let _rawProps = (props || {}) as Record<string, any>
    let _propsProxy = this.__createPropsProxy(_rawProps)
    this.__rawProps_ = _rawProps
    Object.defineProperty(this, 'props', {
      get: () => _propsProxy,
      set: (newProps: unknown) => {
        _rawProps = (newProps || {}) as object as Record<string, any>
        _propsProxy = this.__createPropsProxy(_rawProps)
        this.__rawProps_ = _rawProps
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

  created(_props: P) {}

  createdHooks(_props: P) {}

  get id() {
    return this.id_
  }

  get el() {
    if (!this.element_) {
      const cloneFn = (this as any).__cloneTemplate
      if (typeof cloneFn === 'function') {
        this.element_ = cloneFn.call(this)
      } else {
        const existing = document.getElementById(this.id_)
        if (existing) {
          this.element_ = existing
        } else {
          this.element_ = ComponentManager.getInstance().createElement(String(this.template(this.props)).trim())
        }
      }
      if (this.element_) Component.__syncValueProps(this.element_)
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
    if (changes && changes.length > 0 && changes[0].isArrayItemPropUpdate && !config.hasComponentItems) {
      applyListChanges(container, array, changes, config)
      return
    }
    const prevCount = container.childElementCount
    applyListChanges(container, array, changes, config)
    if (container.childElementCount !== prevCount || config.hasComponentItems) {
      this.instantiateChildComponents_()
    }
  }

  /** Typing-only overload for React `Component` compatibility (Gea uses `render(parentEl?)` below). */
  render(): import('react').ReactNode
  render(rootEl: any, opt_index?: number): boolean
  render(rootEl?: any, opt_index: number = Infinity): boolean | import('react').ReactNode {
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
    if (this.element_) (this.element_ as any).__geaComponent = this
    ComponentManager.getInstance().markComponentRendered(this)

    this.attachBindings_()
    this.mountCompiledChildComponents_()
    this.instantiateChildComponents_()
    this.setupEventDirectives_()
    if (typeof (this as any).__setupRefs === 'function') {
      ;(this as any).__setupRefs()
    }

    this.onAfterRender()
    this.onAfterRenderHooks()
    this.__syncUnrenderedListItems()

    requestAnimationFrame(() => this.onAfterRenderAsync())

    return true
  }

  get rendered() {
    return this.rendered_
  }

  onAfterRender() {}

  onAfterRenderAsync() {}

  onAfterRenderHooks() {}

  /** Render pre-created list items that weren't mounted during construction
   *  (e.g. component was a lazy child inside a conditional slot). */
  __syncUnrenderedListItems(): void {
    const configs = (this as any).__geaListConfigs
    if (!configs) return
    for (const { config: c } of configs) {
      if (!c.items && c.itemsKey) c.items = (this as any)[c.itemsKey]
      if (!c.items?.length) continue
      const container = c.container()
      if (!container) continue
      for (const item of c.items) {
        if (!item.rendered_) item.render(container)
      }
    }
  }

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
    if (typeof (this as any).__onPropChange === 'function') {
      const raw = this.__rawProps_
      for (const key in nextProps) {
        const prev = raw[key]
        const next = nextProps[key]
        raw[key] = next
        if (next !== prev || (typeof prev === 'object' && prev !== null)) {
          ;(this as any).__onPropChange(key, next)
        }
      }
    } else {
      for (const key in nextProps) {
        this.props[key] = nextProps[key]
      }
      this.__geaRequestRender()
    }
  }

  toString() {
    return String(this.template(this.props)).trim()
  }

  /**
   * Prefer `template({ a, b } = this.props)` so TypeScript infers bindings from `declare props`
   * without `: this['props']`. Runtime still receives props from `template(this.props)` call sites.
   */
  template(_props: this['props'] = this.props): any {
    return '<div></div>'
  }

  dispose() {
    ComponentManager.getInstance().removeComponent(this)

    if (this.element_) (this.element_ as any).__geaComponent = undefined
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
          this.__resetChildTree(child)
          return
        }
        if (typeof child.dispose == 'function') child.dispose()
      })
      this.__childComponents = []
    }

    this.__elCache.clear()
    this.__resetEls?.()

    // Remove old element BEFORE calling template() so that getElementById
    // inside child __geaUpdateProps won't find stale DOM nodes.
    const placeholder = document.createComment('')
    try {
      if (this.element_.parentNode === parent) {
        this.element_.replaceWith(placeholder)
      } else {
        parent.appendChild(placeholder)
      }
    } catch {
      if (!placeholder.parentNode) parent.appendChild(placeholder)
    }

    const manager = ComponentManager.getInstance()
    const cloneFn = (this as any).__cloneTemplate
    const newElement =
      typeof cloneFn === 'function'
        ? cloneFn.call(this)
        : manager.createElement(String(this.template(this.props)).trim())

    if (!newElement) {
      this.element_ = placeholder as unknown as HTMLElement
      this.rendered_ = true
      return
    }

    Component.__syncValueProps(newElement)
    parent.replaceChild(newElement, placeholder)

    this.element_ = newElement
    this.rendered_ = true
    manager.markComponentRendered(this)

    this.attachBindings_()
    this.mountCompiledChildComponents_()
    this.instantiateChildComponents_()
    this.setupEventDirectives_()
    if (typeof (this as any).__setupRefs === 'function') {
      ;(this as any).__setupRefs()
    }

    if ((this as any).__geaListConfigs) {
      for (const { store: s, path: p, config: c } of (this as any).__geaListConfigs) {
        if (!c.items && c.itemsKey) c.items = (this as any)[c.itemsKey]
        if (!c.items) continue
        const arr = p.reduce((obj: any, key: string) => obj?.[key], s.__store) ?? []
        if (arr.length === c.items.length) continue
        const oldByKey = new Map<string, AnyComponent>()
        for (const item of c.items) {
          if (item.__geaItemKey != null) oldByKey.set(item.__geaItemKey, item)
        }
        const next = arr.map((data: any) => {
          const key = String(c.key(data))
          const existing = oldByKey.get(key)
          if (existing) {
            existing.__geaUpdateProps(c.props(data))
            oldByKey.delete(key)
            return existing
          }
          return this.__child(c.Ctor, c.props(data), key)
        })
        c.items.length = 0
        c.items.push(...next)
        const container = c.container()
        if (container) {
          for (const item of next) {
            if (!item.rendered_) item.render(container)
          }
        }
      }
    }

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

  __resetChildTree(comp: Component) {
    if (!comp.__childComponents) return
    comp.__childComponents.forEach((c) => {
      if (!c) return
      c.rendered_ = false
      c.element_ = null
      this.__resetChildTree(c)
    })
  }

  attachBindings_() {
    this.cleanupBindings_()
  }

  static _register(ctor: any, compiledTagName?: string) {
    if (!ctor || !ctor.name || ctor.__geaAutoRegistered) return
    if (Object.getPrototypeOf(ctor.prototype) === Component.prototype) {
      ctor.__geaAutoRegistered = true
      Component.__componentClasses.set(ctor.name, ctor)
      const manager = ComponentManager.getInstance()
      const tagName = compiledTagName || manager.generateTagName_(ctor)
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
      if ((el as any).__geaCompiledChildRoot) return

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
      const child = new (Ctor as new (props: any) => AnyComponent)(props)
      child.parentComponent = this as AnyComponent
      this.__childComponents.push(child)

      const parent = el.parentElement
      if (!parent) return
      const children = Array.prototype.slice.call(parent.children)
      const index = children.indexOf(el)

      child.render(parent, index)
      if (itemId != null && child.el) {
        const wrapper = document.createElement('div')
        ;(wrapper as any).__geaKey = itemId
        parent.replaceChild(wrapper, child.el)
        wrapper.appendChild(child.el)
      }
      child.el && child.el.setAttribute('data-gea-component-root', child.id)
      parent.removeChild(el)
    })
  }

  mountCompiledChildComponents_() {
    const manager = ComponentManager.getInstance()
    const seen = new Set<AnyComponent>()

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
      ;(existing as any).__geaCompiledChildRoot = true
      child.element_ = existing
      ;(existing as any).__geaComponent = child
      child.rendered_ = true
      manager.markComponentRendered(child)
      child.attachBindings_()
      child.mountCompiledChildComponents_()
      child.instantiateChildComponents_()
      child.setupEventDirectives_()
      if (typeof (child as any).__setupRefs === 'function') {
        ;(child as any).__setupRefs()
      }
      child.onAfterRender()
      child.onAfterRenderHooks()
      child.__syncUnrenderedListItems()
      requestAnimationFrame(() => child.onAfterRenderAsync())
    })
  }

  __child<T extends AnyComponent>(Ctor: new (props: any) => T, props: any, key?: any): T {
    const child = new Ctor(props)
    child.parentComponent = this as AnyComponent
    child.__geaCompiledChild = true
    if (key !== undefined) {
      child.__geaItemKey = String(key)
    }
    if (!this.__childComponents.includes(child)) {
      this.__childComponents.push(child)
    }
    return child
  }

  __elCache = new Map<string, HTMLElement>()

  __el(suffix: string): HTMLElement | null {
    let el = this.__elCache.get(suffix) ?? null
    if (!el || !el.isConnected) {
      el = document.getElementById(this.id_ + '-' + suffix)
      if (el) this.__elCache.set(suffix, el)
      else this.__elCache.delete(suffix)
    }
    return el
  }

  __updateText(suffix: string, text: string): void {
    const el = this.__el(suffix)
    if (el) el.textContent = text
  }

  static __escapeHtml(str: string): string {
    return __escapeHtml(str)
  }

  static __sanitizeAttr(name: string, value: string): string {
    return __sanitizeAttr(name, value)
  }

  __observe(store: any, path: string[], handler: (value: any, changes: any[]) => void): void {
    const remover = store.__store.observe(path, handler.bind(this))
    this.__observer_removers__.push(remover)
  }

  __reorderChildren(container: HTMLElement | null, items: AnyComponent[]): void {
    if (!container || !this.rendered_) return
    for (const item of items) {
      if (!item.rendered_) {
        if (!this.__childComponents.includes(item)) {
          this.__childComponents.push(item)
        }
        item.render(container)
      }
    }

    const ordered: Node[] = []
    for (const item of items) {
      let el: HTMLElement | null = item.element_
      if (!el) continue
      while (el.parentElement && el.parentElement !== container) el = el.parentElement
      ordered.push(el)
    }
    if (ordered.length === 0) return

    const itemSet = new Set(ordered)
    let cursor: ChildNode | null = container.firstChild
    while (cursor && !itemSet.has(cursor)) cursor = cursor.nextSibling

    for (const el of ordered) {
      if (el !== cursor) {
        container.insertBefore(el, cursor || null)
      } else {
        cursor = cursor!.nextSibling
        while (cursor && !itemSet.has(cursor)) cursor = cursor.nextSibling
      }
    }
  }

  __reconcileList(
    oldItems: AnyComponent[],
    newData: any[],
    container: HTMLElement | null,
    Ctor: new (props: any) => AnyComponent,
    propsFactory: (item: any, index?: number) => any,
    keyExtractor: (item: any, index?: number) => any,
  ): AnyComponent[] {
    const oldByKey = new Map<string, AnyComponent>()
    for (const item of oldItems) {
      if (item.__geaItemKey != null) oldByKey.set(item.__geaItemKey, item)
    }

    const next = newData.map((data, idx) => {
      const key = String(keyExtractor(data, idx))
      const existing = oldByKey.get(key)
      if (existing) {
        existing.__geaUpdateProps(propsFactory(data, idx))
        oldByKey.delete(key)
        return existing
      }
      return this.__child(Ctor, propsFactory(data, idx), key)
    })

    for (const removed of oldByKey.values()) {
      removed.dispose?.()
    }

    this.__reorderChildren(container, next)

    // Clean up __childComponents
    this.__childComponents = this.__childComponents.filter((child) => !oldItems.includes(child) || next.includes(child))

    return next
  }

  __observeList(
    store: any,
    path: string[],
    config: {
      items: AnyComponent[]
      itemsKey?: string
      container: () => HTMLElement | null
      Ctor: new (props: any) => AnyComponent
      props: (item: any, index?: number) => any
      key: (item: any, index?: number) => any
      onchange?: () => void
      __refreshing?: boolean
    },
  ): void {
    // Track list configs for re-sync during __geaRequestRender
    if (!(this as any).__geaListConfigs) (this as any).__geaListConfigs = []
    ;(this as any).__geaListConfigs.push({ store, path, config })

    this.__observe(store, path, (_value, changes) => {
      // Lazily resolve items from the instance property if not yet available
      if (!config.items && config.itemsKey) config.items = (this as any)[config.itemsKey]
      if (!config.items) return
      if (config.__refreshing) return
      config.__refreshing = true
      try {
        const storeData = store.__store
        const arr = path.reduce((obj: any, key: string) => obj?.[key], storeData) ?? []

        if (changes.every((c: any) => c.isArrayItemPropUpdate)) {
          // Item property update (e.g. todo.done toggled)
          for (const c of changes) {
            const item = config.items[c.arrayIndex]
            if (item) {
              item.__geaUpdateProps(config.props(arr[c.arrayIndex], c.arrayIndex))
            }
          }
        } else if (changes.length === 1 && changes[0].type === 'append') {
          // Append (push)
          const { start, count } = changes[0]
          const container = config.container()
          for (let i = 0; i < count; i++) {
            const data = arr[start + i]
            const item = this.__child(config.Ctor, config.props(data, start + i), config.key(data, start + i))
            config.items.push(item)
            if (this.rendered_ && container) item.render(container)
          }
        } else {
          // Full replace (filter, sort, reassign)
          const newItems = this.__reconcileList(
            config.items,
            arr,
            config.container(),
            config.Ctor,
            config.props,
            config.key,
          )
          config.items.length = 0
          config.items.push(...newItems)
        }

        config.onchange?.()
      } finally {
        config.__refreshing = false
      }
    })
  }

  /**
   * Force-reconcile a list config by re-reading the getter value through the
   * store proxy.  Used by compiler-generated delegates when a getter-backed
   * array map's underlying dependency changes (e.g. activePlaylistId changes
   * causing filteredTracks to return different items).
   */
  __refreshList(pathKey: string): void {
    const configs = (this as any).__geaListConfigs
    if (!configs) return
    for (const { store: s, path: p, config: c } of configs) {
      if (p.join('.') !== pathKey) continue
      if (!c.items && c.itemsKey) c.items = (this as any)[c.itemsKey]
      if (!c.items) continue
      if (c.__refreshing) return
      c.__refreshing = true
      try {
        // Read through the proxy (not __store) so getters are evaluated
        const arr = p.reduce((obj: any, key: string) => obj?.[key], s) ?? []
        const newItems = this.__reconcileList(c.items, arr, c.container(), c.Ctor, c.props, c.key)
        c.items.length = 0
        c.items.push(...newItems)
        c.onchange?.()
      } finally {
        c.__refreshing = false
      }
    }
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
    // Prefer JS object props set by createXItem for component-root map items
    if (el.__geaProps) {
      const jsProps = el.__geaProps
      delete el.__geaProps
      return jsProps
    }

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
    keyProp?: string | ((item: any) => string),
  ): void {
    if (!this.__geaMaps) this.__geaMaps = {}
    this.__geaMaps[idx] = {
      containerProp,
      getContainer,
      getItems,
      createItem,
      container: null as HTMLElement | null,
      keyProp,
    }
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
        if (n.nodeType === 1 && ((n as any).__geaKey != null || (n as HTMLElement).hasAttribute('data-gea-item-id'))) {
          hasDirectItems = true
          break
        }
        if (n.nodeType === 8 && !(n as any).data) break
      }
      if (!hasDirectItems) {
        let nested: HTMLElement | null = null
        const prefix = container.id + '-'
        const walk = (el: HTMLElement) => {
          for (let c: ChildNode | null = el.firstChild; c; c = c.nextSibling) {
            if (c.nodeType !== 1) continue
            const child = c as HTMLElement
            if (
              ((child as any).__geaKey != null || child.hasAttribute('data-gea-item-id')) &&
              child.id &&
              child.id.startsWith(prefix)
            ) {
              nested = child
              return
            }
            walk(child)
            if (nested) return
          }
        }
        walk(container)
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
    this.__geaSyncItems(container, normalizedItems, map.createItem, map.keyProp)
  }

  __geaSyncItems(
    container: HTMLElement,
    items: any[],
    createItemFn: (item: any, index?: number) => HTMLElement,
    keyProp?: string | ((item: any) => string),
  ): void {
    const itemKey =
      typeof keyProp === 'function'
        ? (item: any, index?: number) => keyProp(item, index)
        : (item: any, _index?: number): string => {
            if (item != null && typeof item === 'object') {
              if (keyProp && keyProp in item) return String(item[keyProp])
              if ('id' in item) return String(item.id)
            }
            return String(item)
          }

    const c = container as any
    let prev: any[] | undefined = c.__geaPrev
    if (!prev) {
      prev = []
      for (let n: ChildNode | null = container.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) {
          const aid = (n as any).__geaKey ?? (n as HTMLElement).getAttribute('data-gea-item-id')
          if (aid != null) prev.push(aid)
        } else if (n.nodeType === 8 && !(n as any).data) break
      }
      c.__geaCount = prev.length
    }

    if (prev.length === items.length) {
      let same = true
      for (let j = 0; j < prev.length; j++) {
        if (itemKey(prev[j], j) !== itemKey(items[j], j)) {
          same = false
          break
        }
      }
      if (same) {
        // Keys unchanged, but content inside items may have changed.
        // Update existing elements in-place to preserve DOM node identity
        // (avoids spurious removals visible to MutationObserver when
        // multiple observers trigger __geaSyncMap in the same flush).
        let child: ChildNode | null = container.firstChild
        for (let j = 0; j < items.length; j++) {
          while (
            child &&
            (child.nodeType !== 1 ||
              ((child as any).__geaKey == null && !(child as HTMLElement).hasAttribute?.('data-gea-item-id')))
          ) {
            if (child.nodeType === 8 && !(child as any).data) break
            child = child.nextSibling
          }
          if (!child || child.nodeType !== 1) break
          const oldEl = child as HTMLElement
          child = child.nextSibling
          const newEl = createItemFn(items[j], j)
          if (oldEl.innerHTML !== newEl.innerHTML) {
            oldEl.innerHTML = newEl.innerHTML
            Component.__syncValueProps(oldEl)
          }
          for (let ai = 0; ai < newEl.attributes.length; ai++) {
            const a = newEl.attributes[ai]
            if (oldEl.getAttribute(a.name) !== a.value) {
              oldEl.setAttribute(a.name, a.value)
              if (a.name === 'value' && 'value' in oldEl) {
                ;(oldEl as HTMLInputElement | HTMLTextAreaElement).value = a.value
              }
            }
          }
          // Sync item identity props so event handlers can resolve item/index.
          if ((newEl as any).__geaItem !== undefined) (oldEl as any).__geaItem = (newEl as any).__geaItem
          if ((newEl as any).__geaKey !== undefined) (oldEl as any).__geaKey = (newEl as any).__geaKey
        }
        c.__geaPrev = items.slice()
        return
      }
    }

    // Do not use the append-only fast path when prev is empty: the container may still
    // hold non-list UI from a ternary branch (e.g. `.list-empty` while map length was 0).
    // Appending would leave that placeholder and duplicate rows after the next sync.
    if (items.length > prev.length && prev.length > 0) {
      let appendOk = true
      for (let j = 0; j < prev.length; j++) {
        if (itemKey(prev[j], j) !== itemKey(items[j], j)) {
          appendOk = false
          break
        }
      }
      if (appendOk) {
        const frag = document.createDocumentFragment()
        for (let j = prev.length; j < items.length; j++) {
          frag.appendChild(createItemFn(items[j], j))
        }
        Component.__syncValueProps(frag)
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
      for (let j = 0; j < items.length; j++) newSet.add(itemKey(items[j], j))
      const removals: ChildNode[] = []
      for (let sc: ChildNode | null = container.firstChild; sc; sc = sc.nextSibling) {
        if (sc.nodeType === 1) {
          const aid = (sc as any).__geaKey ?? (sc as HTMLElement).getAttribute('data-gea-item-id')
          if (aid != null && !newSet.has(aid)) removals.push(sc)
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
    let oldCount: number | undefined = c.__geaCount
    // __geaCount can be 0 while the DOM still has non-map nodes (e.g. a ternary empty-state
    // branch). Recount from the live tree so we clear them before inserting mapped rows.
    if (oldCount == null || (oldCount === 0 && container.firstChild)) {
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
    Component.__syncValueProps(fragment)
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
    ;(el as any).__geaKey = itemKey
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
          else {
            target.setAttribute(type, String(val))
            if (type === 'value' && 'value' in target) {
              ;(target as HTMLInputElement | HTMLTextAreaElement).value = String(val)
            }
          }
        }
      }
    }
    Component.__syncValueProps(el)
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

  /**
   * Re-run compiler-generated `__setupRefs()` after incremental DOM updates (e.g. conditional
   * slots) so `ref={this.x}` targets stay in sync; `querySelector` returns `null` when a marked
   * node is absent, clearing stale references.
   */
  __syncDomRefs(): void {
    if (typeof (this as any).__setupRefs === 'function') {
      ;(this as any).__setupRefs()
    }
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
      if (!htmlFn) {
        let node: ChildNode | null = marker.nextSibling
        while (node && node !== endMarker) {
          const next: ChildNode | null = node.nextSibling
          if (!node.parentNode) break
          try {
            node.remove()
          } catch {
            /* node detached by sync blur handler */
          }
          node = next
        }
        return
      }
      const html = htmlFn()
      // Empty reinjection = no static HTML for this branch; __applyListChanges may already own
      // keyed rows between markers. Remove only non–list nodes (placeholders, text) so patch order
      // vs list observers does not wipe __geaKey rows (mobile-showcase gesture log).
      if (html === '') {
        let node: ChildNode | null = marker.nextSibling
        while (node && node !== endMarker) {
          const next: ChildNode | null = node.nextSibling
          if (!node.parentNode) break
          try {
            if (node.nodeType !== 1) {
              node.remove()
            } else if ((node as any).__geaKey == null && !(node as HTMLElement).hasAttribute?.('data-gea-item-id')) {
              node.remove()
            }
          } catch {
            /* node detached by sync blur handler */
          }
          node = next
        }
        return
      }
      let node: ChildNode | null = marker.nextSibling
      while (node && node !== endMarker) {
        const next: ChildNode | null = node.nextSibling
        if (!node.parentNode) break
        try {
          node.remove()
        } catch {
          /* node detached by sync blur handler */
        }
        node = next
      }
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

    if (needsPatch) {
      if (!cond) {
        const disposed = new Set<AnyComponent>()
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
      if (existingNode && (existingNode as Node) !== endMarker && existingNode.nodeType === 1) {
        if ((existingNode as any).__geaCompiledChildRoot) return needsPatch
        const newHtml = conf.getTruthyHtml()
        const tpl = document.createElement('template')
        tpl.innerHTML = newHtml
        const newEl = tpl.content.firstElementChild
        if (newEl) {
          Component.__patchNode(existingNode, newEl)
        }
      }
    } else if (!cond && conf.getFalsyHtml) {
      const newHtml = conf.getFalsyHtml()
      const tpl = document.createElement('template')
      tpl.innerHTML = newHtml
      const newChildren = Array.from(tpl.content.childNodes)
      let existing = marker.nextSibling
      let idx = 0
      while (existing && (existing as Node) !== endMarker && idx < newChildren.length) {
        const desired = newChildren[idx]
        if (existing.nodeType === 1 && desired.nodeType === 1) {
          if (!(existing as any).__geaCompiledChildRoot) {
            Component.__patchNode(existing as Element, desired as Element)
          }
        } else if (existing.nodeType === 3 && desired.nodeType === 3) {
          if (existing.textContent !== desired.textContent) existing.textContent = desired.textContent
        }
        existing = existing.nextSibling
        idx++
      }
    }
    this.__syncDomRefs()
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
