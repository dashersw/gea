import type { Expression } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

function cloneExpr(expr: Expression): Expression {
  return t.cloneNode(expr) as Expression
}

/**
 * Walk an expression tree and replace Identifier references that match a
 * binding with the bound expression (also recursively). Used to rewrite
 * JSX-expression member chains so their root is the real reactive source.
 * Returns a new expression; does not mutate input.
 */
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
  if (t.isIdentifier(expr)) {
    const b = bindings.get(expr.name)
    if (b) {
      // Recurse into the replacement so chained bindings resolve fully.
      // (E.g., `isDragOver → store.dragOverColumnId === column.id`, then
      // `column → this.props.column` — both get applied.)
      const scoped = new Map(bindings)
      scoped.delete(expr.name) // prevent infinite recursion if binding references same name
      return substituteBindings(cloneExpr(b), scoped)
    }
    return expr
  }
  if (t.isMemberExpression(expr)) {
    return {
      ...expr,
      object: substituteBindings(expr.object, bindings),
      // For computed member access `obj[expr]`, the property is an Expression
      // that may reference bindings too (e.g. `variants[props.variant || 'x']`).
      property: expr.computed ? substituteBindings(expr.property, bindings) : expr.property,
    }
  }
  if (t.isCallExpression(expr)) {
    return {
      ...expr,
      callee: substituteBindings(expr.callee, bindings),
      arguments: expr.arguments.map((a: any) => substituteBindings(a, bindings)),
    }
  }
  if (t.isBinaryExpression(expr) || t.isLogicalExpression(expr)) {
    return { ...expr, left: substituteBindings(expr.left, bindings), right: substituteBindings(expr.right, bindings) }
  }
  if (t.isConditionalExpression(expr)) {
    return {
      ...expr,
      test: substituteBindings(expr.test, bindings),
      consequent: substituteBindings(expr.consequent, bindings),
      alternate: substituteBindings(expr.alternate, bindings),
    }
  }
  if (t.isUnaryExpression(expr) || t.isUpdateExpression(expr)) {
    return { ...expr, argument: substituteBindings(expr.argument, bindings) }
  }
  if (t.isTemplateLiteral(expr)) {
    return { ...expr, expressions: expr.expressions.map((e: any) => substituteBindings(e, bindings)) }
  }
  if (t.isOptionalMemberExpression(expr)) {
    return {
      ...expr,
      object: substituteBindings(expr.object, bindings),
      property: expr.computed ? substituteBindings(expr.property, bindings) : expr.property,
    }
  }
  if (t.isOptionalCallExpression(expr)) {
    return {
      ...expr,
      callee: substituteBindings(expr.callee, bindings),
      arguments: expr.arguments.map((a: any) => substituteBindings(a, bindings)),
    }
  }
  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
    // Substitute inside function bodies, EXCEPT identifiers that are shadowed
    // by the function's own params. Build a shadow-aware binding set.
    const paramNames = new Set<string>()
    for (const p of expr.params) {
      if (t.isIdentifier(p)) paramNames.add(p.name)
      else if (t.isObjectPattern(p)) {
        for (const prop of p.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) paramNames.add(prop.value.name)
        }
      }
    }
    const shadowed = new Map(bindings)
    for (const k of paramNames) shadowed.delete(k)
    if (shadowed.size === 0) return expr
    return { ...expr, body: substituteBindings(expr.body, shadowed) }
  }
  if (t.isBlockStatement(expr)) {
    return { ...expr, body: expr.body.map((s: any) => substituteBindings(s, bindings)) }
  }
  if (t.isExpressionStatement(expr)) {
    return { ...expr, expression: substituteBindings(expr.expression, bindings) }
  }
  if (t.isReturnStatement(expr)) {
    return expr.argument ? { ...expr, argument: substituteBindings(expr.argument, bindings) } : expr
  }
  if (t.isIfStatement(expr)) {
    return {
      ...expr,
      test: substituteBindings(expr.test, bindings),
      consequent: substituteBindings(expr.consequent, bindings),
      alternate: expr.alternate ? substituteBindings(expr.alternate, bindings) : null,
    }
  }
  if (t.isVariableDeclaration(expr)) {
    return {
      ...expr,
      declarations: expr.declarations.map((d: any) => ({
        ...d,
        init: d.init ? substituteBindings(d.init, bindings) : null,
      })),
    }
  }
  if (t.isTryStatement(expr)) {
    return {
      ...expr,
      block: substituteBindings(expr.block, bindings),
      handler: expr.handler ? { ...expr.handler, body: substituteBindings(expr.handler.body, bindings) } : null,
      finalizer: expr.finalizer ? substituteBindings(expr.finalizer, bindings) : null,
    }
  }
  if (t.isForStatement(expr) || t.isForInStatement(expr) || t.isForOfStatement(expr)) {
    return { ...expr, body: substituteBindings(expr.body, bindings) }
  }
  if (t.isWhileStatement(expr) || t.isDoWhileStatement(expr)) {
    return { ...expr, test: substituteBindings(expr.test, bindings), body: substituteBindings(expr.body, bindings) }
  }
  if (t.isSwitchStatement(expr)) {
    return {
      ...expr,
      discriminant: substituteBindings(expr.discriminant, bindings),
      cases: expr.cases.map((c: any) => ({
        ...c,
        consequent: c.consequent.map((s: any) => substituteBindings(s, bindings)),
      })),
    }
  }
  if (t.isArrayExpression(expr)) {
    return { ...expr, elements: expr.elements.map((e: any) => (e ? substituteBindings(e, bindings) : e)) }
  }
  if (t.isObjectExpression(expr)) {
    return {
      ...expr,
      properties: expr.properties.map((p: any) =>
        t.isObjectProperty(p) ? { ...p, value: substituteBindings(p.value, bindings) } : p,
      ),
    }
  }
  if (t.isSpreadElement(expr)) {
    return { ...expr, argument: substituteBindings(expr.argument, bindings) }
  }
  if (t.isNewExpression(expr)) {
    return {
      ...expr,
      callee: substituteBindings(expr.callee, bindings),
      arguments: expr.arguments.map((a: any) => substituteBindings(a, bindings)),
    }
  }
  if (t.isSequenceExpression(expr)) {
    return { ...expr, expressions: expr.expressions.map((e: any) => substituteBindings(e, bindings)) }
  }
  if (t.isAssignmentExpression(expr)) {
    return { ...expr, right: substituteBindings(expr.right, bindings) }
  }
  if (t.isJSXElement(expr)) {
    // Walk JSX attributes and children so bare-identifier references (like
    // `id` in `{id}`) get substituted. Mainly useful for early-return JSX
    // that we leave for esbuild's _jsxDEV fallback.
    const newOpening = {
      ...expr.openingElement,
      attributes: expr.openingElement.attributes.map((a: any) => {
        if (
          t.isJSXAttribute(a) &&
          a.value &&
          t.isJSXExpressionContainer(a.value) &&
          !t.isJSXEmptyExpression(a.value.expression)
        ) {
          return { ...a, value: { ...a.value, expression: substituteBindings(a.value.expression, bindings) } }
        }
        return a
      }),
    }
    const newChildren = expr.children.map((c: any) => substituteBindings(c, bindings))
    return { ...expr, openingElement: newOpening, children: newChildren }
  }
  if (t.isJSXFragment(expr)) {
    return { ...expr, children: expr.children.map((c: any) => substituteBindings(c, bindings)) }
  }
  if (t.isJSXExpressionContainer(expr) && !t.isJSXEmptyExpression(expr.expression)) {
    return { ...expr, expression: substituteBindings(expr.expression, bindings) }
  }
  if (t.isJSXText(expr) || t.isJSXSpreadChild(expr) || t.isJSXEmptyExpression(expr)) {
    return expr
  }
  return expr
}

/**
 * Compile a JSX element/fragment into a clone-and-wire expression.
 *
 * Returns a BlockStatement that:
 *   - declares `const root = (_tpl<N>_root || (_tpl<N>_root = _tpl<N>_create())).cloneNode(true)`
 *   - wires all slots
 *   - returns `root`
 *
 * Side effect: adds the lazy template root cache to `ctx.templateDecls`.
 */
