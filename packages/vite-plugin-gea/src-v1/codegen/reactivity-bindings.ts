/**
 * reactivity-bindings.ts
 *
 * Prop binding patch statement generation, store observer key collection,
 * guard state key analysis, and component getter store deps scanning.
 *
 * Extracted from gen-reactivity.ts applyStaticReactivity().
 */

import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { id } from 'eszter'

import type { PathParts, PropBinding } from '../ir/types.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'
import type { AnalysisResult } from '../analyze/analyzer.ts'

import { emitPatch } from '../emit/registry.ts'
import { BOOLEAN_HTML_ATTRS } from '../ir/constants.ts'

import {
  isAlwaysStringExpression,
  isWhitespaceFree,
} from './jsx-utils.ts'
import {
  buildObserveKey,
  resolvePath,
} from './member-chain.ts'
import {
  pruneDeadParamDestructuring,
  derivedExprGuardsValueWhenNullish,
  expressionAccessesValueProperties,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
  replaceThisPropsRootWithValueParam,
} from './prop-ref-utils.ts'

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

// ═══════════════════════════════════════════════════════════════════════════
// buildPropBindingPatches — generate patch statements for each prop binding
// ═══════════════════════════════════════════════════════════════════════════

/** Merge `if (__el) if (cond) ...` into `if (__el && cond) ...` when there is no else. */
function wrapPatchWithElGuard(updateStmt: t.Statement): t.Statement {
  if (t.isIfStatement(updateStmt) && !updateStmt.alternate) {
    return t.ifStatement(t.logicalExpression('&&', t.identifier('__el'), updateStmt.test), updateStmt.consequent)
  }
  return t.ifStatement(t.identifier('__el'), updateStmt)
}

export interface PropBindingPatchResult {
  patchStatementsByBinding: Map<PropBinding, t.Statement[]>
  inlinePatchBodies: Map<string, t.Statement[]>
  storeKeyToBindings: Map<string, Set<PropBinding>>
  applied: boolean
}

