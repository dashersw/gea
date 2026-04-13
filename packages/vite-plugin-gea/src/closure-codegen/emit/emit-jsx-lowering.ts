import type { ClassMethod, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { collectBindings, type EmitContext } from './emit-context.ts'
import { compileJsxToBlock } from './emit-core.ts'
import { substituteBindings } from './emit-substitution.ts'

export function buildCreateTemplateMethod(
  jsxRoot: any,
  ctx: EmitContext,
  preceding?: Statement[],
  templateSymbol = 'GEA_CREATE_TEMPLATE',
): ClassMethod {
  if (preceding && preceding.length > 0) collectBindings(preceding, ctx.bindings)
  const jsxBlock = compileJsxToBlock(jsxRoot, ctx)
  // Drop destructuring declarations from preceding — their identifiers have been inlined.
  // Keep other statements (non-destructuring consts, function decls) so they remain in scope.
  // ALSO substitute bindings into them so `const taskIds = column.taskIds` becomes
  // `const taskIds = this.props.column.taskIds` (or whatever the binding maps to).
  const keptPreceding = (preceding ?? [])
    .filter((s) => {
      if (t.isReturnStatement(s) || t.isThrowStatement(s)) return false
      if (t.isVariableDeclaration(s)) {
        const allPatterns = s.declarations.every((d) => t.isObjectPattern(d.id) || t.isArrayPattern(d.id))
        if (allPatterns) return false
      }
      return true
    })
    .map((s) => substituteBindings(s, ctx.bindings))
    .map((s) => lowerJsxInStatement(s, ctx))
  const stmts = keptPreceding.concat(jsxBlock.body)
  return t.classMethod(
    'method',
    t.identifier(templateSymbol),
    [t.identifier('d')],
    t.blockStatement(stmts),
    true,
    false,
  )
}

/**
 * Walk a Statement tree and replace every JSX expression with the closure-
 * compiled equivalent (block IIFE returning a Node). Used for preceding
 * statements in `template() {...}` bodies that contain early-return JSX or
 * ternaries/conditionals with JSX branches.
 *
 * Returns the statement with JSX lowered (may be the same object if no JSX found).
 */
export function lowerJsxInStatement(stmt: any, ctx: EmitContext): any {
  if (!stmt) return stmt
  if (t.isReturnStatement(stmt)) {
    if (stmt.argument && (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument))) {
      const block = compileJsxToBlock(stmt.argument, ctx)
      return t.blockStatement(block.body)
    }
    return stmt.argument ? { ...stmt, argument: lowerJsxInExpression(stmt.argument, ctx) } : stmt
  }
  if (t.isIfStatement(stmt)) {
    return {
      ...stmt,
      test: lowerJsxInExpression(stmt.test, ctx),
      consequent: lowerJsxInStatement(stmt.consequent, ctx),
      alternate: stmt.alternate ? lowerJsxInStatement(stmt.alternate, ctx) : null,
    }
  }
  if (t.isBlockStatement(stmt)) {
    return { ...stmt, body: stmt.body.map((s: any) => lowerJsxInStatement(s, ctx)) }
  }
  if (t.isExpressionStatement(stmt)) {
    return { ...stmt, expression: lowerJsxInExpression(stmt.expression, ctx) }
  }
  if (t.isVariableDeclaration(stmt)) {
    return {
      ...stmt,
      declarations: stmt.declarations.map((d: any) => ({
        ...d,
        init: d.init ? lowerJsxInExpression(d.init, ctx) : null,
      })),
    }
  }
  if (t.isForStatement(stmt) || t.isForInStatement(stmt) || t.isForOfStatement(stmt)) {
    return { ...stmt, body: lowerJsxInStatement(stmt.body, ctx) }
  }
  if (t.isWhileStatement(stmt) || t.isDoWhileStatement(stmt)) {
    return { ...stmt, body: lowerJsxInStatement(stmt.body, ctx) }
  }
  if (t.isSwitchStatement(stmt)) {
    return {
      ...stmt,
      cases: stmt.cases.map((c: any) => ({
        ...c,
        consequent: c.consequent.map((s: any) => lowerJsxInStatement(s, ctx)),
      })),
    }
  }
  if (t.isTryStatement(stmt)) {
    return {
      ...stmt,
      block: lowerJsxInStatement(stmt.block, ctx),
      handler: stmt.handler ? { ...stmt.handler, body: lowerJsxInStatement(stmt.handler.body, ctx) } : null,
      finalizer: stmt.finalizer ? lowerJsxInStatement(stmt.finalizer, ctx) : null,
    }
  }
  return stmt
}

