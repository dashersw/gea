import type { BlockStatement, Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { PatchRowPlan } from './keyed-list-patch-scan.ts'
import { cloneAndSubstituteIdents, extractWalkFromExpr, rewriteWalksWithPrefixPiggyback } from './keyed-list-walks.ts'

export function applyPatchRowPlan(
  block: BlockStatement,
  plan: PatchRowPlan,
  itemName: string,
  idxParam: any,
): Expression {
  const keep2 = pruneExtractedCreateItemStatements(plan.keep, plan.deadBindings)
  const returnIdx = findReturnIndex(keep2)
  const subst: Record<string, string> = { el: 'root' }
  if (itemName !== 'item') subst.item = itemName
  const declWalks = collectDeclWalks(keep2)
  const inlineStmts = plan.initStmts.map((stmt) => {
    const cloned = cloneAndSubstituteIdents(stmt, subst) as Statement
    return rewriteWalksWithPrefixPiggyback(cloned, declWalks) as Statement
  })

  keep2.splice(returnIdx, 0, ...inlineStmts)
  block.body = keep2

  const elParam = t.identifier('el')
  const itemParam = t.identifier('item')
  const prevParam = t.identifier('prev')
  const idxId = t.isIdentifier(idxParam) ? idxParam : t.identifier('idx')
  const params = [elParam, itemParam]
  if (referencesIdentifier(plan.patchStmts, prevParam.name)) params.push(prevParam)
  if (referencesIdentifier(plan.patchStmts, idxId.name)) params.push(idxId)
  return t.arrowFunctionExpression(params, t.blockStatement(plan.patchStmts))
}

function referencesIdentifier(node: any, name: string): boolean {
  let found = false
  const visit = (current: any): void => {
    if (found || !current || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (const child of current) visit(child)
      return
    }
    if (t.isIdentifier(current, { name })) {
      found = true
      return
    }
    for (const key of Object.keys(current)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(current[key])
    }
  }
  visit(node)
  return found
}

function pruneExtractedCreateItemStatements(keep: Statement[], deadBindings: Set<string>): Statement[] {
  const keep2: Statement[] = []
  for (const stmt of keep) {
    if (t.isVariableDeclaration(stmt)) {
      const kept = stmt.declarations.filter((d) => !(t.isIdentifier(d.id) && deadBindings.has(d.id.name)))
      if (kept.length === 0) continue
      if (kept.length !== stmt.declarations.length) {
        keep2.push(t.variableDeclaration(stmt.kind, kept))
        continue
      }
    }
    if (isDeadReplaceWith(stmt, deadBindings)) continue
    keep2.push(stmt)
  }
  return keep2
}

function isDeadReplaceWith(stmt: Statement, deadBindings: Set<string>): boolean {
  if (!t.isExpressionStatement(stmt) || !t.isCallExpression(stmt.expression)) return false
  const call = stmt.expression
  return (
    t.isMemberExpression(call.callee) &&
    t.isIdentifier(call.callee.property, { name: 'replaceWith' }) &&
    call.arguments.length === 1 &&
    t.isIdentifier(call.arguments[0]) &&
    deadBindings.has((call.arguments[0] as any).name)
  )
}

function findReturnIndex(stmts: Statement[]): number {
  for (let i = stmts.length - 1; i >= 0; i--) {
    if (t.isReturnStatement(stmts[i])) return i
  }
  return stmts.length
}

function collectDeclWalks(stmts: Statement[]): { name: string; walk: number[] }[] {
  const declWalks: { name: string; walk: number[] }[] = []
  for (const stmt of stmts) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const d of stmt.declarations) {
      if (!t.isIdentifier(d.id) || !d.init) continue
      const w = extractWalkFromExpr(d.init)
      if (w) declWalks.push({ name: d.id.name, walk: w })
    }
  }
  return declWalks
}
