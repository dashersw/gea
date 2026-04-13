import { GEA_CREATE_TEMPLATE, GEA_DOM_COMPONENT, GEA_ELEMENT } from './symbols'
import { GEA_DISPOSER, GEA_OBSERVE_DIRECT, GEA_SET_PROPS } from './internal-symbols'
import { createDisposer, type Disposer } from './disposer'
import { createLeanProxy, leanObserve, leanObserveDirect } from './compiled-lean-store'

type Handler = (value: any, changes?: any[]) => void
type PropThunks = Record<string, () => any>
const GEA_COMPONENT_ID = Symbol()
let nextComponentId = 0

export class CompiledTinyReactiveComponent<P extends Record<string, any> = Record<string, any>> {
  rendered = false
  props: P = {} as P;
  [GEA_ELEMENT] = null as HTMLElement | null;
  [GEA_DISPOSER] = createDisposer() as Disposer

  constructor() {
    return createLeanProxy(this)
  }

  get id(): string {
    return ((this as any)[GEA_COMPONENT_ID] ??= '_' + nextComponentId++)
  }

  set id(value: string) {
    ;(this as any)[GEA_COMPONENT_ID] = value
  }

  get el(): HTMLElement | null {
    return this[GEA_ELEMENT] ?? null
  }

  [GEA_SET_PROPS](thunks: PropThunks): void {
    const out: Record<string, any> = {}
    for (const k in thunks) {
      Object.defineProperty(out, k, {
        enumerable: true,
        get: () => thunks[k](),
      })
    }
    this.props = out as P
  }

  render(parent: Node, _index?: number): void {
    const node = this[GEA_CREATE_TEMPLATE](this[GEA_DISPOSER])
    parent.appendChild(node)
    if (node.nodeType === 11) this[GEA_ELEMENT] = ((parent as Element).lastElementChild as HTMLElement | null) ?? null
    else if (node.nodeType === 1) this[GEA_ELEMENT] = node as HTMLElement
    if (this[GEA_ELEMENT]) (this[GEA_ELEMENT] as any)[GEA_DOM_COMPONENT] = this
    this.rendered = true
  }

  observe(pathOrProp: string | readonly string[], handler: Handler): () => void {
    return leanObserve(this, pathOrProp, handler)
  }

  [GEA_OBSERVE_DIRECT](prop: string, handler: (value: any) => void): () => void {
    return leanObserveDirect(this, prop, handler)
  }

  dispose(): void {
    this[GEA_DISPOSER].dispose()
    this[GEA_ELEMENT]?.remove()
    this[GEA_ELEMENT] = null
  }

  $(sel: string): Element | null {
    return this[GEA_ELEMENT]?.querySelector(sel) ?? null
  }

  $$(sel: string): Element[] {
    return Array.from(this[GEA_ELEMENT]?.querySelectorAll(sel) ?? [])
  }

  created(_props?: P): void {
    /* no-op */
  }

  onAfterRender(): void {
    /* no-op */
  }
}

export default CompiledTinyReactiveComponent