/** Recursive scan: does an AST subtree contain any JSXElement/JSXFragment? */
export function containsJsx(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return true
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    const v = (node as any)[k]
    if (Array.isArray(v)) {
      for (const x of v) if (containsJsx(x)) return true
    } else if (v && typeof v === 'object') {
      if (containsJsx(v)) return true
    }
  }
  return false
}

/** Replace JSX nodes inside an expression with block-IIFE returns. */
export function lowerJsxInExpression(expr: any, ctx: EmitContext): any {
  if (!expr) return expr
  if (t.isJSXElement(expr) || t.isJSXFragment(expr)) {
    const block = compileJsxToBlock(expr, ctx)
    // `(() => { <block with return root> })()`
    return t.callExpression(t.arrowFunctionExpression([], block), [])
  }
  if (t.isConditionalExpression(expr)) {
    return {
      ...expr,
      test: lowerJsxInExpression(expr.test, ctx),
      consequent: lowerJsxInExpression(expr.consequent, ctx),
      alternate: lowerJsxInExpression(expr.alternate, ctx),
    }
  }
  if (t.isLogicalExpression(expr) || t.isBinaryExpression(expr)) {
    return { ...expr, left: lowerJsxInExpression(expr.left, ctx), right: lowerJsxInExpression(expr.right, ctx) }
  }
  if (t.isCallExpression(expr) || t.isOptionalCallExpression(expr)) {
    return {
      ...expr,
      callee: lowerJsxInExpression(expr.callee, ctx),
      arguments: expr.arguments.map((a: any) => lowerJsxInExpression(a, ctx)),
    }
  }
  if (t.isMemberExpression(expr) || t.isOptionalMemberExpression(expr)) {
    return {
      ...expr,
      object: lowerJsxInExpression(expr.object, ctx),
      property: expr.computed ? lowerJsxInExpression(expr.property, ctx) : expr.property,
    }
  }
  if (t.isUnaryExpression(expr) || t.isUpdateExpression(expr)) {
    return { ...expr, argument: lowerJsxInExpression(expr.argument, ctx) }
  }
  if (t.isArrayExpression(expr)) {
    return { ...expr, elements: expr.elements.map((e: any) => (e ? lowerJsxInExpression(e, ctx) : e)) }
  }
  if (t.isObjectExpression(expr)) {
    return {
      ...expr,
      properties: expr.properties.map((p: any) =>
        t.isObjectProperty(p) ? { ...p, value: lowerJsxInExpression(p.value, ctx) } : p,
      ),
    }
  }
  if (t.isTemplateLiteral(expr)) {
    return { ...expr, expressions: expr.expressions.map((e: any) => lowerJsxInExpression(e, ctx)) }
  }
  if (t.isAssignmentExpression(expr)) {
    return { ...expr, right: lowerJsxInExpression(expr.right, ctx) }
  }
  if (t.isSequenceExpression(expr)) {
    return { ...expr, expressions: expr.expressions.map((e: any) => lowerJsxInExpression(e, ctx)) }
  }
  if (t.isNewExpression(expr)) {
    return {
      ...expr,
      callee: lowerJsxInExpression(expr.callee, ctx),
      arguments: expr.arguments.map((a: any) => lowerJsxInExpression(a, ctx)),
    }
  }
  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
    const body = t.isBlockStatement(expr.body)
      ? lowerJsxInStatement(expr.body, ctx)
      : lowerJsxInExpression(expr.body, ctx)
    return { ...expr, body }
  }
  return expr
}
