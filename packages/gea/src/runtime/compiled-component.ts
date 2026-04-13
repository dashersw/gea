import { GEA_CREATE_TEMPLATE, GEA_DOM_COMPONENT, GEA_ELEMENT, GEA_ON_PROP_CHANGE } from './symbols'
import { GEA_CREATED_CALLED, GEA_DISPOSER, GEA_SET_PROPS } from './internal-symbols'
import { createDisposer, type Disposer } from './disposer'
import { getComponentId } from './component-id'

type PropThunks = Record<string, () => any>
const GEA_COMPONENT_ID = Symbol()
const GEA_LAST_PROP_VALUES = Symbol()

export class CompiledComponent<P extends Record<string, any> = Record<string, any>> {
  rendered = false
  props: P = {} as P;

  [GEA_ELEMENT] = null as HTMLElement | null;
  [GEA_DISPOSER] = createDisposer() as Disposer;
  [GEA_CREATED_CALLED] = false

  get id(): string {
    return ((this as any)[GEA_COMPONENT_ID] ??= getComponentId())
  }

  set id(value: string) {
    ;(this as any)[GEA_COMPONENT_ID] = value
  }

  get el(): HTMLElement | null {
    return this[GEA_ELEMENT] ?? null
  }

  [GEA_SET_PROPS](thunks: PropThunks): void {
    const createdCalled = this[GEA_CREATED_CALLED]
    const notifyPropChange = createdCalled ? (this as any)[GEA_ON_PROP_CHANGE] : undefined
    const prevValues: Record<string, any> | undefined =
      typeof notifyPropChange === 'function' ? (this as any)[GEA_LAST_PROP_VALUES] : undefined
    const out: Record<string, any> = {}
    for (const k in thunks) {
      Object.defineProperty(out, k, {
        enumerable: true,
        configurable: true,
        get: () => thunks[k](),
      })
    }
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
      if (this.created !== CompiledComponent.prototype.created) this.created(this.props)
    } else if (typeof notifyPropChange === 'function') {
      for (const key in thunks) {
        const prev = prevValues?.[key]
        const next = this.props?.[key]
        if (next !== prev || (prev !== null && typeof prev === 'object')) notifyPropChange.call(this, key, next)
      }
    }
  }

  [GEA_CREATE_TEMPLATE](_disposer: Disposer): Node {
    return document.createDocumentFragment()
  }

  render(parent: Node, _index?: number): void {
    if (!this[GEA_CREATED_CALLED]) {
      this[GEA_CREATED_CALLED] = true
      if (this.created !== CompiledComponent.prototype.created) this.created(this.props)
    }
    let node = this[GEA_CREATE_TEMPLATE](this[GEA_DISPOSER])
    if (node == null) node = document.createComment('')
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
    if (node.nodeType === 11) {
      this[GEA_ELEMENT] = ((parent as Element).lastElementChild as HTMLElement | null) ?? null
    } else if (node.nodeType === 1) {
      this[GEA_ELEMENT] = node as HTMLElement
    }
    const el = this[GEA_ELEMENT] as any
    if (el) el[GEA_DOM_COMPONENT] = this
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
