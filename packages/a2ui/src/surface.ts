import { Store } from '@geajs/core'
import { createDisposer, type Disposer } from '@geajs/core/compiler-runtime'
import type { ComponentDefinition, ComponentId, CreateSurfacePayload, Transport } from './types'
import type { Catalog } from './catalog'
import type { RegisteredFunction } from './functions'
import { instantiateNode } from './instantiate'
import { createRootScope } from './scope'

export interface MountOptions {
  catalog: Catalog
  functions: Record<string, RegisteredFunction>
  transport: Transport
  now: () => string
}

export interface Surface {
  surfaceId: string
  /** Fixed at creation. Reconfiguration requires deleteSurface then createSurface. */
  catalogId: string
  componentDefinitions: Map<ComponentId, ComponentDefinition>
  /** Identity is permanent — mutate in place, never reassign. */
  dataModel: Store
  isMounted: boolean
  rootHostElement: Element
  disposer: Disposer
}

export class SurfaceRegistry {
  private readonly surfaces = new Map<string, Surface>()

  constructor(private readonly hostFor: (surfaceId: string) => Element) {}

  create(payload: CreateSurfacePayload): Surface {
    const surface: Surface = {
      surfaceId: payload.surfaceId,
      catalogId: payload.catalogId,
      componentDefinitions: new Map(),
      dataModel: new Store({}),
      isMounted: false,
      rootHostElement: this.hostFor(payload.surfaceId),
      disposer: createDisposer(),
    }
    this.surfaces.set(payload.surfaceId, surface)
    return surface
  }

  get(surfaceId: string): Surface | undefined {
    return this.surfaces.get(surfaceId)
  }

  delete(surfaceId: string): void {
    this.surfaces.delete(surfaceId)
  }
}

/** The one interpreter walk. Runs once; after this the interpreter is idle. */
export function mountSurface(surface: Surface, opts: MountOptions): void {
  surface.rootHostElement.replaceChildren()
  instantiateNode(
    'root',
    {
      definitions: surface.componentDefinitions,
      catalog: opts.catalog,
      store: surface.dataModel as unknown as Record<string, unknown>,
      functions: opts.functions,
      disposer: surface.disposer,
      surfaceId: surface.surfaceId,
      transport: opts.transport,
      now: opts.now,
    },
    surface.rootHostElement,
    createRootScope(),
  )
  surface.isMounted = true
}
