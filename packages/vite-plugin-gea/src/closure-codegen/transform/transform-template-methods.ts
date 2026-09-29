import type { ClassMethod, Expression, IfStatement, ReturnStatement, Statement } from '@babel/types'

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
 * Fold a function component body whose root is chosen by a condition into
 * one `return <>{…}</>`, which compiles to a reactive conditional slot:
 *
 *   `return c ? <A/> : <B/>`          → `return <>{c ? <A/> : <B/>}</>`
 *   `return c && <A/>`                → `return <>{c && <A/>}</>`
 *   `if (c) return <A/>; return <B/>` → `return <>{c ? <A/> : <B/>}</>`
 *
 * A guard may return a condition, or declare locals in a block before its
 * return. The statements after a guard move into its falsy branch, an IIFE
 * tagged `__geaHoistedIIFE`, so they run only when that branch renders;
 * `buildBranchFn` binds their locals there. Folding stops at a statement
 * that returns any other way, which stays as written.
 */
export function foldConditionalReturn(body: Statement[]): void {
  const finalIdx = body.findIndex((s) => t.isReturnStatement(s))
  if (finalIdx < 0) return
  const final = body[finalIdx] as ReturnStatement
  let result = branchRoot(final.argument!)
  let firstGuardIdx = finalIdx
  let pending: Statement[] = []
  for (let i = finalIdx - 1; i >= 0; i--) {
    const stmt = body[i]
    const guard = guardBranch(stmt)
    if (guard) {
      result = t.conditionalExpression(guard.test, guard.branch, withLocals(pending, result))
      firstGuardIdx = i
      pending = []
      continue
    }
    // A function declaration is visible to the guards above it, so it can't
    // move into a branch.
    if (t.isFunctionDeclaration(stmt) || containsReturn(stmt)) break
    pending.unshift(stmt)
  }
  if (firstGuardIdx === finalIdx) final.argument = result
  else body.splice(firstGuardIdx, finalIdx - firstGuardIdx + 1, t.returnStatement(wrapInFragment(result)))
}

/**
 * The test and branch of `if (c) return <A/>`, or of a block that declares
 * `const` locals before its return: `if (c) { const x = …; return <A/> }`.
 */
function guardBranch(stmt: Statement): { test: Expression; branch: Expression } | null {
  if (!t.isIfStatement(stmt) || stmt.alternate) return null
  const stmts = t.isBlockStatement(stmt.consequent) ? stmt.consequent.body : [stmt.consequent]
  const ret = stmts[stmts.length - 1]
  if (!t.isReturnStatement(ret) || !(isJsx(ret.argument) || isConditionalJsxRoot(ret.argument))) return null
  const locals = stmts.slice(0, -1)
  // A reassigned block-scoped `let` would be inlined like a `const`.
  const unsafe = (s: Statement) =>
    t.isFunctionDeclaration(s) || containsReturn(s) || (t.isVariableDeclaration(s) && s.kind !== 'const')
  if (locals.some(unsafe)) return null
  return { test: stmt.test, branch: withLocals(locals, branchRoot(ret.argument!)) }
}

/** `root`, or an IIFE that runs `stmts` first; `buildBranchFn` compiles either. */
function withLocals(stmts: Statement[], root: Expression): Expression {
  if (stmts.length === 0) return root
  const arrow: any = t.arrowFunctionExpression([], t.blockStatement([...stmts, t.returnStatement(branchRoot(root))]))
  arrow.__geaHoistedIIFE = true
  return t.callExpression(arrow, [])
}

/** JSX stays as is; a condition is wrapped so it compiles to a conditional slot. */
function branchRoot(expr: Expression): Expression {
  return isJsx(expr) ? expr : wrapInFragment(expr)
}

/** True if `node` has a `return`, not counting nested functions. */
function containsReturn(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isFunction(node)) return false
  if (t.isReturnStatement(node)) return true
  if (Array.isArray(node)) return node.some(containsReturn)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (containsReturn(node[key])) return true
  }
  return false
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
