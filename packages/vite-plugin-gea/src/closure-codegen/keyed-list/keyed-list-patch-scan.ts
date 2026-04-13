import type { BlockStatement, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { buildPatchWrite } from './keyed-list-patch-write.ts'
import { extractWalkAndKindsFromExpr, type WalkKind } from './keyed-list-walks.ts'

export interface PatchRowPlan {
  patchStmts: Statement[]
  initStmts: Statement[]
  keep: Statement[]
  deadBindings: Set<string>
}

export function collectPatchRowPlan(block: BlockStatement, itemName: string): PatchRowPlan {
  const walks = new Map<string, number[]>()
  const walkKindsMap = new Map<string, WalkKind[]>()
  for (const stmt of block.body) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const d of stmt.declarations) {
      if (!t.isIdentifier(d.id) || !d.init) continue
      const wk = extractWalkAndKindsFromExpr(d.init)
      if (wk) {
        walks.set(d.id.name, wk.walk)
        walkKindsMap.set(d.id.name, wk.walkKinds)
        continue
      }
      if (!t.isIdentifier(d.init)) continue
      const aliasedWalk = walks.get(d.init.name)
      if (!aliasedWalk) continue
      walks.set(d.id.name, aliasedWalk)
      const aliasedKinds = walkKindsMap.get(d.init.name)
      if (aliasedKinds) walkKindsMap.set(d.id.name, aliasedKinds)
    }
  }

  const nonDirectTextWalks = collectNonDirectTextWalks(block)
  const plan: PatchRowPlan = { patchStmts: [], initStmts: [], keep: [], deadBindings: new Set() }
  const stashSlots = new Map<string, number>()

  for (const stmt of block.body) {
    const call = extractReactiveCall(stmt)
    if (!call) {
      plan.keep.push(stmt)
      continue
    }
    const targetVar = call.args[0]
    if (!t.isIdentifier(targetVar)) {
      plan.keep.push(stmt)
      continue
    }
    const walkName = call.kind === 'text' ? 'marker' + targetVar.name.slice(1) : targetVar.name
    const walk = walks.get(walkName)
    if (!walk) {
      plan.keep.push(stmt)
      continue
    }

    const result = buildPatchWrite({
      kind: call.kind,
      args: call.args as any[],
      getterBody: call.getterBody,
      targetName: targetVar.name,
      walkName,
      walk,
      walkKinds: walkKindsMap.get(walkName),
      itemName,
      nonDirectTextWalks,
      stashSlots,
    })
    if (result.kind === 'keep') plan.keep.push(stmt)
    else if (result.kind === 'write') {
      plan.patchStmts.push(result.patchStmt)
      plan.initStmts.push(result.initStmt)
      for (const name of result.deadBindings) plan.deadBindings.add(name)
    }
  }

  return plan
}

function collectNonDirectTextWalks(block: BlockStatement): Set<string> {
  const nonDirectTextWalks = new Set<string>()
  for (const stmt of block.body) {
    if (!t.isExpressionStatement(stmt) || !t.isCallExpression(stmt.expression)) continue
    const call = stmt.expression
    if (!t.isMemberExpression(call.callee) || !t.isIdentifier(call.callee.property, { name: 'replaceWith' })) continue
    if (t.isIdentifier(call.callee.object)) nonDirectTextWalks.add(call.callee.object.name)
  }
  return nonDirectTextWalks
}

function extractReactiveCall(
  stmt: Statement,
): { kind: 'text' | 'attr' | 'value'; args: any[]; getterBody: any } | null {
  if (!t.isExpressionStatement(stmt) || !t.isCallExpression(stmt.expression)) return null
  const call = stmt.expression
  if (!t.isIdentifier(call.callee)) return null
  const name = call.callee.name
  const kind =
    name === 'reactiveText' || name === 'reactiveTextValue'
      ? 'text'
      : name === 'reactiveAttr'
        ? 'attr'
        : name === 'reactiveValue' || name === 'reactiveValueRead'
          ? 'value'
          : null
  if (!kind) return null
  const args = call.arguments as any[]
  const getterArg = kind === 'attr' ? args[4] : args[3]
  if (!t.isArrowFunctionExpression(getterArg) || t.isBlockStatement((getterArg as any).body)) return null
  return { kind, args, getterBody: (getterArg as any).body }
}
