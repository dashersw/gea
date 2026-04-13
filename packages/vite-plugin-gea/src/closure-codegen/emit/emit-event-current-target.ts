import type { Expression } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

export function eventHandlerNeedsCurrentTarget(expr: Expression): boolean {
  if (!t.isArrowFunctionExpression(expr) && !t.isFunctionExpression(expr)) return true
  if (referencesCurrentTarget(expr)) return true
  const firstParam = expr.params[0]
  if (!firstParam) return false
  if (t.isIdentifier(firstParam)) return eventParamEscapes(expr.body, firstParam.name)
  if (t.isObjectPattern(firstParam)) return patternMayReadCurrentTarget(firstParam)
  return true
}

function referencesCurrentTarget(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isIdentifier(node, { name: 'currentTarget' })) return true
  if (t.isStringLiteral(node, { value: 'currentTarget' })) return true
  return someChild(node, referencesCurrentTarget)
}

function eventParamEscapes(node: any, name: string, parent?: any, key?: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isIdentifier(node, { name })) {
    if (
      parent &&
      (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent)) &&
      key === 'object' &&
      !isCurrentTargetProperty(parent)
    ) {
      return false
    }
    return true
  }
  if (isFunctionNode(node) && node !== parent) {
    for (const param of node.params ?? []) {
      if (t.isIdentifier(param, { name })) return false
    }
  }
  return someChild(node, (child, childKey) => eventParamEscapes(child, name, node, childKey))
}

function patternMayReadCurrentTarget(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isRestElement(node)) return true
  if (t.isObjectProperty(node)) {
    if (isCurrentTargetKey(node.key)) return true
    return patternMayReadCurrentTarget(node.value)
  }
  if (t.isObjectPattern(node) || t.isArrayPattern(node)) {
    return someChild(node, patternMayReadCurrentTarget)
  }
  return false
}

function isCurrentTargetProperty(node: any): boolean {
  if (!node) return false
  return isCurrentTargetKey(node.property)
}

function isCurrentTargetKey(node: any): boolean {
  return t.isIdentifier(node, { name: 'currentTarget' }) || t.isStringLiteral(node, { value: 'currentTarget' })
}

function isFunctionNode(node: any): boolean {
  return t.isArrowFunctionExpression(node) || t.isFunctionExpression(node) || t.isFunctionDeclaration(node)
}

function someChild(node: any, visit: (child: any, key?: string) => boolean): boolean {
  for (const key of Object.keys(node)) {
    if (isMetadataKey(key)) continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) if (visit(child, key)) return true
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      if (visit(value, key)) return true
    }
  }
  return false
}

function isMetadataKey(key: string): boolean {
  return (
    key === 'loc' ||
    key === 'start' ||
    key === 'end' ||
    key === 'range' ||
    key === 'type' ||
    key === 'leadingComments' ||
    key === 'trailingComments' ||
    key === 'innerComments' ||
    key === 'extra'
  )
}
