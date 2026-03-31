/**
 * gen-conditional-observers.ts
 *
 * Generates conditional-slot patch/registration methods and the
 * `__geaSwapStateChildren()` method for state-dependent child components.
 */

import { t } from '../utils/babel-interop.ts'
import { id, jsMethod } from 'eszter'

import type { ArrayMapBinding, ConditionalSlot } from '../ir/types.ts'

import {
  earlyReturnFalsyBindingName,
  optionalizeBindingRootInStatements,
  optionalizeMemberChainsFromBindingRoot,
  pruneDeadParamDestructuring,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
} from './ast-helpers.ts'
import { pruneUnusedSetupDestructuring } from './ast-helpers.ts'
import { inlineIntoConstructor, stripHtmlArrayMapJoinChainsInAst } from './gen-map-helpers.ts'

// ═══════════════════════════════════════════════════════════════════════════
// Conditional patch methods
// ═══════════════════════════════════════════════════════════════════════════

export function generateConditionalPatchMethods(
  classBody: t.ClassBody,
  slots: ConditionalSlot[],
  templatePropNames: Set<string>,
  wholeParamName?: string,
  earlyReturnGuard?: t.Expression,
  htmlArrayMapsToStrip?: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>[],
): void {
  const guardedRoot = earlyReturnGuard ? earlyReturnFalsyBindingName(earlyReturnGuard) : null
  const maybeOptStmts = (stmts: t.Statement[]) =>
    guardedRoot ? optionalizeBindingRootInStatements(stmts, guardedRoot) : stmts
  const maybeOptExpr = (e: t.Expression) => (guardedRoot ? optionalizeMemberChainsFromBindingRoot(e, guardedRoot) : e)
  const collectDeduped = (stmts: t.Statement[], seen: Set<string>, out: t.Statement[]) => {
    for (const stmt of stmts) {
      if (t.isVariableDeclaration(stmt)) {
        const decl = stmt.declarations[0]
        if (t.isIdentifier(decl.id)) {
          if (!seen.has(decl.id.name)) {
            seen.add(decl.id.name)
            out.push(stmt)
          }
        } else if (t.isObjectPattern(decl.id)) {
          const names = decl.id.properties
            .map((p) => (t.isObjectProperty(p) && t.isIdentifier(p.value) ? p.value.name : null))
            .filter(Boolean) as string[]
          const unseen = names.filter((n) => !seen.has(n))
          if (unseen.length === 0) continue
          const unseenSet = new Set(unseen)
          const filteredProps = decl.id.properties.filter(
            (p) => t.isObjectProperty(p) && t.isIdentifier(p.value) && unseenSet.has(p.value.name),
          )
          if (filteredProps.length === 0) continue
          unseen.forEach((n) => seen.add(n))
          if (filteredProps.length === decl.id.properties.length) {
            out.push(stmt)
          } else if (
            decl.init &&
            t.isMemberExpression(decl.init) &&
            t.isThisExpression(decl.init.object) &&
            t.isIdentifier(decl.init.property, { name: 'props' })
          ) {
            out.push(
              t.variableDeclaration(stmt.kind, [
                t.variableDeclarator(
                  t.objectPattern(filteredProps.map((p) => t.cloneNode(p, true) as t.ObjectProperty)),
                  t.cloneNode(decl.init, true) as t.Expression,
                ),
              ]),
            )
          } else {
            out.push(stmt)
          }
        } else {
          out.push(stmt)
        }
      } else {
        out.push(stmt)
      }
    }
  }
  const seenVarNames = new Set<string>()
  const allSetupStatements: t.Statement[] = []
  for (const slot of slots) {
    collectDeduped(slot.setupStatements, seenVarNames, allSetupStatements)
  }
  const seenHtmlVarNames = new Set<string>()
  const allHtmlSetupStatements: t.Statement[] = []
  for (const slot of slots) {
    collectDeduped(slot.htmlSetupStatements || slot.setupStatements, seenHtmlVarNames, allHtmlSetupStatements)
  }

  const rpExpr = (e: t.Expression) => replacePropRefsInExpression(e, templatePropNames, wholeParamName)
  const rpStmts = (s: t.Statement[]) => replacePropRefsInStatements(s, templatePropNames, wholeParamName)

  const rewrittenCondExprs = slots.map((s) => rpExpr(t.cloneNode(s.conditionExpr, true)))
  const rewrittenCondExprsSafe = rewrittenCondExprs.map((e) => maybeOptExpr(e))
  const initSetup = maybeOptStmts(
    pruneDeadParamDestructuring(
      rpStmts(allSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)),
      rewrittenCondExprs,
    ),
  )
  const condAssignments: t.Statement[] = []
  for (let i = 0; i < slots.length; i++) {
    condAssignments.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.thisExpression(), t.identifier(`__geaCond_${i}`)),
          t.unaryExpression('!', t.unaryExpression('!', rewrittenCondExprsSafe[i])),
        ),
      ),
    )
  }

  const registerCondCalls: t.Statement[] = []
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const rewrittenCondExpr = rpExpr(t.cloneNode(slot.conditionExpr, true))
    const condSetup = maybeOptStmts(
      pruneDeadParamDestructuring(rpStmts(allSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)), [
        rewrittenCondExpr,
      ]),
    )

    const getCondBody: t.Statement[] = [...condSetup, t.returnStatement(maybeOptExpr(rewrittenCondExpr))]

    const buildHtmlFn = (htmlExpr?: t.Expression): t.Expression => {
      if (!htmlExpr) return t.nullLiteral()
      const htmlStmt = t.expressionStatement(rpExpr(t.cloneNode(htmlExpr, true)))
      if (htmlArrayMapsToStrip) {
        for (const arrayMap of htmlArrayMapsToStrip) {
          stripHtmlArrayMapJoinChainsInAst(htmlStmt, arrayMap)
        }
      }
      const clonedHtmlExpr = htmlStmt.expression
      const htmlSetup = maybeOptStmts(
        pruneDeadParamDestructuring(rpStmts(allHtmlSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement)), [
          clonedHtmlExpr,
        ]),
      )
      const htmlExprSafe = maybeOptExpr(clonedHtmlExpr)
      if (htmlSetup.length > 0) {
        return t.arrowFunctionExpression([], t.blockStatement([...htmlSetup, t.returnStatement(htmlExprSafe)]))
      }
      return t.arrowFunctionExpression([], htmlExprSafe)
    }

    registerCondCalls.push(
      t.expressionStatement(
        t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaRegisterCond')), [
          t.numericLiteral(i),
          t.stringLiteral(slot.slotId),
          t.arrowFunctionExpression([], t.blockStatement(getCondBody)),
          buildHtmlFn(slot.truthyHtmlExpr),
          buildHtmlFn(slot.falsyHtmlExpr),
        ]),
      ),
    )
  }

  const evalStatements = [...initSetup, ...condAssignments]
  const initBody: t.Statement[] =
    evalStatements.length > 0 ? [...evalStatements, ...registerCondCalls] : registerCondCalls

  inlineIntoConstructor(classBody, initBody)
}

