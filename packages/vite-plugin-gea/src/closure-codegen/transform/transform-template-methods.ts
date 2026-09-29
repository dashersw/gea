import type { ClassMethod, Expression, IfStatement, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

/** Return the statements in `template() {...}` that precede the `return <jsx/>` line. */
export function extractPrecedingStatements(templateMethod: ClassMethod): Statement[] {
  const out: Statement[] = []
  for (const stmt of templateMethod.body.body) {
    if (t.isReturnStatement(stmt)) break
    out.push(stmt)
  }
  return out
}

function isJsx(node: any): boolean {
  return t.isJSXElement(node) || t.isJSXFragment(node)
}

/**
 * A root that picks its element with a condition: `c ? <A/> : <B/>`,
 * `c && <A/>`, and nestings of them. An arm may be `null` or `undefined` to
 * render nothing, but not every arm.
 */
export function isConditionalJsxRoot(node: any): boolean {
  if (t.isLogicalExpression(node, { operator: '&&' })) return isJsx(node.right) || isConditionalJsxRoot(node.right)
  if (!t.isConditionalExpression(node)) return false
  const arms = [node.consequent, node.alternate]
  const isNullish = (arm: any) => t.isNullLiteral(arm) || t.isIdentifier(arm, { name: 'undefined' })
  return arms.every((arm) => isJsx(arm) || isNullish(arm) || isConditionalJsxRoot(arm)) && !arms.every(isNullish)
}

/**
 * Fold a component body whose root is chosen by a condition into one
 * `return <>{…}</>`, which compiles to a reactive conditional slot:
 *
 *   `return c ? <A/> : <B/>`          → `return <>{c ? <A/> : <B/>}</>`
 *   `return c && <A/>`                → `return <>{c && <A/>}</>`
 *   `if (c) return <A/>; return <B/>` → `return <>{c ? <A/> : <B/>}</>`
 *
 * Guards fold as in `foldEarlyReturnGuards`, and may return a condition too.
 */
export function foldConditionalReturn(body: Statement[]): void {
  for (const stmt of body) {
    const ret: any = t.isIfStatement(stmt) && !stmt.alternate ? onlyStatement(stmt.consequent) : stmt
    if (t.isReturnStatement(ret) && isConditionalJsxRoot(ret.argument)) ret.argument = wrapInFragment(ret.argument)
    if (t.isReturnStatement(stmt)) break
  }
  foldEarlyReturnGuards(body)
}

function onlyStatement(stmt: Statement): Statement {
  return t.isBlockStatement(stmt) && stmt.body.length === 1 ? stmt.body[0] : stmt
}

function wrapInFragment(expr: Expression): Expression {
  return t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [t.jsxExpressionContainer(expr)])
}

/**
 * Rewrite early-return JSX guards into a reactive conditional expression.
 *
 * Pattern: `if (cond) return <A>; return <B>` → `return cond ? <A> : <B>`.
 * Without this, the early return is evaluated only at template-create time; the
 * conditional wouldn't re-run when `cond` changes. Folding it into a ternary
 * lets the walker recognise it as a conditional slot and wire the reactive
 * swap properly. Handles chained `if` guards too (each becomes a nested ternary).
 */
export function foldEarlyReturnGuards(body: Statement[]): void {
  // Find the final return-JSX index.
  let finalIdx = -1
  for (let i = body.length - 1; i >= 0; i--) {
    const s = body[i]
    if (t.isReturnStatement(s) && s.argument && (t.isJSXElement(s.argument) || t.isJSXFragment(s.argument))) {
      finalIdx = i
      break
    }
  }
  if (finalIdx < 0) return

  // First, locate any `if (cond) return <JSX>` guard earlier in the body.
  // If none, no fold — early out to match the simple path.
  let anyGuardIdx = -1
  for (let i = finalIdx - 1; i >= 0; i--) {
    if (isEarlyReturnGuard(body[i])) {
      anyGuardIdx = i
      break
    }
  }

  // Collect VariableDeclarations between the last guard and the final return
  // ONLY IF a guard exists. They get hoisted into the falsy-branch IIFE so
  // the main JSX can reference them after folding.
  let scanIdx = finalIdx - 1
  const hoistedStmts: any[] = []
  if (anyGuardIdx >= 0) {
    while (scanIdx > anyGuardIdx) {
      const s = body[scanIdx]
      if (t.isVariableDeclaration(s) || t.isExpressionStatement(s)) {
        hoistedStmts.unshift(s)
        scanIdx--
        continue
      }
      break
    }
  }

  let mainExpr: any = (body[finalIdx] as any).argument
  if (hoistedStmts.length > 0) {
    const block = t.blockStatement([...hoistedStmts, t.returnStatement(mainExpr)])
    const arrow: any = t.arrowFunctionExpression([], block)
    arrow.__geaHoistedIIFE = true
    mainExpr = t.callExpression(arrow, [])
  }

  // Walk backwards from scanIdx, folding `if (cond) return <JSX>` guards.
  let result: any = mainExpr
  let firstGuardIdx = finalIdx
  for (let i = scanIdx; i >= 0; i--) {
    const s = body[i]
    if (isEarlyReturnGuard(s)) {
      const ret = onlyStatement(s.consequent) as any
      result = t.conditionalExpression(s.test, ret.argument, result)
      firstGuardIdx = i
      continue
    }
    break
  }
  if (firstGuardIdx === finalIdx && hoistedStmts.length === 0) return
  // Wrap the ternary in a JSXFragment so extractTemplateJsx still recognises it
  // and compileJsxToBlock sees the ternary as a conditional slot.
  body.splice(firstGuardIdx, finalIdx - firstGuardIdx + 1, t.returnStatement(wrapInFragment(result)))
}

/** `if (cond) return <JSX>` or `if (cond) { return <JSX> }`, with no `else`. */
function isEarlyReturnGuard(s: Statement): s is IfStatement {
  if (!t.isIfStatement(s) || s.alternate) return false
  const ret = onlyStatement(s.consequent)
  return t.isReturnStatement(ret) && isJsx(ret.argument)
}