export function buildPropBindingPatches(
  analysis: AnalysisResult,
  stateRefs: Map<string, StateRefMeta>,
  templatePropNames: Set<string>,
  templateWholeParam: string | undefined,
  buildCachedGetElementById: (idArg: t.Expression) => t.Expression,
): PropBindingPatchResult {
  let applied = false
  const patchStatementsByBinding = new Map<PropBinding, t.Statement[]>()
  for (const pb of analysis.propBindings) {
    const elExpr = pb.userIdExpr
      ? buildCachedGetElementById(t.cloneNode(pb.userIdExpr, true) as t.Expression)
      : pb.bindingId !== undefined
        ? buildCachedGetElementById(
            t.binaryExpression(
              '+',
              t.memberExpression(t.thisExpression(), t.identifier('id')),
              t.stringLiteral('-' + pb.bindingId),
            ),
          )
        : pb.selector === ':scope'
          ? t.memberExpression(t.thisExpression(), id('GEA_ELEMENT'), true)
          : t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('$')), [
              t.stringLiteral(pb.selector),
            ])
    const valueExpr = pb.expression && pb.setupStatements ? t.identifier('__boundValue') : t.identifier('value')

    // ── Delegate to emitter registry ─────────────────────────────
    const originalClassExpr = pb.expression && t.isExpression(pb.expression) ? pb.expression : valueExpr
    const isObjectClass = pb.type === 'class' && pb.expression && t.isObjectExpression(pb.expression)
    const emitterOpts: import('../emit/types.ts').EmitterOpts = {
      textNodeIndex: (pb as any).textNodeIndex,
      isChildrenProp: pb.propName === 'children' || !!pb.isChildrenProp,
      attributeName: pb.attributeName,
      isObjectClass: !!isObjectClass,
      canSkipClassCoercion:
        !isObjectClass &&
        pb.type === 'class' &&
        isAlwaysStringExpression(originalClassExpr as t.Expression) &&
        isWhitespaceFree(originalClassExpr as t.Expression),
      isBooleanAttr: pb.attributeName ? BOOLEAN_HTML_ATTRS.has(pb.attributeName) : false,
      isUrlAttr: pb.attributeName ? URL_ATTRS.has(pb.attributeName) : false,
    }
    const patchStmts = emitPatch(pb.type, t.identifier('__el'), valueExpr, emitterOpts)
    if (!patchStmts.length) continue
    const updateStmt = patchStmts.length === 1 ? patchStmts[0] : t.blockStatement(patchStmts)
    const useDerivedPropExpr = Boolean(pb.expression && pb.setupStatements)
    const elDecl = t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__el'), elExpr)])
    const corePatch: t.Statement[] = [elDecl]
    let derivedRewrittenExpr: t.Expression | undefined
    let derivedPrunedSetup: t.Statement[] = []
    if (useDerivedPropExpr) {
      const rewrittenSetup = replacePropRefsInStatements(
        pb.setupStatements!,
        templatePropNames,
        templateWholeParam,
      )
      let rewrittenExpr = replacePropRefsInExpression(pb.expression!, templatePropNames, templateWholeParam)
      rewrittenExpr = replaceThisPropsRootWithValueParam(rewrittenExpr, pb.propName)
      derivedRewrittenExpr = rewrittenExpr
      derivedPrunedSetup = pruneDeadParamDestructuring(rewrittenSetup, [rewrittenExpr])
      corePatch.push(...derivedPrunedSetup)
      corePatch.push(
        t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__boundValue'), rewrittenExpr)]),
      )
    }
    corePatch.push(wrapPatchWithElGuard(updateStmt))

    const nullishValue = t.logicalExpression(
      '||',
      t.binaryExpression('===', t.identifier('value'), t.nullLiteral()),
      t.binaryExpression('===', t.identifier('value'), t.identifier('undefined')),
    )
    const guardsNullishInExpr =
      Boolean(derivedRewrittenExpr) && derivedExprGuardsValueWhenNullish(derivedRewrittenExpr!)

    const needsValueNullishGuard =
      useDerivedPropExpr &&
      !guardsNullishInExpr &&
      expressionAccessesValueProperties(derivedRewrittenExpr!, derivedPrunedSetup)

    const blockStatements: t.Statement[] = needsValueNullishGuard
      ? [t.ifStatement(t.unaryExpression('!', nullishValue), t.blockStatement(corePatch))]
      : corePatch

    patchStatementsByBinding.set(pb, blockStatements)
    applied = true
  }

  // Group prop bindings by prop name
  const propBindingsByProp = new Map<string, typeof analysis.propBindings>()
  for (const pb of analysis.propBindings) {
    if (pb.stateOnly) continue
    const list = propBindingsByProp.get(pb.propName) ?? []
    list.push(pb)
    propBindingsByProp.set(pb.propName, list)
  }

  const inlinePatchBodies = new Map<string, t.Statement[]>()
  propBindingsByProp.forEach((bindings, propName) => {
    const statements: t.Statement[] = []
    for (const pb of bindings) {
      const blockStatements = patchStatementsByBinding.get(pb)
      if (blockStatements) {
        if (bindings.length === 1) {
          statements.push(...blockStatements.map((s) => t.cloneNode(s, true) as t.Statement))
        } else {
          statements.push(t.blockStatement(blockStatements.map((s) => t.cloneNode(s, true) as t.Statement)))
        }
      }
    }
    if (statements.length > 0) {
      inlinePatchBodies.set(propName, statements)
    }
  })

  // Collect store observe keys from prop binding expressions
  const storeKeyToBindings = new Map<string, Set<PropBinding>>()
  for (const pb of analysis.propBindings) {
    if (!pb.setupStatements?.length && !pb.expression) continue
    const nodesToScan: t.Statement[] = [
      ...(pb.setupStatements || []).map((s) => t.cloneNode(s, true) as t.Statement),
    ]
    if (pb.expression) {
      nodesToScan.push(t.expressionStatement(t.cloneNode(pb.expression, true) as t.Expression))
    }
    const scanProg = t.program(nodesToScan)
    const addToStoreKey = (observeKey: string) => {
      let bindings = storeKeyToBindings.get(observeKey)
      if (!bindings) {
        bindings = new Set()
        storeKeyToBindings.set(observeKey, bindings)
      }
      bindings.add(pb)
    }
    traverse(scanProg, {
      noScope: true,
      Identifier(path: NodePath<t.Identifier>) {
        if (
          path.parentPath &&
          t.isMemberExpression(path.parentPath.node) &&
          path.parentPath.node.object === path.node
        )
          return
        const ref = stateRefs.get(path.node.name)
        if (!ref || ref.kind !== 'local-destructured' || !ref.propName) return
        addToStoreKey(buildObserveKey([ref.propName]))
      },
      MemberExpression(path: NodePath<t.MemberExpression>) {
        const resolved = resolvePath(path.node, stateRefs)
        if (!resolved?.parts?.length) return
        if (!resolved.isImportedState && !resolved.storeVar && resolved.parts[0] === 'props') return
        const storeVar = resolved.isImportedState ? resolved.storeVar : undefined
        if (storeVar && resolved.parts.length === 1) {
          const storeRef = stateRefs.get(storeVar)
          const getterDepPaths = storeRef?.getterDeps?.get(resolved.parts[0])
          if (getterDepPaths && getterDepPaths.length > 0) {
            for (const depPath of getterDepPaths) {
              addToStoreKey(buildObserveKey(depPath, storeVar))
            }
            return
          }
        }
        const observeKey = buildObserveKey(resolved.parts, storeVar)
        addToStoreKey(observeKey)
      },
    })
  }

  // Deduplicate: when a store key has both stateOnly and non-stateOnly
  // bindings for the same element, keep only the stateOnly ones.
  for (const [, bindings] of storeKeyToBindings) {
    const hasStateOnly = [...bindings].some((b) => b.stateOnly)
    if (!hasStateOnly) continue
    for (const pb of bindings) {
      if (pb.stateOnly) continue
      const dup = [...bindings].some((b) => b.stateOnly && b.selector === pb.selector && b.type === pb.type)
      if (dup) bindings.delete(pb)
    }
  }

  return { patchStatementsByBinding, inlinePatchBodies, storeKeyToBindings, applied }
}