// ═══════════════════════════════════════════════════════════════════════════
// State child swap
// ═══════════════════════════════════════════════════════════════════════════

export function generateStateChildSwapMethod(
  classBody: t.ClassBody,
  stateChildSlots: Array<{
    markerId: string
    childInstanceVar: string
    guardExpr: t.Expression
    dependencies?: Array<{ observeKey: string }>
  }>,
): void {
  const existing = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === '__geaSwapStateChildren',
  )
  if (existing) return

  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )

  const setupStatements: t.Statement[] = []
  if (templateMethod?.body) {
    const returnIndex = templateMethod.body.body.findIndex((s) => t.isReturnStatement(s))
    const stmts = returnIndex >= 0 ? templateMethod.body.body.slice(0, returnIndex) : []
    for (const stmt of stmts) {
      if (t.isExpressionStatement(stmt)) continue
      setupStatements.push(t.cloneNode(stmt, true) as t.Statement)
    }
  }

  const propsUpdateCalls: t.Statement[] = stateChildSlots
    .map((slot) => {
      const buildPropsName = `__buildProps_${slot.childInstanceVar.replace(/^_/, '')}`
      const hasBuildProps = classBody.body.some(
        (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === buildPropsName,
      )
      if (!hasBuildProps) return null!
      return t.expressionStatement(
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.thisExpression(), t.identifier(slot.childInstanceVar)),
            t.identifier('__geaUpdateProps'),
          ),
          [t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(buildPropsName)), [])],
        ),
      )
    })
    .filter(Boolean)

  const swapCalls = stateChildSlots.map((slot) => {
    const guardClone = t.cloneNode(slot.guardExpr, true)
    return t.expressionStatement(
      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSwapChild')), [
        t.stringLiteral(slot.markerId),
        t.logicalExpression(
          '&&',
          guardClone,
          t.memberExpression(t.thisExpression(), t.identifier(slot.childInstanceVar)),
        ),
      ]),
    )
  })

  const filteredSetup = pruneUnusedSetupDestructuring(setupStatements, [...propsUpdateCalls, ...swapCalls])

  const method = t.classMethod(
    'method',
    t.identifier('__geaSwapStateChildren'),
    [],
    t.blockStatement([...filteredSetup, ...propsUpdateCalls, ...swapCalls]),
  )
  classBody.body.push(method)
}
