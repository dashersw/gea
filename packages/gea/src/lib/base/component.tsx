import ComponentManager from './component-manager'
import { getComponentInternals as internals, engineThis } from './component-internal'
import { applyListChanges } from './list'
import { Store } from '../store'
import type { StoreChange } from '../store'
import type { ListConfig } from './list'
import {
  GEA_APPLY_LIST_CHANGES,
  GEA_ATTACH_BINDINGS,
  GEA_CHILD,
  GEA_CHILD_COMPONENTS,
  GEA_CLEANUP_BINDINGS,
  GEA_CLONE_ITEM,
  GEA_CLONE_TEMPLATE,
  GEA_COERCE_STATIC_PROP_VALUE,
  GEA_COMPILED,
  GEA_COMPILED_CHILD,
  GEA_COMPONENT_CLASSES,
  GEA_CONDS,
  GEA_CREATE_PROPS_PROXY,
  GEA_CTOR_AUTO_REGISTERED,
  GEA_DOM_COMPONENT,
  GEA_DOM_COMPILED_CHILD_ROOT,
  GEA_DOM_ITEM,
  GEA_DOM_KEY,
  GEA_DOM_PROPS,
  GEA_ELEMENT,
  GEA_EXTRACT_COMPONENT_PROPS,
  GEA_EL,
  GEA_EL_CACHE,
  GEA_ID,
  GEA_INSTANTIATE_CHILD_COMPONENTS,
  GEA_ITEM_KEY,
  GEA_LIST_CONFIG_REFRESHING,
  GEA_MAP_CONFIG_COUNT,
  GEA_MAP_CONFIG_PREV,
  GEA_MAP_CONFIG_TPL,
  GEA_MAPS,
  GEA_MOUNT_COMPILED_CHILD_COMPONENTS,
  GEA_NORMALIZE_PROP_NAME,
  GEA_OBSERVE,
  GEA_OBSERVER_REMOVERS,
  GEA_OBSERVE_LIST,
  GEA_ON_PROP_CHANGE,
  GEA_PARENT_COMPONENT,
  GEA_PATCH_NODE,
  GEA_PATCH_COND,
  GEA_PROP_BINDING_ATTR_PREFIX,
  GEA_PROP_BINDINGS,
  GEA_REACTIVE_PROPS,
  GEA_RECONCILE_LIST,
  GEA_REFRESH_LIST,
  GEA_REGISTER_COND,
  GEA_REGISTER_MAP,
  GEA_RENDERED,
  GEA_RESET_ELS,
  GEA_REORDER_CHILDREN,
  GEA_REQUEST_RENDER,
  GEA_SELF_LISTENERS,
  GEA_SELF_PROXY,
  GEA_SETUP_EVENT_DIRECTIVES,
  GEA_SETUP_LOCAL_STATE_OBSERVERS,
  GEA_SETUP_REFS,
  GEA_STATIC_ESCAPE_HTML,
  GEA_STATIC_SANITIZE_ATTR,
  GEA_STORE_ROOT,
  GEA_SWAP_CHILD,
  GEA_SYNC_AUTOFOCUS,
  GEA_SYNC_DOM_REFS,
  GEA_SYNC_ITEMS,
  GEA_SYNC_MAP,
  GEA_SYNC_UNRENDERED_LIST_ITEMS,
  GEA_SYNC_VALUE_PROPS,
  GEA_TEARDOWN_SELF_LISTENERS,
  GEA_UPDATE_PROPS,
  GEA_UPDATE_TEXT,
} from '../symbols'

const _cm = () => ComponentManager.getInstance()
const _getEl = (id: string) => document.getElementById(id)
const _frag = () => document.createDocumentFragment()

const _componentClassesMap = new Map<string, Function>()

type AnyComponent = Component<any>

const _URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

const ITEM_ID_ATTR = 'data-gid'

function _pushCC(_i: ReturnType<typeof internals>, child: AnyComponent): void {
  if (!_i.childComponents.includes(child)) _i.childComponents.push(child)
}

const _isSentinel = (n: ChildNode): boolean => n.nodeType === 8 && !(n as any).data

function _itemId(n: ChildNode): string | null {
  return (n as any)[GEA_DOM_KEY] ?? (n as HTMLElement).getAttribute?.(ITEM_ID_ATTR) ?? null
}

function _rootIn(el: HTMLElement, container: HTMLElement): HTMLElement {
  while (el.parentElement && el.parentElement !== container) el = el.parentElement
  return el
}

function _setParent(child: AnyComponent, parent: AnyComponent): void {
  engineThis(child)[GEA_PARENT_COMPONENT] = (parent as any)[GEA_SELF_PROXY] ?? parent
}

function _updateMapState(c: any, items: any[]): void {
  c[GEA_MAP_CONFIG_PREV] = items.slice()
  c[GEA_MAP_CONFIG_COUNT] = items.length
}

// ── Cross-list transfer stash (DnD) ─────────────────────────────────
// When a component is dragged between two lists (e.g. columns), the DnD
// manager stashes it here so that the destination list's reconciliation
// can adopt the existing component (preserving its full DOM subtree)
// instead of disposing + recreating it.
const _transferByKey = new Map<string, AnyComponent>()
const _inTransfer = new WeakSet<object>()

/**
 * Find the conditional-slot comment marker at a specific slot index.
 * The compiler tells each list which slot index immediately follows it in JSX
 * source order via `afterCondSlotIndex`.  We look for `<!--{id}-c{N}-->`.
 * Returns null when no such marker exists (map is last, or no conditionals follow).
 */
function _compiledChildOwns(child: AnyComponent, el: HTMLElement): boolean {
  if (!child[GEA_COMPILED_CHILD]) return false
  const root = engineThis(child)[GEA_ELEMENT]
  return root != null && (root === el || el.contains(root))
}

function _moveBeforeCond(container: HTMLElement, item: AnyComponent, condRef: ChildNode | null): void {
  if (!condRef) return
  const el = engineThis(item)[GEA_ELEMENT]
  if (el && el.parentNode === container) container.insertBefore(el, condRef)
}

function _findComment(root: Node, data: string, deep?: boolean): Comment | null {
  if (deep) {
    const w = document.createTreeWalker(root, 128)
    let n: Node | null
    while ((n = w.nextNode())) if ((n as Comment).data === data) return n as Comment
  } else {
    for (let n: ChildNode | null = root.firstChild; n; n = n.nextSibling)
      if (n.nodeType === 8 && (n as Comment).data === data) return n as Comment
  }
  return null
}

function _findCondMarkerByIndex(
  container: HTMLElement,
  componentId: string,
  slotIndex: number | undefined,
): ChildNode | null {
  if (slotIndex == null) return null
  return _findComment(container, `${componentId}-c${slotIndex}`)
}

/**
 * Mark a keyed list-item component for cross-list transfer.
 * Call this *before* firing the store update that triggers reconciliation.
 * Unclaimed entries are auto-disposed after the current task (setTimeout 0),
 * which guarantees all render microtasks have already run.
 */
export function stashComponentForTransfer(comp: AnyComponent): void {
  const key = (comp as any)[GEA_ITEM_KEY] as string | undefined
  if (key == null) return
  const raw = engineThis(comp)
  _inTransfer.add(raw)
  _transferByKey.set(key, comp)
  setTimeout(() => {
    if (_transferByKey.get(key) === comp) {
      _transferByKey.delete(key)
      _inTransfer.delete(raw)
      comp.dispose?.()
    }
  }, 0)
}

