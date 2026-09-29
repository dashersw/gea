import { GEA_CREATE_TEMPLATE, GEA_DOM_COMPONENT, GEA_ELEMENT, GEA_ON_PROP_CHANGE } from './symbols'
import { GEA_CREATED_CALLED, GEA_DISPOSER, GEA_SET_PROPS } from './internal-symbols'
import { createDisposer, type Disposer } from './disposer'
import { getComponentId } from './component-id'
import type { Renderable } from './renderable'

/**
 * One thunk per prop of `P`, each returning that prop's own type.
 *
 * Generic rather than a flat dictionary so a component's props keep their
 * declared types all the way through `GEA_SET_PROPS` — the compiler emits one
 * thunk per JSX attribute, so the mapping is exact at every instantiation.
 *
 * `children` is intersected in separately (not folded into the mapped part)
 * because JSX always permits a childless invocation regardless of whether
 * `P` declares a `children` field — the compiler attaches a children thunk
 * whenever the call site has JSX children, independent of `P`'s own shape.
 */
type PropThunks<P> = { [K in keyof P]: () => P[K] } & { children?: () => Renderable }
const GEA_COMPONENT_ID: unique symbol = Symbol()
const GEA_LAST_PROP_VALUES: unique symbol = Symbol()

export class CompiledComponent<P extends Record<string, any> = Record<string, any>> {
  rendered = false
  props: P = {} as P;

  [GEA_ELEMENT] = null as HTMLElement | null;
  [GEA_DISPOSER] = createDisposer() as Disposer;
  [GEA_CREATED_CALLED] = false;
  [GEA_COMPONENT_ID]?: string;
  [GEA_LAST_PROP_VALUES]?: Partial<P>;
  [GEA_ON_PROP_CHANGE]?(key: string, next: unknown): void

  get id(): string {
    return (this[GEA_COMPONENT_ID] ??= getComponentId())
  }

  set id(value: string) {
    this[GEA_COMPONENT_ID] = value
  }

  get el(): HTMLElement | null {
    return this[GEA_ELEMENT] ?? null
  }

  [GEA_SET_PROPS](thunks: PropThunks<P>): void {
    const createdCalled = this[GEA_CREATED_CALLED]
    const notifyPropChange = createdCalled ? this[GEA_ON_PROP_CHANGE] : undefined
    const prevValues: Partial<P> | undefined =
      typeof notifyPropChange === 'function' ? this[GEA_LAST_PROP_VALUES] : undefined
    // `out` is `P` under construction — every key comes from `PropThunks<P>`
    // (i.e. `keyof P`) and every getter yields `P[K]`, so `Partial<P>` is the
    // exact in-progress type; the final `as P` merely asserts completion.
    const out: Partial<P> = {}
    for (const k in thunks) {
      Object.defineProperty(out, k, {
        enumerable: true,
        configurable: true,
        get: () => thunks[k](),
      })
    }
    this.props = out as P
    const nextValues: Partial<P> = {}
    for (const key in thunks) nextValues[key as keyof P] = this.props?.[key as keyof P]
    this[GEA_LAST_PROP_VALUES] = nextValues
    if (!createdCalled) {
      this[GEA_CREATED_CALLED] = true
      if (this.created !== CompiledComponent.prototype.created) this.created(this.props)
    } else if (typeof notifyPropChange === 'function') {
      for (const key in thunks) {
        const prev = prevValues?.[key as keyof P]
        const next = this.props?.[key as keyof P]
        if (next !== prev || (prev !== null && typeof prev === 'object')) notifyPropChange.call(this, key, next)
      }
    }
  }

  [GEA_CREATE_TEMPLATE](_disposer: Disposer): Renderable {
    return document.createDocumentFragment()
  }

  render(parent: Node, _index?: number): void {
    if (!this[GEA_CREATED_CALLED]) {
      this[GEA_CREATED_CALLED] = true
      if (this.created !== CompiledComponent.prototype.created) this.created(this.props)
    }
    let node: Renderable = this[GEA_CREATE_TEMPLATE](this[GEA_DISPOSER])
    if (node == null) node = document.createComment('')
    if (Array.isArray(node)) {
      const frag = document.createDocumentFragment()
      for (const n of node) {
        if (n == null) continue
        if (n !== null && typeof n === 'object' && typeof (n as Node).nodeType === 'number') frag.appendChild(n as Node)
        else frag.appendChild(document.createTextNode(String(n)))
      }
      node = frag
    } else if (!(node !== null && typeof node === 'object' && typeof (node as Node).nodeType === 'number')) {
      node = document.createTextNode(String(node))
    }
    // By this point `node` is always a genuine Node: either it already was one,
    // or the branches above just replaced it with one (a fragment or a text
    // node). TS's control-flow analysis can't carry that invariant through the
    // `Array.isArray` / `typeof` chain above, so state it once here instead of
    // re-asserting `as Node` at every remaining use.
    const domNode = node as Node
    parent.appendChild(domNode)
    if (domNode.nodeType === 11) {
      this[GEA_ELEMENT] = ((parent as Element).lastElementChild as HTMLElement | null) ?? null
    } else if (domNode.nodeType === 1) {
      this[GEA_ELEMENT] = domNode as HTMLElement
    }
    const el = this[GEA_ELEMENT]
    if (el) (el as HTMLElement & { [GEA_DOM_COMPONENT]?: unknown })[GEA_DOM_COMPONENT] = this
    this.rendered = true
    this.onAfterRender()
  }

  onAfterRender(): void {
    /* no-op */
  }

  created(_props?: P): void {
    /* no-op */
  }

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

export default CompiledComponent
