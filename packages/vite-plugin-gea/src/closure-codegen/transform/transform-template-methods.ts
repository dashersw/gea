import type { ClassMethod, Statement } from '@babel/types'

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

/**
 * Rewrite early-return JSX guards into a reactive conditional expression.
 *
 * Pattern: `if (cond) return <A>; return <B>` → `return cond ? <A> : <B>`.
 * Without this, the early return is evaluated only at template-create time; the
 * conditional wouldn't re-run when `cond` changes. Folding it into a ternary
 * lets the walker recognise it as a conditional slot and wire the reactive
 * swap properly. Handles chained `if` guards too (each becomes a nested ternary).
 */
export function foldEarlyReturnGuards(templateMethod: ClassMethod): void {
  const body = templateMethod.body.body
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
    const s = body[i]
    if (
      t.isIfStatement(s) &&
      !s.alternate &&
      s.consequent &&
      ((t.isReturnStatement(s.consequent) &&
        s.consequent.argument &&
        (t.isJSXElement(s.consequent.argument) || t.isJSXFragment(s.consequent.argument))) ||
        (t.isBlockStatement(s.consequent) &&
          s.consequent.body.length === 1 &&
          t.isReturnStatement(s.consequent.body[0]) &&
          (s.consequent.body[0] as any).argument &&
          (t.isJSXElement((s.consequent.body[0] as any).argument) ||
            t.isJSXFragment((s.consequent.body[0] as any).argument))))
    ) {
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
    if (
      t.isIfStatement(s) &&
      !s.alternate &&
      s.consequent &&
      ((t.isReturnStatement(s.consequent) &&
        s.consequent.argument &&
        (t.isJSXElement(s.consequent.argument) || t.isJSXFragment(s.consequent.argument))) ||
        (t.isBlockStatement(s.consequent) &&
          s.consequent.body.length === 1 &&
          t.isReturnStatement(s.consequent.body[0]) &&
          (s.consequent.body[0] as any).argument &&
          (t.isJSXElement((s.consequent.body[0] as any).argument) ||
            t.isJSXFragment((s.consequent.body[0] as any).argument))))
    ) {
      const ret = t.isReturnStatement(s.consequent) ? s.consequent : (s.consequent as any).body[0]
      result = t.conditionalExpression(s.test as any, (ret as any).argument, result)
      firstGuardIdx = i
      continue
    }
    break
  }
  if (firstGuardIdx === finalIdx && hoistedStmts.length === 0) return
  // Wrap the ternary in a JSXFragment so extractTemplateJsx still recognises it
  // and compileJsxToBlock sees the ternary as a conditional slot.
  const frag = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [t.jsxExpressionContainer(result)])
  body.splice(firstGuardIdx, finalIdx - firstGuardIdx + 1, t.returnStatement(frag))
}
