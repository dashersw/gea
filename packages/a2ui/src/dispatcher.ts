import type { RegisteredFunction } from './functions'
import type { Catalog } from './catalog'
import { deletePointer, parsePointer, writePointer } from './pointer'
import { mountSurface, type Surface, type SurfaceRegistry } from './surface'
import type { ServerEnvelope, UpdateComponentsPayload, UpdateDataModelPayload } from './types'

export interface DispatchOptions {
  catalog: Catalog
  functions: Record<string, RegisteredFunction>
}

function requireSurface(registry: SurfaceRegistry, surfaceId: string): Surface {
  const surface = registry.get(surfaceId)
  if (!surface) throw new Error(`A2UI: unknown surfaceId "${surfaceId}"`)
  return surface
}

function handleUpdateComponents(
  payload: UpdateComponentsPayload,
  registry: SurfaceRegistry,
  opts: DispatchOptions,
): void {
  const surface = requireSurface(registry, payload.surfaceId)
  // Order is irrelevant: the adjacency list is resolved at mount.
  for (const definition of payload.components) {
    surface.componentDefinitions.set(definition.id, definition)
  }
  // The whole happy-path buffering rule: nothing renders until `root` exists.
  if (!surface.isMounted && surface.componentDefinitions.has('root')) {
    mountSurface(surface, opts.catalog, opts.functions)
  }
}

function handleUpdateDataModel(payload: UpdateDataModelPayload, registry: SurfaceRegistry): void {
  const surface = requireSurface(registry, payload.surfaceId)
  const model = surface.dataModel as unknown as Record<string, unknown>
  const parts = parsePointer(payload.path ?? '/')
  // Upsert semantics: `value` present writes; `value` absent removes.
  if ('value' in payload) writePointer(model, parts, payload.value)
  else deletePointer(model, parts)
}

/**
 * The ONLY place that reads `version`. v0.9 and v0.9.1 are wire-compatible;
 * a future v1.0 migration is a single edit here.
 */
export function dispatch(
  envelope: ServerEnvelope,
  registry: SurfaceRegistry,
  opts: DispatchOptions,
): void {
  if ('createSurface' in envelope) {
    registry.create(envelope.createSurface)
    return
  }
  if ('updateComponents' in envelope) {
    handleUpdateComponents(envelope.updateComponents, registry, opts)
    return
  }
  if ('updateDataModel' in envelope) {
    handleUpdateDataModel(envelope.updateDataModel, registry)
    return
  }
  // deleteSurface teardown is out of scope for the happy path.
  registry.delete(envelope.deleteSurface.surfaceId)
}
