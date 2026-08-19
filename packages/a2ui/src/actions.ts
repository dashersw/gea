import { resolveOnce, type BindingContext } from './binding'
import type { Action, ClientAction, ComponentId, Transport } from './types'

export interface ActionContext {
  surfaceId: string
  sourceComponentId: ComponentId
  binding: BindingContext
  transport: Transport
  /** Injected for determinism in tests. */
  now: () => string
}

/**
 * `event` goes up the transport with its context resolved to concrete values.
 * `functionCall` stays local — it names a pre-registered function and never
 * reaches the server.
 */
export function dispatchAction(action: Action, ctx: ActionContext): void {
  if ('functionCall' in action) {
    resolveOnce(action.functionCall, ctx.binding)
    return
  }
  const context: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(action.event.context ?? {})) {
    context[key] = resolveOnce(value, ctx.binding)
  }
  const message: ClientAction = {
    name: action.event.name,
    surfaceId: ctx.surfaceId,
    sourceComponentId: ctx.sourceComponentId,
    timestamp: ctx.now(),
    context,
  }
  ctx.transport.sendAction(message)
}
