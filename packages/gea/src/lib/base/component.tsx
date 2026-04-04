import ComponentManager from './component-manager'
import { getComponentInternals as internals } from './component-internal'
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
  GEA_PROXY_GET_RAW_TARGET,
  GEA_PROP_BINDINGS,
  GEA_REACTIVE_PROPS,
  GEA_RECONCILE_LIST,
  GEA_REFRESH_LIST,
  GEA_REGISTER_COND,
  GEA_REGISTER_MAP,
  GEA_RENDERED,
  GEA_RESET_CHILD_TREE,
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

/** Raw component instance (bypasses Store root proxy) for symbol-backed engine fields. */
function engineThis(c: object): any {
  return (c as any)[GEA_PROXY_GET_RAW_TARGET] ?? c
}

const _componentClassesMap = new Map<string, Function>()

type AnyComponent = Component<any>

const _URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

/** Compare component refs whether held as the Store proxy or the raw instance (methods are bound to target). */
function sameComponentIdentity(a: unknown, b: unknown): boolean {
  const ra = a && typeof a === 'object' ? ((a as any)[GEA_PROXY_GET_RAW_TARGET] ?? a) : a
  const rb = b && typeof b === 'object' ? ((b as any)[GEA_PROXY_GET_RAW_TARGET] ?? b) : b
  return ra === rb
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
function _findCondMarkerByIndex(
  container: HTMLElement,
  componentId: string,
  slotIndex: number | undefined,
): ChildNode | null {
  if (slotIndex == null) return null
  const target = `${componentId}-c${slotIndex}`
  for (let node: ChildNode | null = container.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 8 && (node as Comment).data === target) return node
  }
  return null
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

export function __escapeHtml(str: string): string {
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
  if (/\sdata-gea-item-id\s*=/.test(full)) return html
  const esc = __escapeHtml(key)
  return `<${m[1]}${m[2]} data-gea-item-id="${esc}">` + html.slice(full.length)
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
  static _ssgMode = false

  declare props: P

  constructor(props: P = {} as P, _unusedReactContext?: unknown) {
    super()
    internals(this) // ensure engine WeakMap entry
    const eng = engineThis(this)
    eng[GEA_ID] = ComponentManager.getInstance().getUid()
    eng[GEA_ELEMENT] = null
    eng[GEA_PARENT_COMPONENT] = undefined

    const Ctor = this.constructor
    ComponentManager.getInstance().registerComponentClass(Ctor)
    _componentClassesMap.set(Ctor.name, Ctor)
    ;(this as any)[GEA_RENDERED] = false

    let _rawProps = (props || {}) as Record<string, any>
    let _propsProxy = this[GEA_CREATE_PROPS_PROXY](_rawProps)
    internals(this).rawProps = _rawProps
    Object.defineProperty(this, 'props', {
      get: () => _propsProxy,
      set: (newProps: unknown) => {
        _rawProps = (newProps || {}) as object as Record<string, any>
        _propsProxy = this[GEA_CREATE_PROPS_PROXY](_rawProps)
        internals(this).rawProps = _rawProps
      },
      configurable: true,
      enumerable: true,
    })

    ComponentManager.getInstance().setComponent(this)

    if (!Component._ssgMode) {
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
    if (!eng[GEA_ELEMENT]) {
      const cloneFn = (this as any)[GEA_CLONE_TEMPLATE]
      if (typeof cloneFn === 'function') {
        eng[GEA_ELEMENT] = cloneFn.call(this)
      } else {
        let existing = document.getElementById(eng[GEA_ID])
        // getUid() can yield id "app" (e.g. (13885).toString(36) === "app"). getElementById then
        // returns the Vite/SPA mount shell <div id="app">, not the component template root — reusing
        // it skips template() and leaves an empty tree (e.g. ecommerce main.product-grid).
        if (existing && existing.id === 'app' && !existing.classList.contains('store-layout')) {
          existing = null
        }
        if (existing) {
          eng[GEA_ELEMENT] = existing
        } else {
          eng[GEA_ELEMENT] = ComponentManager.getInstance().createElement(String(this.template(this.props)).trim())
        }
      }
      if (eng[GEA_ELEMENT]) Component[GEA_SYNC_VALUE_PROPS](eng[GEA_ELEMENT])
    }
    if (eng[GEA_ELEMENT]) {
      ;(eng[GEA_ELEMENT] as any)[GEA_DOM_COMPONENT] = this
    }
    return eng[GEA_ELEMENT]
  }

  $$<T extends HTMLElement = HTMLElement>(selector?: string): T[] {
    let rv: T[] = []
    const el = this.el

    if (el) {
      if (selector == undefined || selector === ':scope') rv = [el as T]
      else rv = [...(el as HTMLElement).querySelectorAll<T>(selector)]
    }

    return rv
  }

  $<T extends HTMLElement = HTMLElement>(selector?: string): T | null {
    let rv: T | null = null
    const el = engineThis(this)[GEA_ELEMENT] as HTMLElement | null

    if (el) {
      rv = (selector == undefined || selector === ':scope' ? el : el.querySelector<T>(selector)) as T | null
    }

    return rv
  }

  [GEA_APPLY_LIST_CHANGES](container: HTMLElement, array: any[], changes: StoreChange[] | null, config: ListConfig) {
    if (changes && changes.length > 0 && changes[0].isArrayItemPropUpdate && !config.hasComponentItems) {
      applyListChanges(container, array, changes, config)
      return
    }
    const prevCount = container.childElementCount
    applyListChanges(container, array, changes, config)
    if (container.childElementCount !== prevCount || config.hasComponentItems) {
      this[GEA_INSTANTIATE_CHILD_COMPONENTS]()
    }
  }

  /** Typing-only overload for React `Component` compatibility (Gea uses `render(parentEl?)` below). */
  render(): import('react').ReactNode
  render(rootEl: any, opt_index?: number): boolean
  render(rootEl?: any, opt_index: number = Infinity): boolean | import('react').ReactNode {
    if ((this as any)[GEA_RENDERED]) return true

    const eng = engineThis(this)
    eng[GEA_ELEMENT] = this.el

    if (rootEl) {
      if (opt_index < 0) opt_index = Infinity

      if (rootEl != eng[GEA_ELEMENT].parentElement) {
        // When the element is already a descendant of the target container (e.g. the
        // list item's inner div is wrapped by a compiled child component root like Card),
        // moving it would rip it out of its wrapper and create a duplicate entry. Skip
        // the insertBefore in that case — the element is already where it needs to be.
        if (!rootEl.contains(eng[GEA_ELEMENT])) {
          rootEl.insertBefore(eng[GEA_ELEMENT], rootEl.children[opt_index])
        }
      } else {
        let newIndex = opt_index
        let elementIndex = 0
        let t = eng[GEA_ELEMENT]

        while ((t = t.previousElementSibling as HTMLElement)) elementIndex++

        if (elementIndex < newIndex) newIndex++

        if (
          !(
            elementIndex == newIndex ||
            (newIndex >= rootEl.childElementCount && eng[GEA_ELEMENT] == rootEl.lastElementChild)
          )
        ) {
          rootEl.insertBefore(eng[GEA_ELEMENT], rootEl.children[newIndex])
        }
      }
    }

    ;(this as any)[GEA_RENDERED] = true
    if (eng[GEA_ELEMENT]) {
      ;(eng[GEA_ELEMENT] as any)[GEA_DOM_COMPONENT] = this
    }
    ComponentManager.getInstance().markComponentRendered(this)

    // Mount component-array rows before compiled children (e.g. Select) so conditional-slot patches
    // see data-gea-item-id rows to preserve. GEA_EL resolves ids inside the root when detached.
    this[GEA_SYNC_UNRENDERED_LIST_ITEMS]()

    this[GEA_ATTACH_BINDINGS]()
    this[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
    this[GEA_INSTANTIATE_CHILD_COMPONENTS]()
    this[GEA_SETUP_EVENT_DIRECTIVES]()
    const setupRefs = (this as any)[GEA_SETUP_REFS]
    if (typeof setupRefs === 'function') setupRefs.call(this)

    this.onAfterRender()
    this.onAfterRenderHooks()
    this[GEA_SYNC_UNRENDERED_LIST_ITEMS]()

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
    for (const { config: c } of configs) {
      if (!c.items && c.itemsKey) c.items = (this as any)[c.itemsKey]
      if (!c.items?.length) continue
      const container = c.container()
      if (!container) continue
      const condRef = _findCondMarkerByIndex(container, engineThis(this)[GEA_ID], c.afterCondSlotIndex)
      for (const item of c.items) {
        if (!item) continue
        if (!(item as any)[GEA_RENDERED]) {
          item.render(container)
          if (condRef) {
            const el = engineThis(item)[GEA_ELEMENT]
            if (el && el.parentNode === container) container.insertBefore(el, condRef)
          }
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
      const el = document.getElementById(eng[GEA_ID])
      if (el) {
        eng[GEA_ELEMENT] = el
        ;(el as any)[GEA_DOM_COMPONENT] = this
        ;(this as any)[GEA_RENDERED] = true
        ComponentManager.getInstance().markComponentRendered(this)
        this[GEA_SYNC_UNRENDERED_LIST_ITEMS]()
        this[GEA_ATTACH_BINDINGS]()
        this[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
        this[GEA_INSTANTIATE_CHILD_COMPONENTS]()
        this[GEA_SETUP_EVENT_DIRECTIVES]()
        const setupRefs = (this as any)[GEA_SETUP_REFS]
        if (typeof setupRefs === 'function') setupRefs.call(this)
        this.onAfterRender()
        this.onAfterRenderHooks()
        this[GEA_SYNC_UNRENDERED_LIST_ITEMS]()
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
      // Use symbol dispatch so subclasses/tests overriding [GEA_REQUEST_RENDER] win (same as compiled output).
      this[GEA_REQUEST_RENDER]()
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
    ComponentManager.getInstance().removeComponent(this)

    const eng = engineThis(this)
    if (!eng[GEA_ELEMENT]) {
      // Compiled children created via GEA_CHILD have their HTML baked into the parent
      // template (toString) but may never get mounted (element_ stays null). Find the
      // orphaned DOM node by id so we can remove it.
      const orphan = document.getElementById(eng[GEA_ID])
      if (orphan) {
        ;(orphan as any)[GEA_DOM_COMPONENT] = undefined
        orphan.parentNode?.removeChild(orphan)
      }
    } else {
      ;(eng[GEA_ELEMENT] as any)[GEA_DOM_COMPONENT] = undefined
      if (eng[GEA_ELEMENT].parentNode) eng[GEA_ELEMENT].parentNode.removeChild(eng[GEA_ELEMENT])
    }
    eng[GEA_ELEMENT] = null

    if (internals(this).observerRemovers) {
      internals(this).observerRemovers.forEach((fn) => fn())
      internals(this).observerRemovers = []
    }

    this[GEA_CLEANUP_BINDINGS]()
    this[GEA_TEARDOWN_SELF_LISTENERS]()
    internals(this).childComponents.forEach((child) => child && child.dispose && child.dispose())
    internals(this).childComponents = []
  }

  [GEA_REQUEST_RENDER]() {
    const eng = engineThis(this)
    if (!eng[GEA_ELEMENT] || !eng[GEA_ELEMENT].parentNode) return

    const parent = eng[GEA_ELEMENT].parentNode
    const activeElement = document.activeElement as HTMLElement | null
    const shouldRestoreFocus = Boolean(activeElement && eng[GEA_ELEMENT].contains(activeElement))
    const focusedId = shouldRestoreFocus ? activeElement?.id || null : null
    const restoreRootFocus = Boolean(shouldRestoreFocus && activeElement === eng[GEA_ELEMENT])
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

    this[GEA_CLEANUP_BINDINGS]()
    this[GEA_TEARDOWN_SELF_LISTENERS]()
    if (internals(this).childComponents && internals(this).childComponents.length) {
      internals(this).childComponents.forEach((child) => {
        if (!child) return
        if (child[GEA_COMPILED_CHILD]) {
          ;(child as any)[GEA_RENDERED] = false
          engineThis(child)[GEA_ELEMENT] = null
          this[GEA_RESET_CHILD_TREE](child)
          return
        }
        if (typeof child.dispose == 'function') child.dispose()
      })
      internals(this).childComponents = []
    }

    internals(this).elCache.clear()
    this[GEA_RESET_ELS]?.()

    // Remove old element BEFORE calling template() so that getElementById
    // inside child [GEA_UPDATE_PROPS] won't find stale DOM nodes.
    const placeholder = document.createComment('')
    try {
      if (eng[GEA_ELEMENT].parentNode === parent) {
        eng[GEA_ELEMENT].replaceWith(placeholder)
      } else {
        parent.appendChild(placeholder)
      }
    } catch {
      if (!placeholder.parentNode) parent.appendChild(placeholder)
    }

    const manager = ComponentManager.getInstance()
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

    this[GEA_ATTACH_BINDINGS]()
    this[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
    this[GEA_INSTANTIATE_CHILD_COMPONENTS]()
    this[GEA_SETUP_EVENT_DIRECTIVES]()
    const setupRefsAfter = (this as any)[GEA_SETUP_REFS]
    if (typeof setupRefsAfter === 'function') setupRefsAfter.call(this)

    if (internals(this).listConfigs.length) {
      for (const { store: s, path: p, config: c } of internals(this).listConfigs) {
        if (!c.items && c.itemsKey) c.items = (this as any)[c.itemsKey]
        if (!c.items) continue
        const arr = p.reduce((obj: any, key: string) => obj?.[key], s[GEA_STORE_ROOT]) ?? []
        if (arr.length === c.items.length) continue
        const oldByKey = new Map<string, AnyComponent>()
        for (const item of c.items) {
          if (!item) continue
          if (item[GEA_ITEM_KEY] != null) oldByKey.set(item[GEA_ITEM_KEY]!, item)
        }
        const next = arr.map((data: any) => {
          const key = String(c.key(data))
          const existing = oldByKey.get(key)
          if (existing) {
            existing[GEA_UPDATE_PROPS](c.props(data))
            oldByKey.delete(key)
            return existing
          }
          return this[GEA_CHILD](c.Ctor, c.props(data), key)
        })
        c.items.length = 0
        c.items.push(...next)
        const container = c.container()
        if (container) {
          const condRef = _findCondMarkerByIndex(container, engineThis(this)[GEA_ID], c.afterCondSlotIndex)
          for (const item of next) {
            if (!(item as any)[GEA_RENDERED]) {
              item.render(container)
              if (condRef) {
                const el = engineThis(item)[GEA_ELEMENT]
                if (el && el.parentNode === container) container.insertBefore(el, condRef)
              }
            }
          }
        }
      }
    }

    if (shouldRestoreFocus) {
      const focusTarget =
        (focusedId ? (document.getElementById(focusedId) as HTMLElement | null) || null : null) ||
        (restoreRootFocus ? eng[GEA_ELEMENT] : null)
      if (focusTarget && eng[GEA_ELEMENT].contains(focusTarget) && typeof focusTarget.focus === 'function') {
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

  [GEA_RESET_CHILD_TREE](comp: Component) {
    if (!internals(comp).childComponents?.length) return
    internals(comp).childComponents.forEach((c) => {
      if (!c) return
      ;(c as any)[GEA_RENDERED] = false
      engineThis(c)[GEA_ELEMENT] = null
      this[GEA_RESET_CHILD_TREE](c)
    })
  }

  [GEA_ATTACH_BINDINGS]() {
    this[GEA_CLEANUP_BINDINGS]()
  }

  static _register(ctor: any, compiledTagName?: string) {
    if (!ctor || !ctor.name || ctor[GEA_CTOR_AUTO_REGISTERED]) return
    if (Object.getPrototypeOf(ctor.prototype) === Component.prototype) {
      ctor[GEA_CTOR_AUTO_REGISTERED] = true
      _componentClassesMap.set(ctor.name, ctor)
      const manager = ComponentManager.getInstance()
      const tagName = compiledTagName || manager.generateTagName_(ctor)
      manager.registerComponentClass(ctor, tagName)
    }
  }

  [GEA_INSTANTIATE_CHILD_COMPONENTS]() {
    const eng = engineThis(this)
    if (!eng[GEA_ELEMENT]) return

    const manager = ComponentManager.getInstance()
    const selectors = manager.getComponentSelectors()

    let elements = []
    if (selectors.length > 0) {
      elements = Array.from(eng[GEA_ELEMENT].querySelectorAll(selectors.join(',')))
    }

    elements.forEach((el) => {
      if (el.getAttribute('data-gea-component-mounted')) return
      if ((el as any)[GEA_DOM_COMPILED_CHILD_ROOT]) return

      const ctorName = el.constructor.name
      if (ctorName !== 'HTMLUnknownElement' && ctorName !== 'HTMLElement') return

      const tagName = el.tagName.toLowerCase()

      let Ctor = manager.getComponentConstructor(tagName)

      if (!Ctor && _componentClassesMap) {
        const pascalCase = tagName
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('')
        Ctor = _componentClassesMap.get(pascalCase)
        if (Ctor) {
          manager.registerComponentClass(Ctor, tagName)
        }
      }

      if (!Ctor) return

      const props = this[GEA_EXTRACT_COMPONENT_PROPS](el)
      const itemId = el.getAttribute('data-prop-item-id')
      const child = new (Ctor as new (props: any) => AnyComponent)(props)
      engineThis(child)[GEA_PARENT_COMPONENT] = ((this as any)[GEA_SELF_PROXY] ?? this) as AnyComponent
      internals(this).childComponents.push(child)

      const parent = el.parentElement
      if (!parent) return
      const children = Array.prototype.slice.call(parent.children)
      const index = children.indexOf(el)

      child.render(parent, index)
      if (itemId != null && child.el) {
        const wrapper = document.createElement('div')
        ;(wrapper as any)[GEA_DOM_KEY] = itemId
        parent.replaceChild(wrapper, child.el)
        wrapper.appendChild(child.el)
      }
      child.el && child.el.setAttribute('data-gea-component-root', child.id)
      parent.removeChild(el)
    })
  }

  [GEA_MOUNT_COMPILED_CHILD_COMPONENTS]() {
    const manager = ComponentManager.getInstance()
    const seen = new Set<AnyComponent>()

    const collect = (value: any) => {
      if (!value) return
      if (Array.isArray(value)) {
        value.forEach(collect)
        return
      }
      if (
        value &&
        typeof value === 'object' &&
        value[GEA_COMPILED_CHILD] &&
        sameComponentIdentity(engineThis(value)[GEA_PARENT_COMPONENT], this)
      ) {
        if (!seen.has(value)) {
          seen.add(value)
          if (!internals(this).childComponents.includes(value)) {
            internals(this).childComponents.push(value)
          }
        }
      }
    }

    for (const key of Reflect.ownKeys(this)) {
      collect((this as any)[key])
    }

    seen.forEach((child) => {
      const existing = document.getElementById(child.id)
      if (!existing) return
      if ((child as any)[GEA_RENDERED] && engineThis(child)[GEA_ELEMENT] === existing) return
      ;(existing as any)[GEA_DOM_COMPILED_CHILD_ROOT] = true
      engineThis(child)[GEA_ELEMENT] = existing
      ;(existing as any)[GEA_DOM_COMPONENT] = child
      ;(child as any)[GEA_RENDERED] = true
      manager.markComponentRendered(child)
      child[GEA_ATTACH_BINDINGS]()
      child[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
      child[GEA_INSTANTIATE_CHILD_COMPONENTS]()
      child[GEA_SETUP_EVENT_DIRECTIVES]()
      const childSetupRefs = (child as any)[GEA_SETUP_REFS]
      if (typeof childSetupRefs === 'function') childSetupRefs.call(child)
      child.onAfterRender()
      child.onAfterRenderHooks()
      child[GEA_SYNC_UNRENDERED_LIST_ITEMS]()
      requestAnimationFrame(() => child.onAfterRenderAsync())
    })
  }

  [GEA_CHILD]<T extends AnyComponent>(Ctor: new (props: any) => T, props: any, key?: any): T {
    const child = new Ctor(props)
    engineThis(child)[GEA_PARENT_COMPONENT] = ((this as any)[GEA_SELF_PROXY] ?? this) as AnyComponent
    child[GEA_COMPILED_CHILD] = true
    if (key !== undefined) {
      child[GEA_ITEM_KEY] = String(key)
    }
    if (!internals(this).childComponents.includes(child)) {
      internals(this).childComponents.push(child)
    }
    return child
  }

  [GEA_EL](suffix: string): HTMLElement | null {
    const eng = engineThis(this)
    let el = internals(this).elCache.get(suffix) ?? null
    if (!el || !el.isConnected) {
      const id = eng[GEA_ID] + '-' + suffix
      const root = eng[GEA_ELEMENT]
      const bySelector = (r: HTMLElement) => r.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
      // Prefer lookup inside the component root when the tree is not yet connected (getElementById
      // only searches the document). When connected, fall back to subtree query if id lookup misses.
      if (root) {
        el = root.isConnected ? (document.getElementById(id) ?? bySelector(root)) : bySelector(root)
      } else {
        el = document.getElementById(id)
      }
      if (el) internals(this).elCache.set(suffix, el)
      else internals(this).elCache.delete(suffix)
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
    if (!container || !(this as any)[GEA_RENDERED]) return
    for (const item of items) {
      if (!(item as any)[GEA_RENDERED]) {
        if (!internals(this).childComponents.includes(item)) {
          internals(this).childComponents.push(item)
        }
        item.render(container)
      }
    }

    const ordered: Node[] = []
    for (const item of items) {
      let el: HTMLElement | null = engineThis(item)[GEA_ELEMENT]
      if (!el) continue
      while (el.parentElement && el.parentElement !== container) el = el.parentElement
      ordered.push(el)
    }
    if (ordered.length === 0) return

    const condRef = _findCondMarkerByIndex(container, engineThis(this)[GEA_ID], afterCondSlotIndex)
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
    const oldByKey = new Map<string, AnyComponent>()
    for (const item of oldItems) {
      if (!item) continue
      if (item[GEA_ITEM_KEY] != null) oldByKey.set(item[GEA_ITEM_KEY]!, item)
    }

    // Backing `_*Items` can be a stale [] while keyed rows are already mounted (getter-backed
    // lists refreshed via __refreshList). Recover instances from the DOM before deciding to
    // clear the container; otherwise we wipe every row (DOM stability / foreign attributes).
    if (oldByKey.size === 0 && container) {
      for (let ch = container.firstElementChild; ch; ch = ch.nextElementSibling) {
        const comp = (ch as any)[GEA_DOM_COMPONENT] as AnyComponent | undefined
        if (!comp) continue
        let c: any = comp
        while (c) {
          if (c[GEA_ITEM_KEY] != null) {
            oldByKey.set(c[GEA_ITEM_KEY]!, c)
            break
          }
          c = engineThis(c)[GEA_PARENT_COMPONENT]
        }
      }
    }

    // First reconcile from an empty component list: the container may still hold static
    // template HTML for the same map rows; rendering would append duplicate rows.
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
        engineThis(transferred)[GEA_PARENT_COMPONENT] = this
        if (!internals(this).childComponents.includes(transferred)) {
          internals(this).childComponents.push(transferred)
        }
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
        if (!engineThis(item)?.[GEA_ELEMENT]) continue
        let el: HTMLElement | null = engineThis(item)[GEA_ELEMENT]
        while (el.parentElement && el.parentElement !== container) el = el.parentElement
        if (el && el.parentElement === container) rootSet.add(el)
      }
      if (rootSet.size === next.length && container.childElementCount > next.length) {
        for (let ch: ChildNode | null = container.firstChild; ch; ) {
          const nx = ch.nextSibling
          if (ch.nodeType === 1 && !rootSet.has(ch as HTMLElement)) {
            const comp = (ch as any)[GEA_DOM_COMPONENT] as AnyComponent | undefined
            // Strip duplicate map rows: the DOM node may host a child component (e.g. Card)
            // while the list key lives on the parent (e.g. ProductCard). Static siblings like
            // CommentCreate have no keyed ancestor up to the list owner.
            let c: any = comp
            let keyedAncestor: AnyComponent | undefined
            while (c) {
              if (c[GEA_ITEM_KEY] != null) {
                keyedAncestor = c
                break
              }
              c = engineThis(c)[GEA_PARENT_COMPONENT]
            }
            if (keyedAncestor) {
              keyedAncestor.dispose?.()
              ;(ch as HTMLElement).remove()
            }
          }
          ch = nx
        }
      }
    }

    // Clean up __childComponents
    internals(this).childComponents = internals(this).childComponents.filter(
      (child) => !oldItems.includes(child) || next.includes(child),
    )

    return next
  }

  [GEA_OBSERVE_LIST](
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
    },
  ): void {
    // Track list configs for re-sync when the root re-renders
    internals(this).listConfigs.push({ store, path, config })

    this[GEA_OBSERVE](store, path, (_value, changes) => {
      // Lazily resolve items from the instance property if not yet available ([] is truthy — still sync)
      if ((!config.items || config.items.length === 0) && config.itemsKey) {
        config.items = (this as any)[config.itemsKey]
      }
      if (!config.items) return
      if (config[GEA_LIST_CONFIG_REFRESHING]) return
      config[GEA_LIST_CONFIG_REFRESHING] = true
      try {
        const storeData = store[GEA_STORE_ROOT]
        const arr = path.reduce((obj: any, key: string) => obj?.[key], storeData) ?? []

        if (changes.every((c: any) => c.isArrayItemPropUpdate)) {
          // Item property update (e.g. todo.done toggled)
          for (const c of changes) {
            const item = config.items[c.arrayIndex]
            if (item) {
              item[GEA_UPDATE_PROPS](config.props(arr[c.arrayIndex], c.arrayIndex))
            }
          }
        } else if (
          changes.length === 1 &&
          changes[0].type === 'append' &&
          changes[0].pathParts.length === path.length &&
          changes[0].pathParts.every((p: string, i: number) => p === path[i])
        ) {
          // Append (push)
          const { start, count } = changes[0]
          const container = config.container()
          const condRef = container
            ? _findCondMarkerByIndex(container, engineThis(this)[GEA_ID], config.afterCondSlotIndex)
            : null
          for (let i = 0; i < count; i++) {
            const data = arr[start + i]
            const item = this[GEA_CHILD](config.Ctor, config.props(data, start + i), config.key(data, start + i))
            config.items.push(item)
            if ((this as any)[GEA_RENDERED] && container) {
              item.render(container)
              if (condRef) {
                const el = engineThis(item)[GEA_ELEMENT]
                if (el && el.parentNode === container) container.insertBefore(el, condRef)
              }
            }
          }
        } else {
          // Full replace (filter, sort, reassign)
          const newItems = this[GEA_RECONCILE_LIST](
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
    })
  }

  /**
   * Force-reconcile a list config by re-reading the getter value through the
   * store proxy.  Used by compiler-generated delegates when a getter-backed
   * array map's underlying dependency changes (e.g. activePlaylistId changes
   * causing filteredTracks to return different items).
   */
  [GEA_REFRESH_LIST](pathKey: string): void {
    const configs = internals(this).listConfigs
    if (!configs?.length) return
    for (const { store: s, path: p, config: c } of configs) {
      if (p.join('.') !== pathKey) continue
      if ((!c.items || c.items.length === 0) && c.itemsKey) {
        c.items = (this as any)[c.itemsKey]
      }
      if (!c.items) continue
      if (c[GEA_LIST_CONFIG_REFRESHING]) return
      c[GEA_LIST_CONFIG_REFRESHING] = true
      try {
        // Read through the proxy (not GEA_STORE_ROOT) so getters are evaluated
        const arr = p.reduce((obj: any, key: string) => obj?.[key], s) ?? []
        const newItems = this[GEA_RECONCILE_LIST](
          c.items,
          arr,
          c.container(),
          c.Ctor,
          c.props,
          c.key,
          c.afterCondSlotIndex,
        )
        c.items.length = 0
        c.items.push(...newItems)
        c.onchange?.()
      } finally {
        c[GEA_LIST_CONFIG_REFRESHING] = false
      }
    }
  }

  [GEA_SWAP_CHILD](markerId: string, newChild: Component | false | null | undefined) {
    const eng = engineThis(this)
    const marker = document.getElementById(eng[GEA_ID] + '-' + markerId)
    if (!marker) return

    const oldEl = marker.nextElementSibling as HTMLElement | null

    if (newChild && (newChild as any)[GEA_RENDERED] && engineThis(newChild)[GEA_ELEMENT] === oldEl) return

    if (oldEl && oldEl.tagName !== 'TEMPLATE') {
      const oldChild = internals(this).childComponents.find((c) => engineThis(c)[GEA_ELEMENT] === oldEl)
      if (oldChild) {
        ;(oldChild as any)[GEA_RENDERED] = false
        engineThis(oldChild)[GEA_ELEMENT] = null
      }
      oldEl.remove()
    }

    if (!newChild) return

    const html = String(newChild.template(newChild.props)).trim()
    marker.insertAdjacentHTML('afterend', html)
    const newEl = marker.nextElementSibling as HTMLElement | null
    if (!newEl) return

    engineThis(newChild)[GEA_ELEMENT] = newEl
    ;(newChild as any)[GEA_RENDERED] = true
    if (!internals(this).childComponents.includes(newChild)) {
      internals(this).childComponents.push(newChild)
    }
    const mgr = ComponentManager.getInstance()
    mgr.markComponentRendered(newChild)
    newChild[GEA_ATTACH_BINDINGS]()
    newChild[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
    newChild[GEA_INSTANTIATE_CHILD_COMPONENTS]()
    newChild[GEA_SETUP_EVENT_DIRECTIVES]()
    newChild.onAfterRender()
    newChild.onAfterRenderHooks()
  }

  [GEA_CLEANUP_BINDINGS]() {
    internals(this).bindings = []
  }

  [GEA_SETUP_EVENT_DIRECTIVES]() {
    return
  }

  [GEA_TEARDOWN_SELF_LISTENERS]() {
    internals(this).selfListeners.forEach((remove) => {
      if (typeof remove == 'function') remove()
    })
    internals(this).selfListeners = []
  }

  [GEA_EXTRACT_COMPONENT_PROPS](el) {
    // Prefer JS object props set by createXItem for component-root map items
    if ((el as any)[GEA_DOM_PROPS]) {
      const jsProps = (el as any)[GEA_DOM_PROPS]
      delete (el as any)[GEA_DOM_PROPS]
      return jsProps
    }

    const props = {}
    if (!el.getAttributeNames) return props

    el.getAttributeNames()
      .filter((name) => name.startsWith('data-prop-'))
      .forEach((name) => {
        const value = el.getAttribute(name)
        const propName = this[GEA_NORMALIZE_PROP_NAME](name.slice(10))

        if (internals(this).geaPropBindings && value && value.startsWith(GEA_PROP_BINDING_ATTR_PREFIX)) {
          const propValue = internals(this).geaPropBindings.get(value)
          if (propValue === undefined) {
            console.warn(`[gea] Prop binding not found for ${value} on component ${this.constructor.name}`)
          }
          props[propName] = propValue
        } else {
          props[propName] = this[GEA_COERCE_STATIC_PROP_VALUE](value)
        }

        el.removeAttribute(name)
      })

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

  [GEA_REGISTER_MAP](
    idx: number,
    containerProp: string,
    getContainer: () => HTMLElement | null,
    getItems: () => any[],
    createItem: (item: any) => HTMLElement,
    keyProp?: string | ((item: any) => string),
  ): void {
    if (!internals(this).geaMaps) internals(this).geaMaps = {}
    internals(this).geaMaps[idx] = {
      containerProp,
      getContainer,
      getItems,
      createItem,
      container: null as HTMLElement | null,
      keyProp,
    }
  }

  [GEA_SYNC_MAP](idx: number): void {
    if (!(this as any)[GEA_RENDERED]) return
    const map = internals(this).geaMaps?.[idx]
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
        if (
          n.nodeType === 1 &&
          ((n as any)[GEA_DOM_KEY] != null || (n as HTMLElement).hasAttribute('data-gea-item-id'))
        ) {
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
              ((child as any)[GEA_DOM_KEY] != null || child.hasAttribute('data-gea-item-id')) &&
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
            // An empty comment is the map's own end-of-list marker. If we hit
            // it before any conditional-slot comment, the map lives at the
            // container level (sibling of the cond slot), not inside one.
            if (s.nodeType === 8 && !(s as Comment).data) break
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
    this[GEA_SYNC_ITEMS](container, normalizedItems, map.createItem, map.keyProp)
  }

  [GEA_SYNC_ITEMS](
    container: HTMLElement,
    items: any[],
    createItemFn: (item: any, index?: number) => HTMLElement,
    keyProp?: string | ((item: any, index?: number) => string),
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
    let prev: any[] | undefined = c[GEA_MAP_CONFIG_PREV]
    if (!prev) {
      prev = []
      for (let n: ChildNode | null = container.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) {
          const aid = (n as any)[GEA_DOM_KEY] ?? (n as HTMLElement).getAttribute('data-gea-item-id')
          if (aid != null) prev.push(aid)
        } else if (n.nodeType === 8 && !(n as any).data) break
      }
      c[GEA_MAP_CONFIG_COUNT] = prev.length
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
        // multiple observers trigger [GEA_SYNC_MAP] in the same flush.
        let child: ChildNode | null = container.firstChild
        for (let j = 0; j < items.length; j++) {
          while (
            child &&
            (child.nodeType !== 1 ||
              ((child as any)[GEA_DOM_KEY] == null && !(child as HTMLElement).hasAttribute?.('data-gea-item-id')))
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
            Component[GEA_SYNC_VALUE_PROPS](oldEl)
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
          if ((newEl as any)[GEA_DOM_ITEM] !== undefined) (oldEl as any)[GEA_DOM_ITEM] = (newEl as any)[GEA_DOM_ITEM]
          if ((newEl as any)[GEA_DOM_KEY] !== undefined) (oldEl as any)[GEA_DOM_KEY] = (newEl as any)[GEA_DOM_KEY]
        }
        c[GEA_MAP_CONFIG_PREV] = items.slice()
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
        Component[GEA_SYNC_VALUE_PROPS](frag)
        let marker: ChildNode | null = null
        for (let sc: ChildNode | null = container.firstChild; sc; sc = sc.nextSibling) {
          if (sc.nodeType === 8 && !(sc as any).data) {
            marker = sc
            break
          }
        }
        container.insertBefore(frag, marker)
        c[GEA_MAP_CONFIG_PREV] = items.slice()
        c[GEA_MAP_CONFIG_COUNT] = items.length
        return
      }
    }

    if (items.length < prev.length) {
      const newSet = new Set<string>()
      for (let j = 0; j < items.length; j++) newSet.add(itemKey(items[j], j))
      const removals: ChildNode[] = []
      for (let sc: ChildNode | null = container.firstChild; sc; sc = sc.nextSibling) {
        if (sc.nodeType === 1) {
          const aid = (sc as any)[GEA_DOM_KEY] ?? (sc as HTMLElement).getAttribute('data-gea-item-id')
          if (aid != null && !newSet.has(aid)) removals.push(sc)
        } else if (sc.nodeType === 8 && !(sc as any).data) break
      }
      if (removals.length === prev.length - items.length) {
        for (let j = 0; j < removals.length; j++) container.removeChild(removals[j])
        c[GEA_MAP_CONFIG_PREV] = items.slice()
        c[GEA_MAP_CONFIG_COUNT] = items.length
        return
      }
    }

    c[GEA_MAP_CONFIG_PREV] = items.slice()
    let oldCount: number | undefined = c[GEA_MAP_CONFIG_COUNT]
    // Map count can be 0 while the DOM still has non-map nodes (e.g. a ternary empty-state
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
    Component[GEA_SYNC_VALUE_PROPS](fragment)
    container.insertBefore(fragment, container.firstChild)
    c[GEA_MAP_CONFIG_PREV] = items.slice()
    c[GEA_MAP_CONFIG_COUNT] = items.length
  }

  [GEA_CLONE_ITEM](
    container: HTMLElement,
    item: any,
    renderFn: (item: any) => string,
    bindingId?: string,
    itemIdProp?: string,
    patches?: any[],
  ): HTMLElement {
    const c = container as any
    const idProp = itemIdProp || 'id'
    if (!c[GEA_MAP_CONFIG_TPL]) {
      try {
        const tw = container.cloneNode(false) as HTMLElement
        tw.innerHTML = renderFn({ [idProp]: 0, label: '' })
        c[GEA_MAP_CONFIG_TPL] = tw.firstElementChild
      } catch {
        // Ignore template precomputation failures and fall back to full rendering below.
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
    const itemKey = String(raw != null ? raw : item)
    ;(el as any)[GEA_DOM_KEY] = itemKey
    ;(el as any)[GEA_DOM_ITEM] = item
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
    Component[GEA_SYNC_VALUE_PROPS](el)
    return el
  }

  [GEA_REGISTER_COND](
    idx: number,
    slotId: string,
    getCond: () => boolean,
    getTruthyHtml: (() => string) | null,
    getFalsyHtml: (() => string) | null,
  ): void {
    if (!internals(this).geaConds) internals(this).geaConds = {}
    internals(this).geaConds[idx] = { slotId, getCond, getTruthyHtml, getFalsyHtml }
    if (!(this as any)[GEA_RENDERED]) {
      if (!internals(this).condPatchPrev) internals(this).condPatchPrev = {}
      try {
        internals(this).condPatchPrev[idx] = !!getCond()
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
    const conf = internals(this).geaConds?.[idx]
    if (!conf) return false
    let cond: boolean
    try {
      cond = !!conf.getCond()
    } catch {
      return false
    }
    let condPatchPrev = internals(this).condPatchPrev
    if (!condPatchPrev) internals(this).condPatchPrev = condPatchPrev = {}
    const prev = condPatchPrev[idx]
    const needsPatch = cond !== prev
    const eng = engineThis(this)
    const root = eng[GEA_ELEMENT] || document.getElementById(eng[GEA_ID])
    if (!root) return false
    const markerText = eng[GEA_ID] + '-' + conf.slotId
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
    // `data-gea-item-id` here removed legitimate keyed list rows (todo, ecommerce, playground) that
    // follow conditional markers in other layouts.
    const stripTrailingKeyedRowsAfterSlot = () => {
      let node: ChildNode | null = endMarker.nextSibling
      while (node && node.nodeType === 1) {
        const el = node as HTMLElement
        const next = node.nextSibling
        if (el.hasAttribute('data-email-id')) {
          for (const child of internals(this).childComponents) {
            if (
              child[GEA_COMPILED_CHILD] &&
              engineThis(child)[GEA_ELEMENT] &&
              (engineThis(child)[GEA_ELEMENT] === el || el.contains(engineThis(child)[GEA_ELEMENT]))
            ) {
              child.dispose()
              internals(this).childComponents = internals(this).childComponents.filter((c) => c !== child)
              break
            }
          }
          try {
            if (el.parentNode) el.remove()
          } catch {
            /* detached by dispose */
          }
          node = next
          continue
        }
        break
      }
    }

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
      // vs list observers does not wipe keyed rows (mobile-showcase gesture log).
      if (html === '') {
        // Falsy branch with '' (e.g. `&&` without else compiled to empty): must remove keyed
        // .map() rows too — otherwise a previous truthy branch leaves data-gea-item-id nodes and
        // the next truthy branch injects again (duplicate OptionSteps / flight-checkin e2e).
        // Only do aggressive removal on real true→false transitions; initial patches
        // (prev === undefined) must preserve keyed rows the template already placed.
        if (!cond && prev === true) {
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
        let node: ChildNode | null = marker.nextSibling
        while (node && node !== endMarker) {
          const next: ChildNode | null = node.nextSibling
          if (!node.parentNode) break
          try {
            if (node.nodeType !== 1) {
              node.remove()
            } else {
              const el = node as HTMLElement
              // Compiled .map() rows carry data-gea-item-id; we normally preserve those for
              // list-only empty reinjection (mobile-showcase). Email list rows also set
              // data-email-id on the row root — remove those so truthy-branch empty-state HTML
              // that compiles to '' does not leave stale rows in the DOM.
              if (el.hasAttribute('data-email-id')) {
                node.remove()
              } else if ((node as any)[GEA_DOM_KEY] == null && !el.hasAttribute?.('data-gea-item-id')) {
                node.remove()
              }
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
        Component[GEA_SYNC_VALUE_PROPS](tpl.content)
        parent.insertBefore(tpl.content, endMarker)
      }
    }

    if (needsPatch) {
      // Only dispose on real branch transitions. Initial patch (prev === undefined) must not
      // dispose list rows or empty-state UI — otherwise ecommerce / email first paint loses DOM.
      if (!cond) {
        if (prev === true) {
          const disposed = new Set<AnyComponent>()
          let node: ChildNode | null = marker.nextSibling
          while (node && node !== endMarker) {
            if (node.nodeType === 1) {
              const el = node as HTMLElement
              for (const child of internals(this).childComponents) {
                if (
                  child[GEA_COMPILED_CHILD] &&
                  engineThis(child)[GEA_ELEMENT] &&
                  (engineThis(child)[GEA_ELEMENT] === el || el.contains(engineThis(child)[GEA_ELEMENT]))
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
            internals(this).childComponents = internals(this).childComponents.filter((c) => !disposed.has(c))
          }
        }
      } else if (prev === false) {
        // Products → empty: compiled map rows must be disposed before replaceSlotContent.
        const disposedTruthy = new Set<AnyComponent>()
        let n: ChildNode | null = marker.nextSibling
        while (n && n !== endMarker) {
          if (n.nodeType === 1) {
            const el = n as HTMLElement
            for (const child of internals(this).childComponents) {
              if (
                child[GEA_COMPILED_CHILD] &&
                engineThis(child)[GEA_ELEMENT] &&
                (engineThis(child)[GEA_ELEMENT] === el || el.contains(engineThis(child)[GEA_ELEMENT]))
              ) {
                disposedTruthy.add(child)
              }
            }
          }
          n = n.nextSibling
        }
        for (const child of disposedTruthy) {
          child.dispose()
          for (const key of Object.keys(this)) {
            if ((this as any)[key] === child) {
              ;(this as any)[key] = null
              break
            }
          }
        }
        if (disposedTruthy.size > 0) {
          internals(this).childComponents = internals(this).childComponents.filter((c) => !disposedTruthy.has(c))
        }
      }
      replaceSlotContent(cond ? conf.getTruthyHtml : conf.getFalsyHtml)
      stripTrailingKeyedRowsAfterSlot()
      if (cond) {
        this[GEA_MOUNT_COMPILED_CHILD_COMPONENTS]()
        this[GEA_INSTANTIATE_CHILD_COMPONENTS]()
        this[GEA_SETUP_EVENT_DIRECTIVES]()
        Component[GEA_SYNC_AUTOFOCUS](marker, endMarker)
      }
      condPatchPrev[idx] = cond
    } else if (cond && conf.getTruthyHtml) {
      const existingNode = marker.nextSibling as HTMLElement | null
      if (existingNode && (existingNode as Node) !== endMarker && existingNode.nodeType === 1) {
        if ((existingNode as any)[GEA_DOM_COMPILED_CHILD_ROOT]) return needsPatch
        // Do not GEA_PATCH_NODE over a subtree owned by a compiled child — static HTML from
        // getTruthyHtml() omits dynamic .map() rows; index-based patch duplicates nodes (e.g. two
        // Continue buttons) before GEA_DOM_COMPILED_CHILD_ROOT is set on the child root.
        for (const child of internals(this).childComponents) {
          if (
            child[GEA_COMPILED_CHILD] &&
            engineThis(child)[GEA_ELEMENT] &&
            (engineThis(child)[GEA_ELEMENT] === existingNode || existingNode.contains(engineThis(child)[GEA_ELEMENT]))
          ) {
            return needsPatch
          }
        }
        const newHtml = conf.getTruthyHtml()
        const tpl = document.createElement('template')
        tpl.innerHTML = newHtml
        const newEl = tpl.content.firstElementChild
        if (newEl) {
          Component[GEA_PATCH_NODE](existingNode, newEl)
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
          if (!(existing as any)[GEA_DOM_COMPILED_CHILD_ROOT]) {
            Component[GEA_PATCH_NODE](existing as Element, desired as Element)
          }
        } else if (existing.nodeType === 3 && desired.nodeType === 3) {
          if (existing.textContent !== desired.textContent) existing.textContent = desired.textContent
        }
        existing = existing.nextSibling
        idx++
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
    const manager = ComponentManager.getInstance()
    manager.registerComponentClass(this, tagName)
    if (_componentClassesMap) {
      _componentClassesMap.set(this.name, this)
    }
  }
}

Object.defineProperty(Component, GEA_COMPONENT_CLASSES, {
  get() {
    return _componentClassesMap
  },
  configurable: true,
  enumerable: false,
})

Object.defineProperty(Component.prototype, GEA_MAPS, {
  get(this: Component) {
    return internals(this).geaMaps
  },
  set(this: Component, v: any) {
    internals(this).geaMaps = v
  },
  configurable: true,
  enumerable: false,
})
Object.defineProperty(Component.prototype, GEA_CONDS, {
  get(this: Component) {
    return internals(this).geaConds
  },
  set(this: Component, v: any) {
    internals(this).geaConds = v
  },
  configurable: true,
  enumerable: false,
})
Object.defineProperty(Component.prototype, GEA_EL_CACHE, {
  get(this: Component) {
    return internals(this).elCache
  },
  set(this: Component, v: Map<string, HTMLElement>) {
    internals(this).elCache = v
  },
  configurable: true,
  enumerable: false,
})

Object.defineProperty(Component.prototype, GEA_CHILD_COMPONENTS, {
  get(this: Component) {
    return internals(this).childComponents
  },
  set(this: Component, v: AnyComponent[]) {
    internals(this).childComponents = v
  },
  configurable: true,
  enumerable: false,
})
Object.defineProperty(Component.prototype, GEA_OBSERVER_REMOVERS, {
  get(this: Component) {
    return internals(this).observerRemovers
  },
  set(this: Component, v: Array<() => void>) {
    internals(this).observerRemovers = v
  },
  configurable: true,
  enumerable: false,
})
Object.defineProperty(Component.prototype, GEA_COMPILED_CHILD, {
  get(this: Component) {
    return internals(this).geaCompiledChild
  },
  set(this: Component, v: boolean | undefined) {
    internals(this).geaCompiledChild = v
  },
  configurable: true,
  enumerable: false,
})
Object.defineProperty(Component.prototype, GEA_ITEM_KEY, {
  get(this: Component) {
    return internals(this).geaItemKey
  },
  set(this: Component, v: string | undefined) {
    internals(this).geaItemKey = v
  },
  configurable: true,
  enumerable: false,
})
Object.defineProperty(Component.prototype, GEA_SELF_LISTENERS, {
  get(this: Component) {
    return internals(this).selfListeners
  },
  set(this: Component, v: Array<() => void>) {
    internals(this).selfListeners = v
  },
  configurable: true,
  enumerable: false,
})
Object.defineProperty(Component.prototype, GEA_PROP_BINDINGS, {
  get(this: Component) {
    return internals(this).geaPropBindings
  },
  set(this: Component, v: Map<string, any>) {
    internals(this).geaPropBindings = v
  },
  configurable: true,
  enumerable: false,
})
Object.defineProperty(Component.prototype, GEA_RESET_ELS, {
  get(this: Component) {
    return internals(this).resetEls
  },
  set(this: Component, v: (() => void) | undefined) {
    internals(this).resetEls = v
  },
  configurable: true,
  enumerable: false,
})
