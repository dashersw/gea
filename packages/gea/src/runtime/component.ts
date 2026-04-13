/**
 * Closure-compiled Component — slim shell.
 *
 * Public surface: `id`, `el` (getter), `rendered`, `props` (getter),
 * `render(parent)`, `dispose()`, `$(sel)`, `$$(sel)`, `created()`,
 * `onAfterRender()`, `onAfterRenderAsync()`.
 *
 * The compiler emits a `[GEA_CREATE_TEMPLATE](disposer)` method on each user
 * subclass and calls `[GEA_SET_PROPS](thunks)` when installing props.
 */

import getUid from '../uid'
import { GEA_CREATE_TEMPLATE, GEA_DOM_COMPONENT, GEA_ELEMENT, GEA_ON_PROP_CHANGE } from './symbols'
import { GEA_CREATED_CALLED, GEA_DISPOSER, GEA_SET_PROPS } from './internal-symbols'
import { createDisposer, type Disposer } from './disposer'
import { Store } from '../store'

type PropThunks = Record<string, () => any>
const GEA_COMPONENT_ID = Symbol()
const GEA_LAST_PROP_VALUES = Symbol()

export class Component<P extends Record<string, any> = Record<string, any>> extends Store {
  rendered = false

  // `props` must be a plain writable property so user code that does
  // `this.props = { ... }` doesn't throw. The prop protocol overwrites it.
  props: P = {} as P;

  [GEA_ELEMENT] = null as HTMLElement | null;
  [GEA_DISPOSER] = createDisposer() as Disposer;
  [GEA_CREATED_CALLED] = false

  get id(): string {
    return ((this as any)[GEA_COMPONENT_ID] ??= getUid())
  }

  set id(value: string) {
    ;(this as any)[GEA_COMPONENT_ID] = value
  }

  get el(): HTMLElement | null {
    return this[GEA_ELEMENT] ?? null
  }

  /** Compiler-facing: install prop thunks. */
  [GEA_SET_PROPS](thunks: PropThunks): void {
    const createdCalled = this[GEA_CREATED_CALLED]
    const notifyPropChange = createdCalled ? (this as any)[GEA_ON_PROP_CHANGE] : undefined
    const prevValues: Record<string, any> | undefined =
      typeof notifyPropChange === 'function' ? (this as any)[GEA_LAST_PROP_VALUES] : undefined
    // Materialize live-getter object so `this.props.x` always re-reads the thunk.
    const out: Record<string, any> = {}
    for (const k in thunks) {
      Object.defineProperty(out, k, {
        enumerable: true,
        configurable: true,
        get: () => thunks[k](),
      })
    }
    // Memoize `children` ONLY when the thunk returns a DOM Node — we can't
    // re-create DOM trees on every read without breaking identity. For primitive
    // (string/number/boolean) children the thunk stays live so reactive getters
    // pick up changes (e.g. `{inCart ? 'In Cart' : 'Add to Cart'}`).
    if (typeof thunks.children === 'function') {
      let cached: any = undefined
      let cacheNode = false
      Object.defineProperty(out, 'children', {
        enumerable: true,
        configurable: true,
        get: () => {
          if (cacheNode) return cached
          const v = thunks.children()
          if (v && typeof v.nodeType === 'number') {
            cached = v
            cacheNode = true
          }
          return v
        },
      })
    }
    this.props = out as P
    const nextValues: Record<string, any> = {}
    for (const key in thunks) nextValues[key] = this.props?.[key]
    ;(this as any)[GEA_LAST_PROP_VALUES] = nextValues
    if (!createdCalled) {
      this[GEA_CREATED_CALLED] = true
      if (this.created !== Component.prototype.created) this.created(this.props)
    } else {
      if (typeof notifyPropChange === 'function') {
        for (const key in thunks) {
          const prev = prevValues?.[key]
          const next = this.props?.[key]
          if (next !== prev || (prev !== null && typeof prev === 'object')) notifyPropChange.call(this, key, next)
        }
      }
    }
  }

  /** Compiler-emitted template builder. Default returns an empty fragment. */
  [GEA_CREATE_TEMPLATE](_disposer: Disposer): Node {
    return document.createDocumentFragment()
  }

  render(parent: Node, _index?: number): void {
    // Fire created() for root-level components that were constructed without
    // props being installed (e.g. `new App(); app.render(root)`).
    if (!this[GEA_CREATED_CALLED]) {
      this[GEA_CREATED_CALLED] = true
      if (this.created !== Component.prototype.created) this.created(this.props)
    }
    let node = this[GEA_CREATE_TEMPLATE](this[GEA_DISPOSER])
    if (node == null) node = document.createComment('')
    // Handle non-Node returns (e.g. user returns a string, number, or nested
    // array). Wrap in a text node so render doesn't throw. Arrays get flattened.
    if (typeof (node as any).nodeType !== 'number') {
      if (Array.isArray(node)) {
        const frag = document.createDocumentFragment()
        for (const n of node) {
          if (n == null) continue
          if (typeof (n as any).nodeType === 'number') frag.appendChild(n as Node)
          else frag.appendChild(document.createTextNode(String(n)))
        }
        node = frag
      } else {
        node = document.createTextNode(String(node))
      }
    }
    parent.appendChild(node)
    // nodeType-based check: 11 = DocumentFragment, 1 = Element. Avoids cross-realm
    // `instanceof` issues (jsdom vs vm globals).
    if (node.nodeType === 11) {
      this[GEA_ELEMENT] = ((parent as Element).lastElementChild as HTMLElement | null) ?? null
    } else if (node.nodeType === 1) {
      this[GEA_ELEMENT] = node as HTMLElement
    }
    // Back-reference from DOM node to component instance — useful for tests
    // and devtool integrations that traverse from an element to its component.
    const el = this[GEA_ELEMENT] as any
    if (el) el[GEA_DOM_COMPONENT] = this
    this.rendered = true
    this.onAfterRender()
  }

  /** User hook — called after first DOM insertion. */
  onAfterRender(): void {
    /* no-op */
  }

  /** User hook — compiler schedules this on the next frame when declared. */
  onAfterRenderAsync(): void {
    /* no-op */
  }

  /** User hook — called once during construction (compiler emits the call). */
  created(_props?: P): void {
    /* no-op */
  }

  /**
   * Tear down the component: dispose all reactive subscriptions, remove the
   * root element from the DOM, and null the element reference.
   */
  dispose(): void {
    this[GEA_DISPOSER].dispose()
    const e = this[GEA_ELEMENT] as HTMLElement | null
    if (e && e.parentNode) e.parentNode.removeChild(e)
    this[GEA_ELEMENT] = null
  }

  $(sel: string): Element | null {
    const e = this[GEA_ELEMENT] as HTMLElement | null
    return e ? e.querySelector(sel) : null
  }

  $$(sel: string): Element[] {
    const e = this[GEA_ELEMENT] as HTMLElement | null
    return e ? Array.from(e.querySelectorAll(sel)) : []
  }
}

/** Default export for helpers importing `{ default: Component }`. */
export default Component
