import { mount, type Disposer } from '@geajs/core/compiler-runtime'
import type { Action, ComponentDefinition, ComponentId, Transport } from './types'
import { isDataBinding, isTemplateChildList } from './types'
import type { Catalog, PropThunks, WriteFn } from './catalog'
import type { BindingContext } from './binding'
import type { RegisteredFunction } from './functions'
import { resolveWriteParts, type Scope } from './scope'
import { writePointer } from './pointer'
import { dispatchAction } from './actions'

export interface InstantiateContext {
  definitions: Map<ComponentId, ComponentDefinition>
  catalog: Catalog
  store: Record<string, unknown>
  functions: Record<string, RegisteredFunction>
  disposer: Disposer
  surfaceId: string
  transport: Transport
  /** Injected for determinism in tests. */
  now: () => string
}

function bindingContext(ictx: InstantiateContext, scope: Scope): BindingContext {
  return { store: ictx.store, scope, functions: ictx.functions }
}

/**
 * Write direction: local, immediate, no network. We resolve WHERE the write
 * lands; the catalog entry decides WHICH handler prop carries it, because
 * every input names its change event differently (`onInput`,
 * `onCheckedChange`, `onValueChange`).
 */
function writeFor(
  definition: ComponentDefinition,
  ictx: InstantiateContext,
  scope: Scope,
): WriteFn | null {
  if (!isDataBinding(definition.value)) return null
  const parts = resolveWriteParts(definition.value.path, scope)
  return (next: unknown) => writePointer(ictx.store, parts, next)
}

/** Actions are uniform: gea-ui's Button accepts both `click` and `onClick`. */
function injectAction(
  definition: ComponentDefinition,
  ictx: InstantiateContext,
  props: PropThunks,
  scope: Scope,
): void {
  if (!definition.action) return
  const action = definition.action as Action
  const handler = () =>
    dispatchAction(action, {
      surfaceId: ictx.surfaceId,
      sourceComponentId: definition.id,
      binding: bindingContext(ictx, scope),
      transport: ictx.transport,
      now: ictx.now,
    })
  props.onClick = () => handler
  props.click = () => handler
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
  const props = entry.mapProps(definition, ctx, writeFor(definition, ictx, scope))
  injectAction(definition, ictx, props, scope)

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