function _claimTransfer(key: string): AnyComponent | undefined {
  const comp = _transferByKey.get(key)
  if (!comp) return undefined
  _transferByKey.delete(key)
  return comp
}

function _isInTransfer(comp: AnyComponent): boolean {
  return _inTransfer.has(engineThis(comp))
}

export function __escapeHtml(val: unknown): string {
  if (val != null && typeof val === 'object' && typeof (val as any).template === 'function') {
    return String(val)
  }
  const str = String(val)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Ensures static template HTML from list `items.join('')` survives GEA_PATCH_COND empty reinjection. */
function injectDataGeaItemIdOnFirstOpenTag(html: string, key: string): string {
  const m = html.match(/^<([A-Za-z][\w:-]*)([^>]*)>/)
  if (!m) return html
  const full = m[0]
  if (/\sdata-gid\s*=/.test(full)) return html
  const esc = __escapeHtml(key)
  return `<${m[1]}${m[2]} ${ITEM_ID_ATTR}="${esc}">` + html.slice(full.length)
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
  ;(globalThis as any).__gid ??= _getEl
}

function _attachAndMount(comp: AnyComponent, refs: boolean, bindings = true): void {
  if (bindings) comp[GEA_ATTACH_BINDINGS]()
  comp[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
  comp[GEA_INSTANTIATE_CHILD_COMPONENTS]()
  comp[GEA_SETUP_EVENT_DIRECTIVES]()
  if (refs) {
    const sr = (comp as any)[GEA_SETUP_REFS]
    if (typeof sr === 'function') sr.call(comp)
  }
}

function _syncAndMount(comp: AnyComponent): void {
  comp[GEA_SYNC_UNRENDERED_LIST_ITEMS]()
  _mountComp(comp, true)
  comp[GEA_SYNC_UNRENDERED_LIST_ITEMS]()
}

function _mountComp(comp: AnyComponent, refs: boolean): void {
  ;(comp as any)[GEA_RENDERED] = true
  _cm().markComponentRendered(comp)
  _attachAndMount(comp, refs)
  comp.onAfterRender()
  comp.onAfterRenderHooks()
}

function _handleListChange(
  comp: AnyComponent,
  storeObj: any,
  path: string[],
  config: any,
  changes: StoreChange[] | null,
): void {
  if ((!config.items || config.items.length === 0) && config.itemsKey) config.items = (comp as any)[config.itemsKey]
  if (!config.items) return
  if (config[GEA_LIST_CONFIG_REFRESHING]) return
  config[GEA_LIST_CONFIG_REFRESHING] = true
  try {
    const arr = path.reduce((obj: any, key: string) => obj?.[key], storeObj) ?? []

    if (changes && changes.every((c: any) => c.aipu)) {
      for (const c of changes) {
        const item = config.items[c.arix]
        if (item) item[GEA_UPDATE_PROPS](config.props(arr[c.arix], c.arix))
      }
    } else if (
      changes &&
      changes.length === 1 &&
      changes[0].type === 'append' &&
      changes[0].pathParts.length === path.length &&
      changes[0].pathParts.every((p: string, i: number) => p === path[i])
    ) {
      const { start, count } = changes[0]
      const container = config.container()
      const condRef = container
        ? _findCondMarkerByIndex(container, engineThis(comp)[GEA_ID], config.afterCondSlotIndex)
        : null
      for (let i = 0; i < count!; i++) {
        const data = arr[start! + i]
        const item = comp[GEA_CHILD](config.Ctor, config.props(data, start! + i), config.key(data, start! + i))
        config.items.push(item)
        if ((comp as any)[GEA_RENDERED] && container) {
          item.render(container)
          _moveBeforeCond(container, item, condRef)
        }
      }
    } else {
      const newItems = comp[GEA_RECONCILE_LIST](
        config.items,
        arr,
        config.container(),
        config.Ctor,
        config.props,
        config.key,
        config.afterCondSlotIndex,
      )
      config.items.length = 0
      config.items.push(...newItems)
    }
    config.onchange?.()
  } finally {
    config[GEA_LIST_CONFIG_REFRESHING] = false
  }
}

function _resolveMapContainer(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null
  if (!container.id) return container
  for (let n: ChildNode | null = container.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && _itemId(n) != null) return container
    if (_isSentinel(n)) break
  }
  const prefix = container.id + '-'
  const nested =
    container.querySelector<HTMLElement>(`[id^="${prefix}"][${ITEM_ID_ATTR}]`) ||
    Array.from(container.querySelectorAll<HTMLElement>(`[id^="${prefix}"]`)).find(
      (el) => (el as any)[GEA_DOM_KEY] != null,
    ) ||
    null
  if (nested?.parentElement && nested.parentElement !== container) return nested.parentElement
  if (!nested) {
    for (let s: ChildNode | null = container.firstChild; s; s = s.nextSibling) {
      if (_isSentinel(s)) break
      if (s.nodeType === 8 && (s as Comment).data && /-c\d+$/.test((s as Comment).data)) return null
    }
  }
  return container
}

function _findKeyedAncestor(comp: AnyComponent | undefined): AnyComponent | undefined {
  let c: any = comp
  while (c) {
    if (c[GEA_ITEM_KEY] != null) return c
    c = engineThis(c)[GEA_PARENT_COMPONENT]
  }
}

function _eachBetween(start: Node, end: Node, fn: (node: ChildNode) => boolean | void): void {
  let node: ChildNode | null = start.nextSibling as ChildNode | null
  while (node && node !== end) {
    const next: ChildNode | null = node.nextSibling
    if (fn(node) === false) break
    node = next
  }
}

function _clearBetweenMarkers(start: Comment, end: Comment): void {
  _eachBetween(start, end, (n) => {
    n.remove()
  })
}

function _collectCompiledChildrenBetween(comp: AnyComponent, start: Comment, end: Comment): Set<AnyComponent> {
  const result = new Set<AnyComponent>()
  _eachBetween(start, end, (n) => {
    if (n.nodeType === 1) {
      for (const child of internals(comp).childComponents) {
        if (_compiledChildOwns(child, n as HTMLElement)) result.add(child)
      }
    }
  })
  return result
}

function _disposeAndRemoveChildren(comp: AnyComponent, disposed: Set<AnyComponent>): void {
  if (disposed.size === 0) return
  for (const child of disposed) {
    child.dispose()
    const k = Object.keys(comp).find((k) => (comp as any)[k] === child)
    if (k) (comp as any)[k] = null
  }
  const ci = internals(comp)
  ci.childComponents = ci.childComponents.filter((c) => !disposed.has(c))
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

  declare props: P

  constructor(props: P = {} as P, _unusedReactContext?: unknown) {
    super()
    const _i = internals(this)
    const eng = engineThis(this)
    eng[GEA_ID] = _cm().getUid()
    eng[GEA_ELEMENT] = null
    eng[GEA_PARENT_COMPONENT] = undefined

    const Ctor = this.constructor
    _cm().registerComponentClass(Ctor)
    _componentClassesMap.set(Ctor.name, Ctor)
    ;(this as any)[GEA_RENDERED] = false

    let _rawProps = (props || {}) as Record<string, any>
    let _propsProxy = this[GEA_CREATE_PROPS_PROXY](_rawProps)
    _i.rawProps = _rawProps
    Object.defineProperty(this, 'props', {
      get: () => _propsProxy,
      set: (newProps: unknown) => {
        _rawProps = (newProps || {}) as object as Record<string, any>
        _propsProxy = this[GEA_CREATE_PROPS_PROXY](_rawProps)
        _i.rawProps = _rawProps
      },
      configurable: true,
      enumerable: true,
    })

    _cm().setComponent(this)

    if (!(this.constructor as any)[GEA_COMPILED]) {
      this.created(this.props)
      this.createdHooks(this.props)
      if (typeof (this as any)[GEA_SETUP_LOCAL_STATE_OBSERVERS] === 'function') {
        ;(this as any)[GEA_SETUP_LOCAL_STATE_OBSERVERS]()
      }
    }
  }

  created(_props: P) {}

  createdHooks(_props: P) {}

  get id() {
    return engineThis(this)[GEA_ID]
  }

  get el() {
    const eng = engineThis(this)
    let el = eng[GEA_ELEMENT]
    if (!el) {
      const cloneFn = (this as any)[GEA_CLONE_TEMPLATE]
      if (typeof cloneFn === 'function') {
        el = cloneFn.call(this)
      } else {
        let existing = _getEl(eng[GEA_ID])
        if (existing && existing.id === 'app' && !existing.classList.contains('store-layout')) existing = null
        el = existing || _cm().createElement(String(this.template(this.props)).trim())
      }
      eng[GEA_ELEMENT] = el
      if (el) Component[GEA_SYNC_VALUE_PROPS](el)
    }
    if (el) (el as any)[GEA_DOM_COMPONENT] = this
    return el
  }

  $$<T extends HTMLElement = HTMLElement>(selector?: string): T[] {
    const el = this.el
    if (!el) return []
    return !selector || selector === ':scope' ? [el as T] : ([...el.querySelectorAll(selector)] as T[])
  }

  $<T extends HTMLElement = HTMLElement>(selector?: string): T | null {
    const el = engineThis(this)[GEA_ELEMENT] as HTMLElement | null
    if (!el) return null
    return (!selector || selector === ':scope' ? el : el.querySelector<T>(selector)) as T | null
  }

  // GEA_APPLY_LIST_CHANGES is defined via tree-shakeable IIFE at module bottom

  /** Typing-only overload for React `Component` compatibility (Gea uses `render(parentEl?)` below). */
  render(): import('react').ReactNode
  render(rootEl: any, opt_index?: number): boolean
  render(rootEl?: any, opt_index: number = Infinity): boolean | import('react').ReactNode {
    if ((this as any)[GEA_RENDERED]) return true

    const eng = engineThis(this)
    const el = (eng[GEA_ELEMENT] = this.el)

    if (rootEl) {
      if (opt_index < 0) opt_index = Infinity

      if (rootEl != el.parentElement) {
        if (!rootEl.contains(el)) {
          rootEl.insertBefore(el, rootEl.children[opt_index])
        }
      } else {
        let newIndex = opt_index
        let elementIndex = 0
        let t = el

        while ((t = t.previousElementSibling as HTMLElement)) elementIndex++

        if (elementIndex < newIndex) newIndex++

        if (!(elementIndex == newIndex || (newIndex >= rootEl.childElementCount && el == rootEl.lastElementChild))) {
          rootEl.insertBefore(el, rootEl.children[newIndex])
        }
      }
    }

    _syncAndMount(this)
    requestAnimationFrame(() => this.onAfterRenderAsync())

    return true
  }

  get rendered() {
    return (this as any)[GEA_RENDERED]
  }

  onAfterRender() {}

  onAfterRenderAsync() {}

  onAfterRenderHooks() {}

  /** Render pre-created list items that weren't mounted during construction
   *  (e.g. component was a lazy child inside a conditional slot). */
  [GEA_SYNC_UNRENDERED_LIST_ITEMS](): void {
    const configs = internals(this).listConfigs
    if (!configs?.length) return
    const eid = engineThis(this)[GEA_ID]
    for (const { config: c } of configs) {
      if (!c.items && c.itemsKey) c.items = (this as any)[c.itemsKey]
      if (!c.items?.length) continue
      const container = c.container()
      if (!container) continue
      const condRef = _findCondMarkerByIndex(container, eid, c.afterCondSlotIndex)
      for (const item of c.items) {
        if (!item) continue
        if (!(item as any)[GEA_RENDERED]) {
          item.render(container)
          _moveBeforeCond(container, item, condRef)
        }
      }
    }
  }

  [GEA_CREATE_PROPS_PROXY](raw: any) {
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
        const onProp = (component as any)[GEA_ON_PROP_CHANGE]
        if (typeof onProp === 'function') {
          if (value !== prev || (typeof prev === 'object' && prev !== null)) {
            onProp.call(component, prop, value)
          }
        }
        return true
      },
    })
  }

  [GEA_REACTIVE_PROPS](obj: any) {
    return obj
  }

  [GEA_UPDATE_PROPS](nextProps: Record<string, any>) {
    const eng = engineThis(this)
    if (!(this as any)[GEA_RENDERED]) {
      const el = _getEl(eng[GEA_ID])
      if (el) {
        eng[GEA_ELEMENT] = el
        ;(el as any)[GEA_DOM_COMPONENT] = this
        _syncAndMount(this)
      }
    }
    const onProp = (this as any)[GEA_ON_PROP_CHANGE]
    if (typeof onProp === 'function') {
      const raw = internals(this).rawProps
      for (const key in nextProps) {
        const prev = raw[key]
        const next = nextProps[key]
        raw[key] = next
        if (next !== prev || (typeof prev === 'object' && prev !== null)) {
          onProp.call(this, key, next)
        }
      }
    } else {
      for (const key in nextProps) {
        this.props[key] = nextProps[key]
      }
      this[GEA_REQUEST_RENDER]?.()
    }
  }

  toString() {
    let html = String(this.template(this.props)).trim()
    const key = (this as any)[GEA_ITEM_KEY] as string | undefined
    if (key != null && html.length > 0) {
      html = injectDataGeaItemIdOnFirstOpenTag(html, key)
    }
    return html
  }

  /**
   * Prefer `template({ a, b } = this.props)` so TypeScript infers bindings from `declare props`
   * without `: this['props']`. Runtime still receives props from `template(this.props)` call sites.
   */
  template(_props: this['props'] = this.props): any {
    return '<div></div>'
  }

  dispose() {
    const _i = internals(this)
    _cm().removeComponent(this)

    const eng = engineThis(this)
    const el = eng[GEA_ELEMENT] || _getEl(eng[GEA_ID])
    if (el) {
      ;(el as any)[GEA_DOM_COMPONENT] = undefined
      el.parentNode?.removeChild(el)
    }
    eng[GEA_ELEMENT] = null

    for (const fn of _i.observerRemovers) fn()
    _i.observerRemovers = []

    this[GEA_CLEANUP_BINDINGS]()
    this[GEA_TEARDOWN_SELF_LISTENERS]()
    for (const child of _i.childComponents) child?.dispose?.()
    _i.childComponents = []
  }

  // GEA_REQUEST_RENDER is defined via tree-shakeable IIFE at module bottom

  [GEA_ATTACH_BINDINGS]() {
    this[GEA_CLEANUP_BINDINGS]()
  }

  static _register(ctor: any, compiledTagName?: string) {
    if (!ctor || !ctor.name || ctor[GEA_CTOR_AUTO_REGISTERED]) return
    if (Object.getPrototypeOf(ctor.prototype) === Component.prototype) {
      ctor[GEA_CTOR_AUTO_REGISTERED] = true
      _componentClassesMap.set(ctor.name, ctor)
      const manager = _cm()
      const tagName = compiledTagName || manager.generateTagName_(ctor)
      manager.registerComponentClass(ctor, tagName)
    }
  }

  [GEA_INSTANTIATE_CHILD_COMPONENTS]() {
    const eng = engineThis(this)
    if (!eng[GEA_ELEMENT]) return

    const manager = _cm()
    const selectors = manager.getComponentSelectors()

    const elements: HTMLElement[] = selectors.length
      ? Array.from(eng[GEA_ELEMENT].querySelectorAll(selectors.join(',')))
      : []

    for (const el of elements) {
      if (el.getAttribute('data-gcm')) continue
      if ((el as any)[GEA_DOM_COMPILED_CHILD_ROOT]) continue

      const ctorName = el.constructor.name
      if (ctorName !== 'HTMLUnknownElement' && ctorName !== 'HTMLElement') continue

      const tagName = el.tagName.toLowerCase()

      let Ctor = manager.getComponentConstructor(tagName)

      if (!Ctor) {
        const pascalCase = tagName.replace(/(^|-)(\w)/g, (_: string, __: string, c: string) => c.toUpperCase())
        Ctor = _componentClassesMap.get(pascalCase)
        if (Ctor) {
          manager.registerComponentClass(Ctor, tagName)
        }
      }

      if (!Ctor) continue

      const props = this[GEA_EXTRACT_COMPONENT_PROPS](el)
      const itemId = el.getAttribute('data-prop-item-id')
      const child = new (Ctor as new (props: any) => AnyComponent)(props)
      _setParent(child, this)
      internals(this).childComponents.push(child)

      const parent = el.parentElement
      if (!parent) continue
      const children = Array.prototype.slice.call(parent.children)
      const index = children.indexOf(el)

      child.render(parent, index)
      if (itemId != null && child.el) {
        const wrapper = document.createElement('div')
        ;(wrapper as any)[GEA_DOM_KEY] = itemId
        parent.replaceChild(wrapper, child.el)
        wrapper.appendChild(child.el)
      }
      child.el && child.el.setAttribute('data-gcr', child.id)
      parent.removeChild(el)
    }
  }

  [GEA_MOUNT_COMPILED_CHILD_COMPONENTS]() {
    const _i = internals(this)
    const seen = new Set<AnyComponent>()

    const collect = (value: any) => {
      if (!value) return
      if (Array.isArray(value)) {
        for (const v of value) collect(v)
        return
      }
      if (
        value &&
        typeof value === 'object' &&
        value[GEA_COMPILED_CHILD] &&
        engineThis(engineThis(value)[GEA_PARENT_COMPONENT]) === engineThis(this)
      ) {
        if (!seen.has(value)) {
          seen.add(value)
          _pushCC(_i, value)
        }
      }
    }

    for (const key of Reflect.ownKeys(this)) {
      collect((this as any)[key])
    }

    for (const child of seen) {
      const existing = _getEl(child.id)
      if (!existing) continue
      if ((child as any)[GEA_RENDERED] && engineThis(child)[GEA_ELEMENT] === existing) continue
      ;(existing as any)[GEA_DOM_COMPILED_CHILD_ROOT] = true
      engineThis(child)[GEA_ELEMENT] = existing
      ;(existing as any)[GEA_DOM_COMPONENT] = child
      _mountComp(child, true)
      child[GEA_SYNC_UNRENDERED_LIST_ITEMS]()
      if (typeof (child as any).__adoptListItems === 'function') (child as any).__adoptListItems()
      requestAnimationFrame(() => child.onAfterRenderAsync())
    }
  }

  /**
   * After hydration adopts compiled children, populate the compiler-generated
   * `_<name>Items` tracking arrays with the adopted list-item components.
   *
   * During normal client rendering, `template()` populates these arrays via
   * `this[GEA_CHILD]()` calls inside `.map()`.  During SSR hydration, `template()`
   * is never called, so the arrays stay empty.  When a store change later
   * triggers `GEA_RECONCILE_LIST`, the empty `oldItems` array causes every item
   * to be re-created — duplicating the server-rendered DOM.
   */
  __adoptListItems(): void {
    const _i = internals(this)
    const adopted = _i.childComponents.filter(
      (c) => c[GEA_ITEM_KEY] != null && (c as any)[GEA_RENDERED] && engineThis(c)[GEA_ELEMENT],
    )
    if (adopted.length === 0) return

    adopted.sort((a, b) => {
      const elA = engineThis(a)[GEA_ELEMENT]
      const elB = engineThis(b)[GEA_ELEMENT]
      if (!elA || !elB) return 0
      const pos = elA.compareDocumentPosition(elB)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })

    const raw = ((this as any).__raw ?? this) as Record<string, unknown>

    for (const key of Object.keys(raw)) {
      if (!key.endsWith('Items') || !key.startsWith('_')) continue
      const arr = raw[key]
      if (!Array.isArray(arr) || arr.length > 0) continue
      Array.prototype.push.apply(arr, adopted)
    }

    const configs = _i.listConfigs
    if (!Array.isArray(configs)) return
    for (const { config: c } of configs as Array<{ config: { items: AnyComponent[] | null; itemsKey?: string } }>) {
      if (!c.items && c.itemsKey) c.items = raw[c.itemsKey] as AnyComponent[]
      if (!c.items || c.items.length > 0) continue
      Array.prototype.push.apply(c.items, adopted)
    }
  }

  [GEA_CHILD]<T extends AnyComponent>(Ctor: new (props: any) => T, props: any, key?: any): T {
    const _i = internals(this)
    const child = new Ctor(props)
    _setParent(child, this)
    child[GEA_COMPILED_CHILD] = true
    if (key !== undefined) {
      child[GEA_ITEM_KEY] = String(key)
    }
    _pushCC(_i, child)
    return child
  }

  [GEA_EL](suffix: string): HTMLElement | null {
    const _i = internals(this)
    const eng = engineThis(this)
    let el = _i.elCache.get(suffix) ?? null
    if (!el || !el.isConnected) {
      const id = eng[GEA_ID] + '-' + suffix
      const root = eng[GEA_ELEMENT]
      const bySelector = (r: HTMLElement) => r.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
      // Prefer lookup inside the component root when the tree is not yet connected (getElementById
      // only searches the document). When connected, fall back to subtree query if id lookup misses.
      if (root) {
        el = root.isConnected ? (_getEl(id) ?? bySelector(root)) : bySelector(root)
      } else {
        el = _getEl(id)
      }
      if (el) _i.elCache.set(suffix, el)
      else _i.elCache.delete(suffix)
    }
    return el
  }

  [GEA_UPDATE_TEXT](suffix: string, text: string): void {
    const el = this[GEA_EL](suffix)
    if (el) el.textContent = text
  }

  static [GEA_STATIC_ESCAPE_HTML](str: string): string {
    return __escapeHtml(str)
  }

  static [GEA_STATIC_SANITIZE_ATTR](name: string, value: string): string {
    return __sanitizeAttr(name, value)
  }

  [GEA_OBSERVE](store: any, path: string[], handler: (value: any, changes: any[]) => void): void {
    const remover = store[GEA_STORE_ROOT].observe(path, handler.bind(this))
    internals(this).observerRemovers.push(remover)
  }

  [GEA_REORDER_CHILDREN](container: HTMLElement | null, items: AnyComponent[], afterCondSlotIndex?: number): void {
    const _i = internals(this)
    const eng = engineThis(this)
    if (!container || !(this as any)[GEA_RENDERED]) return
    for (const item of items) {
      if (!(item as any)[GEA_RENDERED]) {
        _pushCC(_i, item)
        item.render(container)
      }
    }

    const ordered: Node[] = []
    for (const item of items) {
      const el: HTMLElement | null = engineThis(item)[GEA_ELEMENT]
      if (!el) continue
      ordered.push(_rootIn(el, container))
    }
    if (ordered.length === 0) return

    const condRef = _findCondMarkerByIndex(container, eng[GEA_ID], afterCondSlotIndex)
    if (condRef) {
      for (const el of ordered) {
        container.insertBefore(el, condRef)
      }
    } else {
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
  }

  [GEA_RECONCILE_LIST](
    oldItems: AnyComponent[],
    newData: any[],
    container: HTMLElement | null,
    Ctor: new (props: any) => AnyComponent,
    propsFactory: (item: any, index?: number) => any,
    keyExtractor: (item: any, index?: number) => any,
    afterCondSlotIndex?: number,
  ): AnyComponent[] {
    const _i = internals(this)
    const oldByKey = new Map<string, AnyComponent>()
    for (const item of oldItems) {
      if (!item) continue
      if (item[GEA_ITEM_KEY] != null) oldByKey.set(item[GEA_ITEM_KEY]!, item)
    }

    if (oldByKey.size === 0 && container) {
      for (let ch = container.firstElementChild; ch; ch = ch.nextElementSibling) {
        const comp = (ch as any)[GEA_DOM_COMPONENT] as AnyComponent | undefined
        if (!comp) continue
        const keyed = _findKeyedAncestor(comp)
        if (keyed) oldByKey.set(keyed[GEA_ITEM_KEY]!, keyed)
      }
    }

    if (oldItems.length === 0 && newData.length > 0 && container && oldByKey.size === 0) {
      while (container.firstElementChild) {
        container.removeChild(container.firstElementChild)
      }
    }

    const next = newData.map((data, idx) => {
      const key = String(keyExtractor(data, idx))
      const existing = oldByKey.get(key)
      if (existing) {
        existing[GEA_UPDATE_PROPS](propsFactory(data, idx))
        oldByKey.delete(key)
        return existing
      }
      const transferred = _claimTransfer(key)
      if (transferred) {
        transferred[GEA_UPDATE_PROPS](propsFactory(data, idx))
        _setParent(transferred, this)
        _pushCC(_i, transferred)
        return transferred
      }
      return this[GEA_CHILD](Ctor, propsFactory(data, idx), key)
    })

    for (const removed of oldByKey.values()) {
      if (_isInTransfer(removed)) continue
      removed.dispose?.()
    }

    this[GEA_REORDER_CHILDREN](container, next, afterCondSlotIndex)

    if (container && next.length > 0) {
      const rootSet = new Set<HTMLElement>()
      for (const item of next) {
        const eng = engineThis(item)
        if (!eng?.[GEA_ELEMENT]) continue
        const el = _rootIn(eng[GEA_ELEMENT], container)
        if (el.parentElement === container) rootSet.add(el)
      }
      if (rootSet.size === next.length && container.childElementCount > next.length) {
        for (let ch: ChildNode | null = container.firstChild; ch; ) {
          const nx = ch.nextSibling
          if (ch.nodeType === 1 && !rootSet.has(ch as HTMLElement)) {
            const comp = (ch as any)[GEA_DOM_COMPONENT] as AnyComponent | undefined
            const keyedAncestor = _findKeyedAncestor(comp)
            if (keyedAncestor) {
              keyedAncestor.dispose?.()
              ;(ch as HTMLElement).remove()
            }
          }
          ch = nx
        }
      }
    }

    _i.childComponents = _i.childComponents.filter((child) => !oldItems.includes(child) || next.includes(child))

    return next
  }

  // GEA_OBSERVE_LIST and GEA_REFRESH_LIST are defined via tree-shakeable IIFE at module bottom

  // GEA_SWAP_CHILD is defined via tree-shakeable IIFE at module bottom

  [GEA_CLEANUP_BINDINGS]() {
    internals(this).bindings = []
  }

  [GEA_SETUP_EVENT_DIRECTIVES]() {
    return
  }

  [GEA_TEARDOWN_SELF_LISTENERS]() {
    const _i = internals(this)
    for (const fn of _i.selfListeners) fn()
    _i.selfListeners = []
  }

  [GEA_EXTRACT_COMPONENT_PROPS](el) {
    const _i = internals(this)
    // Prefer JS object props set by createXItem for component-root map items
    if ((el as any)[GEA_DOM_PROPS]) {
      const jsProps = (el as any)[GEA_DOM_PROPS]
      delete (el as any)[GEA_DOM_PROPS]
      return jsProps
    }

    const props = {}
    if (!el.getAttributeNames) return props

    for (const name of el.getAttributeNames()) {
      if (!name.startsWith('data-prop-')) continue
      const value = el.getAttribute(name)
      const propName = this[GEA_NORMALIZE_PROP_NAME](name.slice(10))

      if (_i.geaPropBindings && value && value.startsWith(GEA_PROP_BINDING_ATTR_PREFIX)) {
        props[propName] = _i.geaPropBindings.get(value)
      } else {
        props[propName] = this[GEA_COERCE_STATIC_PROP_VALUE](value)
      }

      el.removeAttribute(name)
    }

    if (!('children' in props)) {
      const inner = el.innerHTML
      if (inner) props['children'] = inner
    }

    return props
  }

  [GEA_COERCE_STATIC_PROP_VALUE](value) {
    if (value == null) return undefined
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
    return value
  }

  [GEA_NORMALIZE_PROP_NAME](name) {
    return name.replace(/-([a-z])/g, (_, chr) => chr.toUpperCase())
  }

  // Map + clone methods are defined via tree-shakeable IIFE at module bottom

  [GEA_REGISTER_COND](
    idx: number,
    slotId: string,
    getCond: () => boolean,
    getTruthyHtml: (() => string) | null,
    getFalsyHtml: (() => string) | null,
  ): void {
    const _i = internals(this)
    if (!_i.geaConds) _i.geaConds = {}
    _i.geaConds[idx] = { slotId, getCond, getTruthyHtml, getFalsyHtml }
    if (!(this as any)[GEA_RENDERED]) {
      if (!_i.condPatchPrev) _i.condPatchPrev = {}
      try {
        _i.condPatchPrev[idx] = !!getCond()
      } catch {
        /* getCond may depend on state not yet available; leave undefined */
      }
    }
  }

  /**
   * Re-run compiler-generated setup after incremental DOM updates (e.g. conditional slots) so
   * `ref={this.x}` targets stay in sync; `querySelector` returns `null` when a marked node is
   * absent, clearing stale references.
   */
  [GEA_SYNC_DOM_REFS](): void {
    const fn = (this as any)[GEA_SETUP_REFS]
    if (typeof fn === 'function') fn.call(this)
  }

  [GEA_PATCH_COND](idx: number): boolean {
    const _i = internals(this)
    const conf = _i.geaConds?.[idx]
    if (!conf) return false
    let cond: boolean
    try {
      cond = !!conf.getCond()
    } catch {
      return false
    }
    const condPatchPrev = (_i.condPatchPrev ??= {})
    const prev = condPatchPrev[idx]
    const needsPatch = cond !== prev
    const eng = engineThis(this)
    const eid = eng[GEA_ID]
    const root = eng[GEA_ELEMENT] || _getEl(eid)
    if (!root) return false
    const markerText = eid + '-' + conf.slotId
    const endMarkerText = markerText + '-end'
    const marker = _findComment(root, markerText, true)
    const endMarker = _findComment(root, endMarkerText, true)
    const parent = endMarker && endMarker.parentNode
    if (!marker || !endMarker || !parent) {
      condPatchPrev[idx] = undefined as unknown as boolean
      return false
    }
    // Do NOT set condPatchPrev until after replaceSlotContent runs. Committing the branch value
    // before DOM update lets html==='' / partial clears leave stale nodes while the next patch
    // sees needsPatch false and skips full replace (flight-checkin: duplicate OptionSteps; jira/e2e).
    // Keyed list rows can mount just after the slot end marker when the list container is the
    // parent element (e.g. .email-list) rather than strictly between markers; strip those orphans
    // after any conditional slot replace so empty-state branches do not leave stale rows.
    // Only email rows are mounted after the slot end marker in the folder-empty case; stripping
    // `data-gid` here removed legitimate keyed list rows (todo, ecommerce, playground) that
    // follow conditional markers in other layouts.
    const replaceSlotContent = (htmlFn: (() => string) | null) => {
      if (!htmlFn) {
        _clearBetweenMarkers(marker, endMarker)
        return
      }
      const html = htmlFn()
      // Empty reinjection = no static HTML for this branch; __applyListChanges may already own
      // keyed rows between markers. Remove only non–list nodes (placeholders, text) so patch order
      // vs list observers does not wipe keyed rows (mobile-showcase gesture log).
      if (html === '') {
        // Falsy branch with '' (e.g. `&&` without else compiled to empty): must remove keyed
        // .map() rows too — otherwise a previous truthy branch leaves data-gid nodes and
        // the next truthy branch injects again (duplicate OptionSteps / flight-checkin e2e).
        // Only do aggressive removal on real true→false transitions; initial patches
        // (prev === undefined) must preserve keyed rows the template already placed.
        if (!cond && prev === true) {
          _clearBetweenMarkers(marker, endMarker)
          return
        }
        _eachBetween(marker, endMarker, (n) => {
          if (!n.parentNode) return false
          try {
            if (n.nodeType !== 1) {
              n.remove()
            } else if ((n as any)[GEA_DOM_KEY] == null && !(n as HTMLElement).hasAttribute?.(ITEM_ID_ATTR)) {
              n.remove()
            }
          } catch {
            /* detached */
          }
        })
        return
      }
      _clearBetweenMarkers(marker, endMarker)
      const isSvg = 'namespaceURI' in parent && (parent as Element).namespaceURI === 'http://www.w3.org/2000/svg'
      if (isSvg) {
        const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        wrap.innerHTML = html
        while (wrap.firstChild) parent.insertBefore(wrap.firstChild, endMarker)
      } else {
        const tpl = document.createElement('template')
        tpl.innerHTML = html
        Component[GEA_SYNC_VALUE_PROPS](tpl.content)
        parent.insertBefore(tpl.content, endMarker)
      }
    }

    if (needsPatch) {
      if ((prev === true && !cond) || (prev === false && cond)) {
        _disposeAndRemoveChildren(this, _collectCompiledChildrenBetween(this, marker, endMarker))
      }
      replaceSlotContent(cond ? conf.getTruthyHtml : conf.getFalsyHtml)
      if (cond) {
        _attachAndMount(this, false, false)
        Component[GEA_SYNC_AUTOFOCUS](marker, endMarker)
      }
      condPatchPrev[idx] = cond
    } else {
      const htmlFn = cond ? conf.getTruthyHtml : conf.getFalsyHtml
      if (htmlFn) {
        if (cond) {
          const first = marker.nextSibling as HTMLElement | null
          if (first && first.nodeType === 1 && (first as Node) !== endMarker) {
            if ((first as any)[GEA_DOM_COMPILED_CHILD_ROOT]) return needsPatch
            for (const child of _i.childComponents) {
              if (_compiledChildOwns(child, first)) return needsPatch
            }
          }
        }
        const tpl = document.createElement('template')
        tpl.innerHTML = htmlFn()
        const nc = Array.from(tpl.content.childNodes)
        let existing = marker.nextSibling
        let ni = 0
        while (existing && (existing as Node) !== endMarker && ni < nc.length) {
          const desired = nc[ni]
          if (existing.nodeType === 1 && desired.nodeType === 1) {
            if (!(existing as any)[GEA_DOM_COMPILED_CHILD_ROOT]) {
              Component[GEA_PATCH_NODE](existing as Element, desired as Element)
            }
          } else if (existing.nodeType === 3 && desired.nodeType === 3) {
            if (existing.textContent !== desired.textContent) existing.textContent = desired.textContent
          }
          existing = existing.nextSibling
          ni++
        }
      }
    }
    this[GEA_SYNC_DOM_REFS]()
    return needsPatch
  }

  static [GEA_SYNC_VALUE_PROPS](root: DocumentFragment | Element): void {
    const els = (root as Element).querySelectorAll?.('textarea[value], input[value], select[value]')
    if (!els) return
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLInputElement | HTMLTextAreaElement
      el.value = el.getAttribute('value') || ''
    }
  }

  static [GEA_SYNC_AUTOFOCUS](startMarker: Comment, endMarker: Comment): void {
    _eachBetween(startMarker, endMarker, (n) => {
      if (n.nodeType === 1) {
        const el = n as HTMLElement
        const target = el.hasAttribute('autofocus') ? el : el.querySelector('[autofocus]')
        if (target) {
          ;(target as HTMLElement).focus()
          return false
        }
      }
    })
  }

  static [GEA_PATCH_NODE](existing: Element, desired: Element, preserveExtraAttrs?: boolean): void {
    if ((existing as any)[GEA_DOM_COMPILED_CHILD_ROOT]) return
    if (existing.tagName !== desired.tagName) {
      existing.replaceWith(desired.cloneNode(true))
      return
    }

    const oldAttrs = existing.attributes
    const newAttrs = desired.attributes
    if (!preserveExtraAttrs) {
      for (let i = oldAttrs.length - 1; i >= 0; i--) {
        const name = oldAttrs[i].name
        if (!desired.hasAttribute(name)) existing.removeAttribute(name)
      }
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
          Component[GEA_PATCH_NODE](oldChild as Element, newChild as Element, preserveExtraAttrs)
        }
      }
    }
  }

  static register(tagName?: string) {
    const manager = _cm()
    manager.registerComponentClass(this, tagName)
    _componentClassesMap.set(this.name, this)
  }
}

