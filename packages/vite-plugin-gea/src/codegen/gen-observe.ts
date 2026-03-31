/**
 * Observer method generation for the Gea compiler codegen.
 *
 * Generates __observe_* class methods that react to store/state changes
 * and update the DOM. Supports simple bindings and wildcard (array item)
 * bindings, with merging of handlers that share the same observe path.
 */
import { t } from '../utils/babel-interop.ts'
import { id, jsMethod } from 'eszter'
import type { ReactiveBinding } from '../ir/types.ts'
import { buildSimpleUpdate, buildWildcardUpdate } from './gen-observe-helpers.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'
import {
  buildObserveKey,
  getObserveMethodName,
  normalizePathParts,
} from './ast-helpers.ts'

export function generateObserveHandler(
  binding: ReactiveBinding,
  stateRefs: Map<string, StateRefMeta>,
  methodName = getObserveMethodName(
    binding.pathParts || normalizePathParts((binding as any).path || ''),
    binding.storeVar,
  ),
  observePathOverride?: string[],
): t.ClassMethod {
  const bindingPath = binding.pathParts || normalizePathParts((binding as any).path || '')
  const observePath = observePathOverride || bindingPath
  const paramName = observePath[observePath.length - 1] || 'value'
  const param = t.identifier(paramName)
  const changeParam = t.identifier('change')

  let valueExpr: t.Expression = param
  if (observePathOverride && bindingPath.length > observePathOverride.length) {
    const suffix = bindingPath.slice(observePathOverride.length)
    valueExpr = suffix.reduce<t.Expression>((expr, part) => t.memberExpression(expr, t.identifier(part)), param)
  }

  const isWildcard = observePath.includes('*')
  const body = isWildcard
    ? buildWildcardUpdate(binding, valueExpr, stateRefs)
    : buildSimpleUpdate(binding, valueExpr, stateRefs)

  const method = jsMethod`${id(methodName)}(${param}, ${changeParam}) {}`
  method.body.body.push(...(Array.isArray(body) ? body : [body]))
  return method
}

export function mergeObserveHandlers(
  bindings: ReactiveBinding[],
  stateRefs: Map<string, StateRefMeta>,
): Map<string, t.ClassMethod> {
  const byPath = new Map<string, t.ClassMethod>()

  bindings.forEach((binding) => {
    const pathParts = binding.pathParts || normalizePathParts((binding as any).path || '')
    let observeParts = pathParts
    if (observeParts.length >= 2 && observeParts[observeParts.length - 1] === 'length') {
      observeParts = observeParts.slice(0, -1)
    }
    const observeKey = buildObserveKey(observeParts, binding.storeVar)
    const methodName = getObserveMethodName(observeParts, binding.storeVar)
    const observePathOverride = observeParts !== pathParts ? observeParts : undefined
    const handler = generateObserveHandler(binding, stateRefs, methodName, observePathOverride)

    if (!byPath.has(observeKey)) {
      byPath.set(observeKey, handler)
    } else {
      const existing = byPath.get(observeKey)!
      if (t.isBlockStatement(existing.body) && t.isBlockStatement(handler.body)) {
        existing.body.body.push(...handler.body.body)
      }
    }
  })

  return byPath
}
