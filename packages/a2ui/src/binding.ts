import { isDataBinding, isFunctionCall, type DynamicValue, type FunctionCall } from './types'
import { resolveRead, type Scope } from './scope'
import type { RegisteredFunction } from './functions'

export interface BindingContext {
  store: Record<string, unknown>
  scope: Scope
  functions: Record<string, RegisteredFunction>
}

function callFunction(fc: FunctionCall, ctx: BindingContext): unknown {
  const fn = ctx.functions[fc.call]
  if (!fn) throw new Error(`Unknown A2UI function: ${fc.call}`)
  const args: Record<string, unknown> = {}
  // `args` is optional per schema — only `call` is required.
  for (const [key, value] of Object.entries(fc.args ?? {})) {
    args[key] = resolveOnce(value, ctx)
  }
  return fn(args)
}

/**
 * Turn a DynamicValue into a lazy prop thunk.
 *
 * The thunk MUST stay lazy. `mount()` hands it to the compiled leaf, which
 * invokes it inside its own reactive binding (running under `withTracking`).
 * The store read therefore happens in a tracking scope and auto-subscribes.
 * Pre-computing the value here would silently kill reactivity.
 */
export function toThunk(value: DynamicValue, ctx: BindingContext): () => unknown {
  if (isDataBinding(value)) {
    const path = value.path
    return () => resolveRead(ctx.store, path, ctx.scope)
  }
  if (isFunctionCall(value)) {
    return () => callFunction(value, ctx)
  }
  return () => value
}

/** Eager resolution. Only for action `context`, which is sent over the wire. */
export function resolveOnce(value: DynamicValue, ctx: BindingContext): unknown {
  if (isDataBinding(value)) return resolveRead(ctx.store, value.path, ctx.scope)
  if (isFunctionCall(value)) return callFunction(value, ctx)
  return value
}
