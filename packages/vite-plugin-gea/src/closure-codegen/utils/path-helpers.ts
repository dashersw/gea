import type { Expression } from '@babel/types'
import { t } from '../../utils/babel-interop.ts'

function cloneExpr(expr: Expression): Expression {
  return t.cloneNode(expr) as Expression
}

export type PathOrGetter = { kind: 'path' | 'getter'; value: Expression; root?: Expression }

function touchKey(root: any, prop: any): string | null {
  if (t.isThisExpression(root)) return t.isIdentifier(prop) ? `this.${prop.name}` : null
  if (!t.isIdentifier(root)) return null
  if (t.isIdentifier(prop)) return `${root.name}.${prop.name}`
  if (t.isStringLiteral(prop) || t.isNumericLiteral(prop)) return `${root.name}.${String(prop.value)}`
  return null
}

function firstTrackedMember(expr: any): { key: string; expr: Expression } | null {
  const chain: any[] = []
  let cur = expr
  while (t.isMemberExpression(cur) || t.isOptionalMemberExpression(cur)) {
    chain.unshift(cur)
    cur = cur.object
  }
  if ((!t.isIdentifier(cur) && !t.isThisExpression(cur)) || chain.length === 0) return null
  const first = chain[0]
  if (
    t.isThisExpression(cur) &&
    !first.computed &&
    t.isIdentifier(first.property, { name: 'props' }) &&
    chain.length > 1
  ) {
    const second = chain[1]
    const key = t.isIdentifier(second.property)
      ? `this.props.${second.property.name}`
      : t.isStringLiteral(second.property) || t.isNumericLiteral(second.property)
        ? `this.props.${String(second.property.value)}`
        : null
    return key
      ? {
          key,
          expr: t.memberExpression(
            t.memberExpression(t.thisExpression(), t.identifier('props')),
            cloneExpr(second.property as Expression),
            second.computed,
          ),
        }
      : null
  }
  const key = touchKey(cur, first.property)
  return key
    ? {
        key,
        expr: t.memberExpression(cloneExpr(cur as Expression), cloneExpr(first.property as Expression), first.computed),
      }
    : null
}

function collectTrackedMembers(node: any, out: Map<string, Expression>): void {
  if (!node || typeof node !== 'object') return
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node) || t.isFunctionDeclaration(node)) return
  if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
    const touch = firstTrackedMember(node)
    if (touch) out.set(touch.key, touch.expr)
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type' || k === 'extra' || k.endsWith('Comments')) continue
    const v = node[k]
    if (Array.isArray(v)) for (const item of v) collectTrackedMembers(item, out)
    else collectTrackedMembers(v, out)
  }
}

function collectSkippedTrackedMembers(node: any, out: Map<string, Expression>): void {
  if (!node || typeof node !== 'object') return
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node) || t.isFunctionDeclaration(node)) return
  if (t.isLogicalExpression(node)) {
    collectTrackedMembers(node.right, out)
    collectSkippedTrackedMembers(node.left, out)
    collectSkippedTrackedMembers(node.right, out)
    return
  }
  if (t.isConditionalExpression(node)) {
    collectTrackedMembers(node.consequent, out)
    collectTrackedMembers(node.alternate, out)
    collectSkippedTrackedMembers(node.test, out)
    collectSkippedTrackedMembers(node.consequent, out)
    collectSkippedTrackedMembers(node.alternate, out)
    return
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type' || k === 'extra' || k.endsWith('Comments')) continue
    const v = node[k]
    if (Array.isArray(v)) for (const item of v) collectSkippedTrackedMembers(item, out)
    else collectSkippedTrackedMembers(v, out)
  }
}

export function eagerTrackSkippedReads(expr: Expression): Expression {
  const touches = new Map<string, Expression>()
  collectSkippedTrackedMembers(expr, touches)
  if (touches.size === 0) return expr
  return t.sequenceExpression([...Array.from(touches.values()).map((e) => t.unaryExpression('void', e)), expr])
}

export function getterPathOrGetter(expr: Expression): PathOrGetter {
  return { kind: 'getter', value: t.arrowFunctionExpression([], eagerTrackSkippedReads(expr)) }
}

export function tryExtractMemberPath(expr: any): string[] | null {
  const info = tryExtractPathAndRoot(expr)
  return info ? info.path : null
}

/** Extract a member chain into {root, path}. Root is the base identifier or
 * `this`. Returns null if the chain can't be resolved (call expressions,
 * computed non-literal indices, etc.). */
export function tryExtractPathAndRoot(expr: any): { root: Expression; path: string[] } | null {
  const parts: string[] = []
  let cur = expr
  while (t.isMemberExpression(cur)) {
    if (cur.computed) {
      if (!t.isStringLiteral(cur.property) && !t.isNumericLiteral(cur.property)) return null
      parts.unshift(String((cur.property as any).value))
    } else {
      if (!t.isIdentifier(cur.property)) return null
      parts.unshift(cur.property.name)
    }
    cur = cur.object
  }
  if (t.isThisExpression(cur)) return { root: t.thisExpression(), path: parts }
  if (t.isIdentifier(cur)) return { root: t.identifier(cur.name), path: parts }
  return null
}
