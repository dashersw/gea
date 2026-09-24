import { GEA_DOM_COMPONENT } from './symbols'
import { GEA_CREATED_CALLED, GEA_DISPOSER } from './internal-symbols'
import { GEA_STATIC_ELEMENT, GEA_STATIC_NODES, GEA_STATIC_TEMPLATE } from './compiled-static-symbols'
import { createDisposer, type Disposer } from './disposer'

export class CompiledStaticComponent {
  rendered = false;
  [GEA_STATIC_ELEMENT] = null as HTMLElement | null;
  [GEA_STATIC_NODES]: Node[] = [];
  [GEA_DISPOSER] = createDisposer() as Disposer;
  [GEA_CREATED_CALLED] = false

  get el(): HTMLElement | null {
    return this[GEA_STATIC_ELEMENT] ?? null
  }

  [GEA_STATIC_TEMPLATE](_disposer: Disposer): Node {
    return document.createDocumentFragment()
  }

  created(): void {
    /* no-op */
  }

  render(parent: Node, _index?: number): void {
    if (!this[GEA_CREATED_CALLED]) {
      this[GEA_CREATED_CALLED] = true
      this.created()
    }
    const node = this[GEA_STATIC_TEMPLATE](this[GEA_DISPOSER])
    // Appending a fragment empties it, so capture its roots before insertion.
    this[GEA_STATIC_NODES] = node.nodeType === 11 ? Array.from(node.childNodes) : [node]
    this[GEA_STATIC_ELEMENT] = null
    for (const root of this[GEA_STATIC_NODES]) {
      if (root.nodeType === 1) this[GEA_STATIC_ELEMENT] = root as HTMLElement
    }
    parent.appendChild(node)
    const el = this[GEA_STATIC_ELEMENT] as any
    if (el) el[GEA_DOM_COMPONENT] = this
    this.rendered = true
  }

  dispose(): void {
    this[GEA_DISPOSER].dispose()
    for (const node of this[GEA_STATIC_NODES]) node.parentNode?.removeChild(node)
    this[GEA_STATIC_NODES] = []
    this[GEA_STATIC_ELEMENT] = null
  }
}

export default CompiledStaticComponent
