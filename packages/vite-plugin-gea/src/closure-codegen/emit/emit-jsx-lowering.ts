import type { ClassMethod, Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { collectBindings, initializerNeedsLocal, type EmitContext } from './emit-context.ts'
import { compileJsxToBlock } from './emit-core.ts'
import { substituteBindings } from './emit-substitution.ts'

/**
 * `propsLocals` are the real locals left by `this.props` destructuring (see
 * bindPropsPattern). They are kept as they are instead of being inlined.
 */
export function buildCreateTemplateMethod(
  jsxRoot: any,
  ctx: EmitContext,
  preceding: Statement[] = [],
  templateSymbol = 'GEA_CREATE_TEMPLATE',
  propsLocals: Statement[] = [],
): ClassMethod {
  bindTemplateLocals(preceding, ctx, propsLocals)
  const jsxBlock = compileJsxToBlock(jsxRoot, ctx)
  const stmts = keptTemplateStatements(preceding, ctx, propsLocals).concat(jsxBlock.body)
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
 * Bind the locals declared before `return` in a template() body so reads
 * inline their initializer. A local whose initializer constructs something or
 * writes state stays a real variable instead, created once per instance, as
 * do `propsLocals`.
 */
export function bindTemplateLocals(preceding: Statement[], ctx: EmitContext, propsLocals: Statement[] = []): void {
  collectBindings(
    preceding.filter((s) => !propsLocals.includes(s)),
    ctx.bindings,
    initializerNeedsLocal,
  )
}

/**
 * The statements before `return` that stay in the emitted template body.
 * Destructuring declarations are dropped once their names have been inlined.
 * Everything else stays in scope with bindings substituted, so
 * `const taskIds = column.taskIds` becomes
 * `const taskIds = this.props.column.taskIds` (or whatever the binding maps to).
 */
export function keptTemplateStatements(
  preceding: Statement[],
  ctx: EmitContext,
  propsLocals: Statement[] = [],
): Statement[] {
  return preceding
    .filter((s) => {
      if (t.isReturnStatement(s) || t.isThrowStatement(s)) return false
      if (t.isVariableDeclaration(s) && !propsLocals.includes(s)) {
        const inlined = s.declarations.every(
          (d) => (t.isObjectPattern(d.id) || t.isArrayPattern(d.id)) && !(d.init && initializerNeedsLocal(d.init)),
        )
        if (inlined) return false
      }
      return true
    })
    .map((s) => substituteBindings(s, ctx.bindings))
    .map((s) => lowerJsxInStatement(s, ctx))
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

/**
 * Replace JSX nodes inside an expression with block-IIFE returns.
 *
 * `site`, when given, wraps each lowered JSX node that is evaluated directly by
 * the expression (not inside a nested function). Prop thunks use it to build
 * each JSX site once while the surrounding expression stays live.
 */
export function lowerJsxInExpression(expr: any, ctx: EmitContext, site?: (built: Expression) => Expression): any {
  if (!expr) return expr
  if (t.isJSXElement(expr) || t.isJSXFragment(expr)) {
    const block = compileJsxToBlock(expr, ctx)
    // `(() => { <block with return root> })()`
    const built = t.callExpression(t.arrowFunctionExpression([], block), [])
    return site ? site(built) : built
  }
  const lower = (e: any): any => lowerJsxInExpression(e, ctx, site)
  if (t.isConditionalExpression(expr)) {
    return {
      ...expr,
      test: lower(expr.test),
      consequent: lower(expr.consequent),
      alternate: lower(expr.alternate),
    }
  }
  if (t.isLogicalExpression(expr) || t.isBinaryExpression(expr)) {
    return { ...expr, left: lower(expr.left), right: lower(expr.right) }
  }
  if (t.isCallExpression(expr) || t.isOptionalCallExpression(expr)) {
    return {
      ...expr,
      callee: lower(expr.callee),
      arguments: expr.arguments.map((a: any) => lower(a)),
    }
  }
  if (t.isMemberExpression(expr) || t.isOptionalMemberExpression(expr)) {
    return {
      ...expr,
      object: lower(expr.object),
      property: expr.computed ? lower(expr.property) : expr.property,
    }
  }
  if (t.isUnaryExpression(expr) || t.isUpdateExpression(expr)) {
    return { ...expr, argument: lower(expr.argument) }
  }
  if (t.isArrayExpression(expr)) {
    return { ...expr, elements: expr.elements.map((e: any) => (e ? lower(e) : e)) }
  }
  if (t.isObjectExpression(expr)) {
    return {
      ...expr,
      properties: expr.properties.map((p: any) => (t.isObjectProperty(p) ? { ...p, value: lower(p.value) } : p)),
    }
  }
  if (t.isTemplateLiteral(expr)) {
    return { ...expr, expressions: expr.expressions.map((e: any) => lower(e)) }
  }
  if (t.isAssignmentExpression(expr)) {
    return { ...expr, right: lower(expr.right) }
  }
  if (t.isSequenceExpression(expr)) {
    return { ...expr, expressions: expr.expressions.map((e: any) => lower(e)) }
  }
  if (t.isNewExpression(expr)) {
    return {
      ...expr,
      callee: lower(expr.callee),
      arguments: expr.arguments.map((a: any) => lower(a)),
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
