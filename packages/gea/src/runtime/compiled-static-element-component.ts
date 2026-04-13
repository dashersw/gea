import { GEA_DOM_COMPONENT } from './symbols'
import { GEA_STATIC_ELEMENT, GEA_STATIC_TEMPLATE } from './compiled-static-symbols'

export abstract class CompiledStaticElementComponent {
  rendered = false;
  declare [GEA_STATIC_ELEMENT]: HTMLElement | undefined

  get el(): HTMLElement | null {
    return this[GEA_STATIC_ELEMENT] ?? null
  }

  abstract [GEA_STATIC_TEMPLATE](): HTMLElement

  render(parent: Node, _index?: number): void {
    const el = parent.appendChild(this[GEA_STATIC_TEMPLATE]()) as HTMLElement
    this[GEA_STATIC_ELEMENT] = el
    ;(el as any)[GEA_DOM_COMPONENT] = this
    this.rendered = true
  }

  dispose(): void {
    this[GEA_STATIC_ELEMENT]?.remove()
    this[GEA_STATIC_ELEMENT] = undefined
  }
}

export default CompiledStaticElementComponent
