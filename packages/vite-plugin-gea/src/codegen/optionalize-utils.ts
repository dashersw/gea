/**
 * Utilities for optionalizing member expression chains based on
 * binding roots and computed item keys, and early-return guard analysis.
 */
import { t } from '../utils/babel-interop.ts'

// ─── Early-return guard helpers ─────────────────────────────────────

export function earlyReturnFalsyBindingName(
  guard: t.Expression,
): string | null {
  if (
    t.isUnaryExpression(guard) &&
    guard.operator === '!' &&
    t.isIdentifier(guard.argument)
  )
    return guard.argument.name
  if (
    t.isBinaryExpression(guard) &&
    (guard.operator === '==' || guard.operator === '===')
  ) {
    const nullish = (e: t.Expression) =>
      t.isNullLiteral(e) || (t.isIdentifier(e) && e.name === 'undefined')
    if (t.isIdentifier(guard.left) && nullish(guard.right))
      return guard.left.name
    if (t.isIdentifier(guard.right) && nullish(guard.left))
      return guard.right.name
  }
  if (t.isLogicalExpression(guard) && guard.operator === '||') {
    return (
      earlyReturnFalsyBindingName(guard.left) ||
      earlyReturnFalsyBindingName(guard.right)
    )
  }
  return null
}

// ─── Optionalize member chains ──────────────────────────────────────

export function optionalizeMemberChainsFromBindingRoot(
  expr: t.Expression,
  rootName: string,
): t.Expression {
  const visit = (e: t.Expression): t.Expression => {
    if (t.isMemberExpression(e) && !e.computed) {
      const obj = visit(e.object as t.Expression)
      if (t.isIdentifier(e.object, { name: rootName }))
        return t.optionalMemberExpression(
          e.object,
          e.property as t.Identifier,
          false,
          true,
        )
      if (t.isOptionalMemberExpression(obj))
        return t.optionalMemberExpression(
          obj,
          e.property as t.Identifier,
          false,
          true,
        )
      return t.memberExpression(obj, e.property, false)
    }
    if (t.isOptionalMemberExpression(e))
      return t.optionalMemberExpression(
        visit(e.object as t.Expression),
        e.property as t.Expression,
        e.computed,
        e.optional,
      )
    if (t.isOptionalCallExpression(e))
      return t.optionalCallExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
        e.optional,
      )
    if (t.isCallExpression(e))
      return t.callExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    if (t.isConditionalExpression(e))
      return t.conditionalExpression(
        visit(e.test),
        visit(e.consequent),
        visit(e.alternate),
      )
    if (t.isLogicalExpression(e))
      return t.logicalExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isBinaryExpression(e))
      return t.binaryExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isUnaryExpression(e))
      return t.unaryExpression(
        e.operator,
        visit(e.argument as t.Expression),
        e.prefix,
      )
    if (t.isSequenceExpression(e))
      return t.sequenceExpression(
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isAssignmentExpression(e))
      return t.assignmentExpression(
        e.operator,
        e.left as t.LVal,
        visit(e.right as t.Expression),
      )
    if (t.isArrayExpression(e))
      return t.arrayExpression(
        e.elements.map((el) => {
          if (el === null) return null
          if (t.isSpreadElement(el)) return t.spreadElement(visit(el.argument))
          return visit(el as t.Expression)
        }),
      )
    if (t.isObjectExpression(e))
      return t.objectExpression(
        e.properties.map((p) => {
          if (t.isSpreadElement(p)) return t.spreadElement(visit(p.argument))
          if (t.isObjectProperty(p))
            return t.objectProperty(
              p.computed
                ? (visit(p.key as t.Expression) as
                    | t.Expression
                    | t.Identifier
                    | t.StringLiteral)
                : p.key,
              visit(p.value as t.Expression),
              p.computed,
              p.shorthand,
            )
          return p
        }),
      )
    if (t.isTemplateLiteral(e))
      return t.templateLiteral(
        e.quasis,
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isTaggedTemplateExpression(e))
      return t.taggedTemplateExpression(
        visit(e.tag as t.Expression),
        visit(e.quasi) as t.TemplateLiteral,
      )
    if (t.isNewExpression(e))
      return t.newExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    return e
  }
  return visit(expr)
}

export function optionalizeBindingRootInStatements(
  stmts: t.Statement[],
  rootName: string,
): t.Statement[] {
  const mapStmt = (s: t.Statement): t.Statement => {
    if (t.isVariableDeclaration(s))
      return t.variableDeclaration(
        s.kind,
        s.declarations.map((d) =>
          t.variableDeclarator(
            d.id,
            d.init
              ? optionalizeMemberChainsFromBindingRoot(d.init, rootName)
              : null,
          ),
        ),
      )
    if (t.isExpressionStatement(s))
      return t.expressionStatement(
        optionalizeMemberChainsFromBindingRoot(s.expression, rootName),
      )
    if (t.isReturnStatement(s))
      return t.returnStatement(
        s.argument
          ? optionalizeMemberChainsFromBindingRoot(s.argument, rootName)
          : null,
      )
    if (t.isBlockStatement(s)) return t.blockStatement(s.body.map(mapStmt))
    if (t.isIfStatement(s))
      return t.ifStatement(
        optionalizeMemberChainsFromBindingRoot(s.test, rootName),
        mapStmt(s.consequent) as t.Statement,
        s.alternate ? (mapStmt(s.alternate) as t.Statement) : null,
      )
    return s
  }
  return stmts.map((s) => mapStmt(t.cloneNode(s, true) as t.Statement))
}

