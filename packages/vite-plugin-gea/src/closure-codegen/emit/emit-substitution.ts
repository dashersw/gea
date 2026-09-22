import type { Expression } from '@babel/types'

import { t, traverse, type NodePath } from '../../utils/babel-interop.ts'

/** Resolve template aliases at free read/write sites, preserving lexical scope. */
export function substituteBindings(expr: any, bindings: Map<string, Expression>): any {
  if (!expr) return expr
  if (
    t.isTSAsExpression(expr) ||
    t.isTSTypeAssertion(expr) ||
    t.isTSNonNullExpression(expr) ||
    t.isTSInstantiationExpression(expr)
  ) {
    return substituteBindings(expr.expression, bindings)
  }
  if (bindings.size === 0) return expr

  // A real Babel scope accounts for hoisted variables, block declarations,
  // catch/loop bindings and nested parameter patterns. Assignment patterns
  // write existing references; declaration patterns introduce bindings.
  const node = t.cloneNode(expr, true)
  const statement = t.isStatement(node)
  const container = t.isJSXExpressionContainer(node)
  if (container && t.isJSXEmptyExpression(node.expression)) return node
  if (!statement && !container && !t.isExpression(node)) return node
  const file = t.file(t.program([statement ? node : t.expressionStatement(container ? node.expression : node)]))
  traverse(file, {
    Identifier(path) {
      const name = path.node.name
      if (!bindings.has(name) || path.scope.getBinding(name)) return
      if (!path.isReferencedIdentifier() && !isAssignmentTarget(path)) return
      const remaining = new Map(bindings)
      remaining.delete(name)
      const replacement = substituteBindings(bindings.get(name)!, remaining)
      path.replaceWith(t.cloneNode(replacement, true))
      path.skip()
    },
  })
  const result = statement ? file.program.body[0] : (file.program.body[0] as any).expression
  return container ? { ...node, expression: result } : result
}

/** Assignment patterns write references; labels and declarations do not. */
function isAssignmentTarget(path: NodePath): boolean {
  let target = path
  while (target.parentPath) {
    const parent = target.parentPath
    if (
      (parent.isObjectProperty() && target.key === 'value') ||
      parent.isObjectPattern() ||
      parent.isArrayPattern() ||
      (parent.isRestElement() && target.key === 'argument') ||
      (parent.isAssignmentPattern() && target.key === 'left')
    ) {
      target = parent
      continue
    }
    return (
      ((parent.isAssignmentExpression() || parent.isForInStatement() || parent.isForOfStatement()) &&
        target.key === 'left') ||
      (parent.isUpdateExpression() && target.key === 'argument')
    )
  }
  return false
}