// ═══════════════════════════════════════════════════════════════════════════
// collectGuardStateKeys — guard state key analysis from template
// ═══════════════════════════════════════════════════════════════════════════

function expressionReferencesIdentifier(expr: t.Expression, name: string): boolean {
  let found = false
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      if (path.node.name !== name) return
      found = true
      path.stop()
    },
  })
  return found
}

export function collectGuardStateKeys(
  templateMethod: t.ClassMethod | undefined,
  stateRefs: Map<string, StateRefMeta>,
  stateProps: Map<string, PathParts>,
): Set<string> {
  const guardStateKeys = new Set<string>()
  if (!templateMethod || !t.isBlockStatement(templateMethod.body)) return guardStateKeys

  const tmplBody = templateMethod.body.body
  const returnIdx = tmplBody.findIndex((s) => t.isReturnStatement(s))
  if (returnIdx <= 0) return guardStateKeys

  for (let gi = 0; gi < returnIdx; gi++) {
    const stmt = tmplBody[gi]
    if (
      !t.isIfStatement(stmt) ||
      !(
        t.isReturnStatement(stmt.consequent) ||
        (t.isBlockStatement(stmt.consequent) && stmt.consequent.body.some((b) => t.isReturnStatement(b)))
      )
    )
      continue
    const guardAliasInits = new Map<string, t.Expression>()
    for (let si = 0; si < gi; si++) {
      const setupStmt = tmplBody[si]
      if (!t.isVariableDeclaration(setupStmt)) continue
      for (const decl of setupStmt.declarations) {
        if (!t.isIdentifier(decl.id) || !decl.init || !t.isExpression(decl.init)) continue
        guardAliasInits.set(decl.id.name, decl.init)
      }
    }
    const addGuardObserveKey = (resolved: {
      parts: PathParts | null
      isImportedState?: boolean
      storeVar?: string
    }) => {
      if (!resolved?.parts?.length) return
      if (!resolved.isImportedState) return
      const observeKey = buildObserveKey(resolved.parts, resolved.storeVar)
      guardStateKeys.add(observeKey)
      if (!stateProps.has(observeKey)) stateProps.set(observeKey, [...resolved.parts])
    }
    for (const [aliasName, init] of guardAliasInits) {
      if (!expressionReferencesIdentifier(stmt.test, aliasName)) continue
      if (
        !(
          t.isIdentifier(init) ||
          t.isMemberExpression(init) ||
          t.isThisExpression(init) ||
          t.isCallExpression(init)
        )
      )
        continue
      const resolvedAlias = resolvePath(init, stateRefs)
      if (resolvedAlias) addGuardObserveKey(resolvedAlias)
    }
    const resolveGuardStateExpr = (
      expr: t.Identifier | t.MemberExpression | t.ThisExpression | t.CallExpression,
      seen = new Set<string>(),
    ) => {
      const resolved = resolvePath(expr, stateRefs)
      if (resolved?.parts?.length && resolved.isImportedState) return resolved
      if (t.isIdentifier(expr) && !seen.has(expr.name)) {
        const init = guardAliasInits.get(expr.name)
        if (
          init &&
          (t.isIdentifier(init) ||
            t.isMemberExpression(init) ||
            t.isThisExpression(init) ||
            t.isCallExpression(init))
        ) {
          seen.add(expr.name)
          return resolveGuardStateExpr(init, seen)
        }
      }
      return null
    }
    const guardProg = t.program([t.expressionStatement(t.cloneNode(stmt.test, true) as t.Expression)])
    traverse(guardProg, {
      noScope: true,
      Identifier(idPath: NodePath<t.Identifier>) {
        if (
          t.isMemberExpression(idPath.parent) &&
          idPath.parent.property === idPath.node &&
          !idPath.parent.computed
        )
          return
        const resolved = resolveGuardStateExpr(idPath.node)
        if (!resolved) return
        addGuardObserveKey(resolved)
      },
    })
  }
  return guardStateKeys
}