Object.defineProperty(Component, GEA_COMPONENT_CLASSES, {
  get() {
    return _componentClassesMap
  },
  configurable: true,
})

for (const [sym, field] of [
  [GEA_MAPS, 'geaMaps'],
  [GEA_CONDS, 'geaConds'],
  [GEA_EL_CACHE, 'elCache'],
  [GEA_CHILD_COMPONENTS, 'childComponents'],
  [GEA_OBSERVER_REMOVERS, 'observerRemovers'],
  [GEA_COMPILED_CHILD, 'geaCompiledChild'],
  [GEA_ITEM_KEY, 'geaItemKey'],
  [GEA_SELF_LISTENERS, 'selfListeners'],
  [GEA_PROP_BINDINGS, 'geaPropBindings'],
  [GEA_RESET_ELS, 'resetEls'],
] as [symbol, string][]) {
  Object.defineProperty(Component.prototype, sym, {
    get(this: Component) {
      return internals(this)[field]
    },
    set(this: Component, v: any) {
      internals(this)[field] = v
    },
    configurable: true,
  })
}

{
  type AC = Component<any>

  Component.prototype[GEA_SWAP_CHILD] = function (
    this: AC,
    markerId: string,
    newChild: Component | false | null | undefined,
  ) {
    const _i = internals(this)
    const eng = engineThis(this)
    const marker = _getEl(eng[GEA_ID] + '-' + markerId)
    if (!marker) return
    const oldEl = marker.nextElementSibling as HTMLElement | null
    if (newChild && (newChild as any)[GEA_RENDERED] && engineThis(newChild)[GEA_ELEMENT] === oldEl) return
    if (oldEl && oldEl.tagName !== 'TEMPLATE') {
      const oldChild = _i.childComponents.find((c: any) => engineThis(c)[GEA_ELEMENT] === oldEl)
      if (oldChild) {
        ;(oldChild as any)[GEA_RENDERED] = false
        engineThis(oldChild)[GEA_ELEMENT] = null
      }
      oldEl.remove()
    }
    if (!newChild) return
    marker.insertAdjacentHTML('afterend', String(newChild.template(newChild.props)).trim())
    const newEl = marker.nextElementSibling as HTMLElement | null
    if (!newEl) return
    engineThis(newChild)[GEA_ELEMENT] = newEl
    _pushCC(_i, newChild)
    _mountComp(newChild, false)
  }

  Component.prototype[GEA_REGISTER_MAP] = function (
    this: AC,
    idx: number,
    containerProp: string,
    getContainer: () => HTMLElement | null,
    getItems: () => any[],
    createItem: (item: any) => HTMLElement,
    keyProp?: string | ((item: any) => string),
  ): void {
    const _i = internals(this)
    if (!_i.geaMaps) _i.geaMaps = {}
    _i.geaMaps[idx] = {
      containerProp,
      getContainer,
      getItems,
      createItem,
      container: null as HTMLElement | null,
      keyProp,
    }
  }

  Component.prototype[GEA_SYNC_MAP] = function (this: AC, idx: number): void {
    if (!(this as any)[GEA_RENDERED]) return
    const map = internals(this).geaMaps?.[idx]
    if (!map) return
    const container = _resolveMapContainer(map.getContainer())
    if (!container) return
    map.container = container
    ;(this as any)[map.containerProp] = container
    const items = map.getItems()
    this[GEA_SYNC_ITEMS](container, Array.isArray(items) ? items : [], map.createItem, map.keyProp)
  }

  Component.prototype[GEA_SYNC_ITEMS] = function (
    this: AC,
    container: HTMLElement,
    items: any[],
    createItemFn: (item: any, index?: number) => HTMLElement,
    keyProp?: string | ((item: any, index?: number) => string),
  ): void {
    const itemKey =
      typeof keyProp === 'function'
        ? keyProp
        : (item: any, _index?: number): string => {
            if (item != null && typeof item === 'object') {
              if (keyProp && keyProp in item) return String(item[keyProp])
              if ('id' in item) return String(item.id)
            }
            return String(item)
          }
    const c = container as any
    let prev: any[] | undefined = c[GEA_MAP_CONFIG_PREV]
    if (!prev) {
      prev = []
      for (let n: ChildNode | null = container.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) {
          const aid = _itemId(n)
          if (aid != null) prev.push(aid)
        } else if (_isSentinel(n)) break
      }
      c[GEA_MAP_CONFIG_COUNT] = prev.length
    }
    if (prev.length === items.length) {
      let same = true
      for (let j = 0; j < prev.length; j++)
        if (itemKey(prev[j], j) !== itemKey(items[j], j)) {
          same = false
          break
        }
      if (same) {
        let child: ChildNode | null = container.firstChild
        for (let j = 0; j < items.length; j++) {
          while (child && (child.nodeType !== 1 || _itemId(child) == null)) {
            if (_isSentinel(child)) break
            child = child.nextSibling
          }
          if (!child || child.nodeType !== 1) break
          const oldEl = child as HTMLElement
          child = child.nextSibling
          const newEl = createItemFn(items[j], j)
          Component[GEA_PATCH_NODE](oldEl, newEl, true)
          if ((newEl as any)[GEA_DOM_ITEM] !== undefined) (oldEl as any)[GEA_DOM_ITEM] = (newEl as any)[GEA_DOM_ITEM]
          if ((newEl as any)[GEA_DOM_KEY] !== undefined) (oldEl as any)[GEA_DOM_KEY] = (newEl as any)[GEA_DOM_KEY]
        }
        c[GEA_MAP_CONFIG_PREV] = items.slice()
        return
      }
    }
    if (items.length > prev.length && prev.length > 0) {
      let appendOk = true
      for (let j = 0; j < prev.length; j++)
        if (itemKey(prev[j], j) !== itemKey(items[j], j)) {
          appendOk = false
          break
        }
      if (appendOk) {
        const frag = _frag()
        for (let j = prev.length; j < items.length; j++) frag.appendChild(createItemFn(items[j], j))
        Component[GEA_SYNC_VALUE_PROPS](frag)
        let marker: ChildNode | null = null
        for (let sc: ChildNode | null = container.firstChild; sc; sc = sc.nextSibling)
          if (_isSentinel(sc)) {
            marker = sc
            break
          }
        container.insertBefore(frag, marker)
        _updateMapState(c, items)
        return
      }
    }
    if (items.length < prev.length) {
      const newSet = new Set<string>()
      for (let j = 0; j < items.length; j++) newSet.add(itemKey(items[j], j))
      const removals: ChildNode[] = []
      for (let sc: ChildNode | null = container.firstChild; sc; sc = sc.nextSibling) {
        if (sc.nodeType === 1) {
          const aid = _itemId(sc)
          if (aid != null && !newSet.has(aid)) removals.push(sc)
        } else if (_isSentinel(sc)) break
      }
      if (removals.length === prev.length - items.length) {
        for (let j = 0; j < removals.length; j++) container.removeChild(removals[j])
        _updateMapState(c, items)
        return
      }
    }
    let oldCount: number | undefined = c[GEA_MAP_CONFIG_COUNT]
    if (oldCount == null || (oldCount === 0 && container.firstChild)) {
      oldCount = 0
      for (let n: ChildNode | null = container.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) oldCount++
        else if (_isSentinel(n)) break
      }
    }
    let toRemove = oldCount
    while (toRemove > 0 && container.firstChild) {
      const rm = container.firstChild
      if (rm.nodeType === 1) toRemove--
      container.removeChild(rm)
    }
    const fragment = _frag()
    for (let i = 0; i < items.length; i++) fragment.appendChild(createItemFn(items[i], i))
    Component[GEA_SYNC_VALUE_PROPS](fragment)
    container.insertBefore(fragment, container.firstChild)
    _updateMapState(c, items)
  }

  Component.prototype[GEA_CLONE_ITEM] = function (
    this: AC,
    container: HTMLElement,
    item: any,
    renderFn: (item: any) => string,
    bindingId?: string,
    itemIdProp?: string,
    patches?: any[],
  ): HTMLElement {
    const c = container as any,
      idProp = itemIdProp || 'id'
    if (!c[GEA_MAP_CONFIG_TPL]) {
      try {
        const tw = container.cloneNode(false) as HTMLElement
        tw.innerHTML = renderFn({ [idProp]: 0, label: '' })
        c[GEA_MAP_CONFIG_TPL] = tw.firstElementChild
      } catch {
        /* fallback below */
      }
    }
    let el: HTMLElement
    if (c[GEA_MAP_CONFIG_TPL]) {
      el = c[GEA_MAP_CONFIG_TPL].cloneNode(true) as HTMLElement
    } else {
      const tw = container.cloneNode(false) as HTMLElement
      tw.innerHTML = renderFn(item)
      el = tw.firstElementChild as HTMLElement
    }
    const raw = item != null && typeof item === 'object' ? item[idProp] : undefined
    ;(el as any)[GEA_DOM_KEY] = String(raw != null ? raw : item)
    ;(el as any)[GEA_DOM_ITEM] = item
    if (patches) {
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i],
          path: number[] = p[0],
          type: string = p[1],
          val = p[2]
        let target: HTMLElement = el
        for (let j = 0; j < path.length; j++) target = target.children[path[j]] as HTMLElement
        if (type === 'c') target.className = String(val).trim()
        else if (type === 't') target.textContent = String(val)
        else if (val == null || val === false) target.removeAttribute(type)
        else {
          target.setAttribute(type, String(val))
          if (type === 'value' && 'value' in target) (target as HTMLInputElement).value = String(val)
        }
      }
    }
    Component[GEA_SYNC_VALUE_PROPS](el)
    return el
  }

  Component.prototype[GEA_REQUEST_RENDER] = function (this: AC) {
    const _i = internals(this)
    const eng = engineThis(this)
    const el = eng[GEA_ELEMENT]
    if (!el || !el.parentNode) return

    const parent = el.parentNode
    const a = document.activeElement as HTMLElement | null
    const hasFocus = a && el.contains(a)
    const focusId = hasFocus && a!.id ? a!.id : null
    const focusIsRoot = hasFocus && a === el
    const selStart = hasFocus && 'selectionStart' in a! ? ((a as HTMLInputElement).selectionStart ?? null) : null
    const selEnd = hasFocus && 'selectionStart' in a! ? ((a as HTMLInputElement).selectionEnd ?? null) : null
    const focusVal = hasFocus && 'value' in a! ? String((a as HTMLInputElement).value ?? '') : null

    this[GEA_CLEANUP_BINDINGS]()
    this[GEA_TEARDOWN_SELF_LISTENERS]()
    for (const child of _i.childComponents) {
      if (!child) continue
      if (child[GEA_COMPILED_CHILD]) {
        ;(child as any)[GEA_RENDERED] = false
        engineThis(child)[GEA_ELEMENT] = null
        const resetTree = (c: Component) => {
          if (!internals(c).childComponents?.length) return
          for (const ch of internals(c).childComponents) {
            if (!ch) continue
            ;(ch as any)[GEA_RENDERED] = false
            engineThis(ch)[GEA_ELEMENT] = null
            resetTree(ch)
          }
        }
        resetTree(child)
      } else if (typeof child.dispose == 'function') child.dispose()
    }
    _i.childComponents = []

    _i.elCache.clear()
    this[GEA_RESET_ELS]?.()

    const placeholder = document.createComment('')
    try {
      if (el.parentNode === parent) {
        el.replaceWith(placeholder)
      } else {
        parent.appendChild(placeholder)
      }
    } catch {
      if (!placeholder.parentNode) parent.appendChild(placeholder)
    }

    const manager = _cm()
    const cloneFn = (this as any)[GEA_CLONE_TEMPLATE]
    const newElement =
      typeof cloneFn === 'function'
        ? cloneFn.call(this)
        : manager.createElement(String(this.template(this.props)).trim())

    if (!newElement) {
      eng[GEA_ELEMENT] = placeholder as unknown as HTMLElement
      ;(this as any)[GEA_RENDERED] = true
      return
    }

    Component[GEA_SYNC_VALUE_PROPS](newElement)
    parent.replaceChild(newElement, placeholder)

    eng[GEA_ELEMENT] = newElement
    ;(this as any)[GEA_RENDERED] = true
    manager.markComponentRendered(this)

    _attachAndMount(this, true)

    for (const { store: s, path: p, config: c } of _i.listConfigs) {
      if (!c.items && c.itemsKey) c.items = (this as any)[c.itemsKey]
      if (!c.items) continue
      const arr = p.reduce((obj: any, key: string) => obj?.[key], s[GEA_STORE_ROOT]) ?? []
      if (arr.length === c.items.length) continue
      const next = this[GEA_RECONCILE_LIST](c.items, arr, c.container(), c.Ctor, c.props, c.key, c.afterCondSlotIndex)
      c.items.length = 0
      c.items.push(...next)
    }

    if (hasFocus) {
      const root = eng[GEA_ELEMENT]
      const t = ((focusId && _getEl(focusId)) || (focusIsRoot ? root : null)) as HTMLElement | null
      if (t && root.contains(t)) {
        t.focus()
        if (selStart != null && selEnd != null && 'setSelectionRange' in t) {
          const inp = t as HTMLInputElement | HTMLTextAreaElement
          const v = 'value' in inp ? String(inp.value ?? '') : ''
          const d = focusVal != null && selStart === selEnd ? v.length - focusVal.length : 0
          inp.setSelectionRange(
            Math.max(0, Math.min(v.length, selStart + d)),
            Math.max(0, Math.min(v.length, selEnd + d)),
          )
        }
      }
    }

    this.onAfterRender()
    this.onAfterRenderHooks()
    setTimeout(() => requestAnimationFrame(() => this.onAfterRenderAsync()))
  }

  Component.prototype[GEA_APPLY_LIST_CHANGES] = function (
    this: AC,
    container: HTMLElement,
    array: any[],
    changes: StoreChange[] | null,
    config: ListConfig,
  ) {
    if (changes && changes.length > 0 && changes[0].aipu && !config.hasComponentItems) {
      applyListChanges(container, array, changes, config)
      return
    }
    const prevCount = container.childElementCount
    applyListChanges(container, array, changes, config)
    if (container.childElementCount !== prevCount || config.hasComponentItems) {
      this[GEA_INSTANTIATE_CHILD_COMPONENTS]()
    }
  }

  Component.prototype[GEA_OBSERVE_LIST] = function (this: AC, store: any, path: string[], config: any): void {
    internals(this).listConfigs.push({ store, path, config })
    this[GEA_OBSERVE](store, path, (_value: any, changes: any) => {
      _handleListChange(this, store[GEA_STORE_ROOT], path, config, changes)
    })
  }

  Component.prototype[GEA_REFRESH_LIST] = function (this: AC, pathKey: string): void {
    const configs = internals(this).listConfigs
    if (!configs?.length) return
    for (const { store: s, path: p, config: c } of configs) {
      if (p.join('.') !== pathKey) continue
      _handleListChange(this, s, p, c, null)
    }
  }
}
