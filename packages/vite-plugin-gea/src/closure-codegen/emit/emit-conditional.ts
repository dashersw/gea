import type { Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { collectBindings, type EmitContext } from './emit-context.ts'
import { compileJsxToBlock } from './emit-core.ts'
import { substituteBindings } from './emit-substitution.ts'
import { buildMapBranchFn } from './emit-map-branch.ts'
import type { Slot } from '../generator.ts'
import { eagerTrackSkippedReads } from '../utils/path-helpers.ts'

export function emitConditionalSlot(slot: Slot, stmts: Statement[], ctx: EmitContext): void {
  const anchorId = t.identifier('anchor' + slot.index)

  const condFn = t.arrowFunctionExpression([], eagerTrackSkippedReads(substituteBindings(slot.expr, ctx.bindings)))
  const mkTrue = buildBranchFn(slot.payload.mkTrue, ctx)
  if (!slot.payload.mkFalse) {
    ctx.importsNeeded.add('conditionalTruthy')
    stmts.push(
      t.expressionStatement(
        t.callExpression(t.identifier('conditionalTruthy'), [
          t.memberExpression(anchorId, t.identifier('parentNode')),
          anchorId,
          t.identifier('d'),
          ctx.reactiveRoot,
          condFn,
          mkTrue,
        ]),
      ),
    )
    return
  }

  ctx.importsNeeded.add('conditional')
  const mkFalse = slot.payload.mkFalse ? buildBranchFn(slot.payload.mkFalse, ctx) : t.identifier('undefined')

  stmts.push(
    t.expressionStatement(
      t.callExpression(t.identifier('conditional'), [
        t.memberExpression(anchorId, t.identifier('parentNode')),
        anchorId,
        t.identifier('d'),
        ctx.reactiveRoot,
        condFn,
        mkTrue,
        mkFalse,
      ]),
    ),
  )
}

/**
 * A branch function: `(d) => <node>`. For nested JSX, recursively compile to its
 * own hoisted template + clone block.
 */
function buildBranchFn(branchExpr: any, ctx: EmitContext): Expression {
  if (!branchExpr || t.isNullLiteral(branchExpr) || t.isIdentifier(branchExpr, { name: 'undefined' })) {
    return t.arrowFunctionExpression(
      [t.identifier('d')],
      t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createComment')), [
        t.stringLiteral(''),
      ]),
    )
  }
  if (t.isStringLiteral(branchExpr)) {
    return t.arrowFunctionExpression(
      [t.identifier('d')],
      t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createTextNode')), [branchExpr]),
    )
  }
  if (t.isJSXElement(branchExpr) || t.isJSXFragment(branchExpr)) {
    // Recursive lowering: branch becomes its own template + clone block
    const block = compileJsxToBlock(branchExpr, ctx)
    return t.arrowFunctionExpression([t.identifier('d')], block)
  }
  // Compiler-emitted hoisted-const IIFE (tagged by foldEarlyReturnGuards).
  if (
    t.isCallExpression(branchExpr) &&
    branchExpr.arguments.length === 0 &&
    (branchExpr.callee as any).__geaHoistedIIFE &&
    t.isBlockStatement((branchExpr.callee as any).body)
  ) {
    const block = (branchExpr.callee as any).body as any
    const last = block.body[block.body.length - 1]
    if (
      last &&
      t.isReturnStatement(last) &&
      last.argument &&
      (t.isJSXElement(last.argument) || t.isJSXFragment(last.argument))
    ) {
      // Apply outer bindings to the hoisted initializers first.
      const hoisted = block.body.slice(0, -1).map((s: any) => substituteBindings(s, ctx.bindings))
      // Extend ctx.bindings with the hoisted consts so JSX references inline
      // through to the reactive source (otherwise a captured string/number
      // local would freeze the value at mount time).
      const saved = new Map(ctx.bindings)
      collectBindings(hoisted as any, ctx.bindings)
      let inner: any
      try {
        inner = compileJsxToBlock(last.argument as any, ctx)
      } finally {
        ctx.bindings.clear()
        for (const [k, v] of saved) ctx.bindings.set(k, v)
      }
      // Drop ALL VariableDeclarations. Every identifier in hoisted consts
      // has been registered via collectBindings (line 913) and gets inlined
      // into JSX slot expressions via substituteBindings — the kept `const`
      // statements would be dead code at best and eager-read hazards at
      // worst (they'd execute inside the branch factory, which runs inside
      // the enclosing withTracking scope). ExpressionStatements are kept
      // for side-effect preservation.
      const keptHoisted = hoisted.filter((s: any) => !t.isVariableDeclaration(s))
      const combined = t.blockStatement([...keptHoisted, ...inner.body])
      return t.arrowFunctionExpression([t.identifier('d')], combined)
    }
  }
  // Bare identifier / expression — substitute bindings and handle three cases:
  //  1. Identifier/MemberExpression: wrap in a text node (stringified).
  //  2. `xs.map(item => <jsx/>)`: emit a wrapped keyed-list.
  //  3. Anything else: empty comment placeholder.
  const substituted = substituteBindings(branchExpr, ctx.bindings)
  if (t.isIdentifier(substituted) || t.isMemberExpression(substituted)) {
    return t.arrowFunctionExpression(
      [t.identifier('d')],
      t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createTextNode')), [
        t.callExpression(t.identifier('String'), [substituted as Expression]),
      ]),
    )
  }
  // Detect `<sourceExpr>.map(<arrow>)` with a JSX body — emit an inline keyedList branch.
  if (
    t.isCallExpression(substituted) &&
    t.isMemberExpression(substituted.callee) &&
    !substituted.callee.computed &&
    t.isIdentifier(substituted.callee.property, { name: 'map' }) &&
    substituted.arguments.length >= 1 &&
    (t.isArrowFunctionExpression(substituted.arguments[0]) || t.isFunctionExpression(substituted.arguments[0]))
  ) {
    return buildMapBranchFn(substituted, ctx)
  }
  // Generic fallback: empty comment.
  return t.arrowFunctionExpression(
    [t.identifier('d')],
    t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createComment')), [
      t.stringLiteral(''),
    ]),
  )
}

/**
 * Build a branch fn for a bare `xs.map(item => <jsx/>)` expression. Creates a
 * `<span style="display:contents">` wrapper, inserts a comment anchor inside,
 * and wires `keyedList` to reconcile the list against that anchor. The span is
 * returned so `conditional` can insert it in one piece.
 */
