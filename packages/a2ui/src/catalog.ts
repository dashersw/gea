import type { ComponentDefinition } from './types'
import { toThunk, type BindingContext } from './binding'

export type PropThunks = Record<string, () => unknown>

/** Writes `next` to the Store path this component's `value` is bound to. */
export type WriteFn = (next: unknown) => void

export interface CatalogEntry {
  typeName: string
  /** A compiled Gea component class, passed by reference to `mount()`. */
  component: unknown
  /**
   * `write` is non-null exactly when the definition has a DataBinding `value`.
   * The entry attaches it to whichever handler prop its component actually
   * uses — there is no universal change event.
   */
  mapProps(def: ComponentDefinition, ctx: BindingContext, write: WriteFn | null): PropThunks
}

export type Catalog = Map<string, CatalogEntry>

const STRUCTURAL_KEYS = new Set(['id', 'component', 'child', 'children'])

/** Every non-structural property is a DynamicValue and becomes a lazy thunk. */
export function resolveProps(def: ComponentDefinition, ctx: BindingContext): PropThunks {
  const props: PropThunks = {}
  for (const [key, value] of Object.entries(def)) {
    if (STRUCTURAL_KEYS.has(key)) continue
    props[key] = toThunk(value as never, ctx)
  }
  return props
}

export { createBasicCatalog } from './catalog/basic'
