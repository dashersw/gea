import { mount, type Disposer } from '@geajs/core/compiler-runtime'
import type { ComponentDefinition, ComponentId } from './types'
import { isTemplateChildList } from './types'
import type { Catalog } from './catalog'
import type { BindingContext } from './binding'
import type { RegisteredFunction } from './functions'
import type { Scope } from './scope'

export interface InstantiateContext {
  definitions: Map<ComponentId, ComponentDefinition>
  catalog: Catalog
  store: Record<string, unknown>
  functions: Record<string, RegisteredFunction>
  disposer: Disposer
}

function bindingContext(ictx: InstantiateContext, scope: Scope): BindingContext {
  return { store: ictx.store, scope, functions: ictx.functions }
}

/**
 * Mount `nodeId` into `parent`, then recurse mounting its children into the
 * element the node produced.
 *
 * Parent-directed by necessity: `mount()` appends into `parent` and returns
 * the component instance, not a Node (runtime/mount.ts:123). Reading back
 * `inst.el` and appending children into it also avoids the compiled
 * `children` thunk, which can only carry a SINGLE Node.
 */
export function instantiateNode(
  nodeId: ComponentId,
  ictx: InstantiateContext,
  parent: Element,
  scope: Scope,
): Element {
  const definition = ictx.definitions.get(nodeId)
  if (!definition) throw new Error(`A2UI: no component definition for id "${nodeId}"`)

  const entry = ictx.catalog.get(definition.component)
  if (!entry) throw new Error(`A2UI: component type "${definition.component}" is not in the catalog`)

  const ctx = bindingContext(ictx, scope)
  // Task 10 replaces `null` with a WriteFn when `value` is a DataBinding.
  const props = entry.mapProps(definition, ctx, null)

  const instance = mount(entry.component as never, parent, props as never, ictx.disposer.child())
  const element: Element | null = instance && (instance as { el?: Element | null }).el
  if (!element) throw new Error(`A2UI: component "${definition.component}" produced no element`)

  instantiateChildren(definition, ictx, element, scope)
  return element
}

function instantiateChildren(
  definition: ComponentDefinition,
  ictx: InstantiateContext,
  host: Element,
  scope: Scope,
): void {
  if (typeof definition.child === 'string') {
    instantiateNode(definition.child, ictx, host, scope)
    return
  }
  const children = definition.children
  if (Array.isArray(children)) {
    for (const childId of children) instantiateNode(childId, ictx, host, scope)
    return
  }
  if (isTemplateChildList(children)) {
    // Template lists arrive in Task 11.
    throw new Error('A2UI: template ChildList is not implemented yet')
  }
}