export function optionalizeMemberChainsAfterComputedItemKey(
  expr: t.Expression,
  itemKeyName: string,
): t.Expression {
  const visit = (e: t.Expression): t.Expression => {
    if (t.isMemberExpression(e) && !e.computed) {
      const origObj = e.object as t.Expression
      const inner = visit(origObj)
      if (
        t.isMemberExpression(origObj) &&
        origObj.computed &&
        t.isIdentifier(origObj.property, { name: itemKeyName })
      ) {
        return t.optionalMemberExpression(
          inner,
          e.property as t.Identifier,
          false,
          true,
        )
      }
      if (t.isOptionalMemberExpression(inner))
        return t.optionalMemberExpression(
          inner,
          e.property as t.Identifier,
          false,
          true,
        )
      return t.memberExpression(inner, e.property, false)
    }
    if (t.isMemberExpression(e) && e.computed)
      return t.memberExpression(
        visit(e.object as t.Expression),
        visit(e.property as t.Expression) as t.Expression,
        true,
      )
    if (t.isOptionalMemberExpression(e))
      return t.optionalMemberExpression(
        visit(e.object as t.Expression),
        e.property as t.Expression,
        e.computed,
        e.optional,
      )
    if (t.isOptionalCallExpression(e))
      return t.optionalCallExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
        e.optional,
      )
    if (t.isCallExpression(e))
      return t.callExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    if (t.isConditionalExpression(e))
      return t.conditionalExpression(
        visit(e.test),
        visit(e.consequent),
        visit(e.alternate),
      )
    if (t.isLogicalExpression(e))
      return t.logicalExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isBinaryExpression(e))
      return t.binaryExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isUnaryExpression(e))
      return t.unaryExpression(
        e.operator,
        visit(e.argument as t.Expression),
        e.prefix,
      )
    if (t.isSequenceExpression(e))
      return t.sequenceExpression(
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isAssignmentExpression(e))
      return t.assignmentExpression(
        e.operator,
        e.left as t.LVal,
        visit(e.right as t.Expression),
      )
    if (t.isArrayExpression(e))
      return t.arrayExpression(
        e.elements.map((el) => {
          if (el === null) return null
          if (t.isSpreadElement(el)) return t.spreadElement(visit(el.argument))
          return visit(el as t.Expression)
        }),
      )
    if (t.isObjectExpression(e))
      return t.objectExpression(
        e.properties.map((p) => {
          if (t.isSpreadElement(p)) return t.spreadElement(visit(p.argument))
          if (t.isObjectProperty(p))
            return t.objectProperty(
              p.computed
                ? (visit(p.key as t.Expression) as
                    | t.Expression
                    | t.Identifier
                    | t.StringLiteral)
                : p.key,
              visit(p.value as t.Expression),
              p.computed,
              p.shorthand,
            )
          return p
        }),
      )
    if (t.isTemplateLiteral(e))
      return t.templateLiteral(
        e.quasis,
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isTaggedTemplateExpression(e))
      return t.taggedTemplateExpression(
        visit(e.tag as t.Expression),
        visit(e.quasi) as t.TemplateLiteral,
      )
    if (t.isNewExpression(e))
      return t.newExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    if (t.isParenthesizedExpression(e))
      return t.parenthesizedExpression(visit(e.expression))
    return e
  }
  return visit(expr)
}

export function optionalizeComputedItemKeyInStatements(
  stmts: t.Statement[],
  itemKeyName: string,
): t.Statement[] {
  const mapStmt = (s: t.Statement): t.Statement => {
    if (t.isVariableDeclaration(s))
      return t.variableDeclaration(
        s.kind,
        s.declarations.map((d) =>
          t.variableDeclarator(
            d.id,
            d.init
              ? optionalizeMemberChainsAfterComputedItemKey(d.init, itemKeyName)
              : null,
          ),
        ),
      )
    if (t.isExpressionStatement(s))
      return t.expressionStatement(
        optionalizeMemberChainsAfterComputedItemKey(s.expression, itemKeyName),
      )
    if (t.isReturnStatement(s))
      return t.returnStatement(
        s.argument
          ? optionalizeMemberChainsAfterComputedItemKey(s.argument, itemKeyName)
          : null,
      )
    if (t.isBlockStatement(s)) return t.blockStatement(s.body.map(mapStmt))
    if (t.isIfStatement(s))
      return t.ifStatement(
        optionalizeMemberChainsAfterComputedItemKey(s.test, itemKeyName),
        mapStmt(s.consequent) as t.Statement,
        s.alternate ? (mapStmt(s.alternate) as t.Statement) : null,
      )
    return s
  }
  return stmts.map((s) => mapStmt(t.cloneNode(s, true) as t.Statement))
}