// ═══════════════════════════════════════════════════════════════════════════
// collectComponentGetterStoreDeps — getter store deps for component reactivity
// ═══════════════════════════════════════════════════════════════════════════

function canInlineDynamicObserverKey(expr: t.Expression): boolean {
  let safe = true
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      safe = false
      path.stop()
    },
  })
  return safe
}

export function collectComponentGetterStoreDeps(
  classBody: t.ClassBody,
  stateRefs: Map<string, StateRefMeta>,
): {
  componentGetterStoreDeps: Map<
    string,
    Array<{ storeVar: string; pathParts: PathParts; dynamicKeyExpr?: t.Expression }>
  >
} {
  const componentGetterStoreDeps = new Map<
    string,
    Array<{ storeVar: string; pathParts: PathParts; dynamicKeyExpr?: t.Expression }>
  >()
  const getterLocalRefs = new Map<string, Set<string>>()
  const getterNames = new Set<string>()
  for (const member of classBody.body) {
    if (t.isClassMethod(member) && member.kind === 'get' && t.isIdentifier(member.key))
      getterNames.add(member.key.name)
  }
  for (const member of classBody.body) {
    if (!t.isClassMethod(member) || member.kind !== 'get' || !t.isIdentifier(member.key)) continue
    const getterName = member.key.name
    const depMap = new Map<string, { storeVar: string; pathParts: PathParts; dynamicKeyExpr?: t.Expression }>()
    const localRefs = new Set<string>()
    const program = t.program(member.body.body.map((s) => t.cloneNode(s, true) as t.Statement))
    traverse(program, {
      noScope: true,
      OptionalMemberExpression(mePath: NodePath<t.OptionalMemberExpression>) {
        const objectNode = mePath.node.object
        if (!t.isMemberExpression(objectNode)) return
        if (!t.isIdentifier(objectNode.object) || !t.isIdentifier(objectNode.property)) return
        const objName = objectNode.object.name
        const ref = stateRefs.get(objName)
        if (!ref || ref.kind !== 'imported') return
        if (!mePath.node.computed || !t.isExpression(mePath.node.property)) return
        if (!canInlineDynamicObserverKey(mePath.node.property)) return
        depMap.set(`${objName}.${objectNode.property.name}`, {
          storeVar: objName,
          pathParts: [objectNode.property.name],
          dynamicKeyExpr: t.cloneNode(mePath.node.property, true),
        })
      },
      MemberExpression(mePath: NodePath<t.MemberExpression>) {
        if (t.isThisExpression(mePath.node.object) && t.isIdentifier(mePath.node.property)) {
          const propName = mePath.node.property.name
          if (getterNames.has(propName) && propName !== getterName) localRefs.add(propName)
          return
        }
        if (
          t.isMemberExpression(mePath.node.object) &&
          t.isIdentifier(mePath.node.object.object) &&
          t.isIdentifier(mePath.node.object.property) &&
          mePath.node.computed &&
          t.isExpression(mePath.node.property)
        ) {
          const objName = mePath.node.object.object.name
          const ref = stateRefs.get(objName)
          if (ref && ref.kind === 'imported' && canInlineDynamicObserverKey(mePath.node.property)) {
            depMap.set(`${objName}.${mePath.node.object.property.name}`, {
              storeVar: objName,
              pathParts: [mePath.node.object.property.name],
              dynamicKeyExpr: t.cloneNode(mePath.node.property, true),
            })
            return
          }
        }
        if (!t.isIdentifier(mePath.node.object)) return
        const objName = mePath.node.object.name
        const ref = stateRefs.get(objName)
        if (!ref || ref.kind !== 'imported') return
        if (!t.isIdentifier(mePath.node.property)) return
        if (!depMap.has(`${objName}.${mePath.node.property.name}`)) {
          depMap.set(`${objName}.${mePath.node.property.name}`, {
            storeVar: objName,
            pathParts: [mePath.node.property.name],
          })
        }
      },
    })
    const deps = Array.from(depMap.values())
    if (deps.length > 0) componentGetterStoreDeps.set(member.key.name, deps)
    if (localRefs.size > 0) getterLocalRefs.set(member.key.name, localRefs)
  }
  // Propagate transitive deps
  let changed = true
  while (changed) {
    changed = false
    for (const [getterName, refs] of getterLocalRefs) {
      for (const refName of refs) {
        const refDeps = componentGetterStoreDeps.get(refName)
        if (!refDeps) continue
        const existing = componentGetterStoreDeps.get(getterName) || []
        for (const dep of refDeps) {
          const key = `${dep.storeVar}.${dep.pathParts.join('.')}:${dep.dynamicKeyExpr ? 'dyn' : 'plain'}`
          if (
            !existing.some(
              (e) => `${e.storeVar}.${e.pathParts.join('.')}:${e.dynamicKeyExpr ? 'dyn' : 'plain'}` === key,
            )
          ) {
            existing.push(dep)
            changed = true
          }
        }
        if (!componentGetterStoreDeps.has(getterName)) componentGetterStoreDeps.set(getterName, existing)
      }
    }
  }

  return { componentGetterStoreDeps }
}
