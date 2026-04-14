import * as t from '@babel/types'
import type { SubstitutionMap } from '../analyze/index.js'
import { buildSubstitutionMap, scanDestructuringStatements, scanReactiveLocalConsts } from '../analyze/index.js'
import type { RuntimeHelper } from '../utils.js'
import { transformJSXElement, transformJSXFragment, transformPropItemAccess } from './jsx-element.js'
import { substituteExpression } from './jsx-expression.js'

interface EarlyReturnIf {
  index: number
  test: t.Expression
  jsxReturn: t.JSXElement | t.JSXFragment | null
}

/**
 * Apply substitution map to ALL identifiers in an AST node (not just JSX).
 * Replaces e.g. `column` → `__props.column` in regular JS code.
 */
function applySubsToNode(node: any, subs: SubstitutionMap): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) applySubsToNode(node[i], subs)
    return
  }
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    if (node.body) {
      if (node.body.type === 'BlockStatement') {
        for (const stmt of node.body.body) applySubsToNode(stmt, subs)
      } else {
        substituteExpression(node.body, subs)
      }
    }
    return
  }
  if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations) {
      if (decl.init) decl.init = substituteExpression(decl.init, subs)
    }
    return
  }
  if (node.type === 'ExpressionStatement' && node.expression) {
    node.expression = substituteExpression(node.expression, subs)
    return
  }
  if (node.type === 'ReturnStatement' && node.argument) {
    node.argument = substituteExpression(node.argument, subs)
    return
  }
  if (node.type === 'IfStatement') {
    node.test = substituteExpression(node.test, subs)
    if (node.consequent) applySubsToNode(node.consequent, subs)
    if (node.alternate) applySubsToNode(node.alternate, subs)
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
    applySubsToNode(node[key], subs)
  }
}

/**
 * Transform a class Component's template() method:
 * 1. Process template params (destructured props → __props substitution)
 * 2. Scan body for destructuring from `this` and reactive stores
 * 3. Apply substitution to JSX
 * 4. Rename to __createTemplate(), add __props setup, remove params
 */
export function transformClassComponent(
  classBody: t.ClassBody,
  reactiveSources: Set<string>,
  usedHelpers: Set<RuntimeHelper>,
  templateDeclarations?: t.Statement[],
  templateCounter?: { value: number },
  poolCounter?: { value: number },
): void {
  for (const member of classBody.body) {
    if (!t.isClassMethod(member)) continue
    if (!t.isIdentifier(member.key, { name: 'template' })) continue

    const subs: SubstitutionMap = new Map()
    const body = member.body

    // 1. Process template params
    if (member.params.length > 0) {
      const param = member.params[0]
      if (t.isObjectPattern(param)) {
        const paramSubs = buildSubstitutionMap(param, '__props')
        for (const [k, v] of paramSubs) subs.set(k, v)
      } else if (t.isIdentifier(param)) {
        // Named param like `template(props)` — map to __props
        subs.set(param.name, t.identifier('__props'))
      }
    }

    // 2. Scan for destructuring from this and reactive sources
    const { map: bodySubs, indicesToRemove } = scanDestructuringStatements(
      body.body,
      reactiveSources,
    )
    for (const [k, v] of bodySubs) subs.set(k, v)

    // 3. Find the return statement with JSX
    let returnIdx = -1
    let returnStmt: t.ReturnStatement | null = null
    for (let i = 0; i < body.body.length; i++) {
      if (t.isReturnStatement(body.body[i])) {
        returnIdx = i
        returnStmt = body.body[i] as t.ReturnStatement
        break
      }
    }

    if (!returnStmt || !returnStmt.argument) continue

    // 3b. Scan for reactive local const declarations to inline
    const { map: localSubs, indicesToRemove: localIndicesToRemove } = scanReactiveLocalConsts(
      body.body,
      reactiveSources,
      subs,
      substituteExpression,
      indicesToRemove,
      returnIdx,
    )
    for (const [k, v] of localSubs) subs.set(k, v)
    for (const idx of localIndicesToRemove) indicesToRemove.add(idx)

    // 3c. Detect early-return if-statements: if (cond) return <JSX>
    const earlyReturnIfs: EarlyReturnIf[] = []

    for (let i = 0; i < body.body.length; i++) {
      if (i >= returnIdx) break
      if (indicesToRemove.has(i)) continue
      const stmt = body.body[i]
      if (!t.isIfStatement(stmt)) continue
      if (stmt.alternate) continue // only simple `if (...) return`

      let retArg: t.Expression | null | undefined = undefined
      const cons = stmt.consequent
      if (t.isBlockStatement(cons)) {
        const lastStmt = cons.body[cons.body.length - 1]
        if (t.isReturnStatement(lastStmt)) retArg = lastStmt.argument ?? null
      } else if (t.isReturnStatement(cons)) {
        retArg = cons.argument ?? null
      }

      if (retArg === undefined) continue

      // Unwrap parens
      let arg = retArg
      if (arg && t.isParenthesizedExpression(arg)) arg = arg.expression

      if (arg && (t.isJSXElement(arg) || t.isJSXFragment(arg))) {
        earlyReturnIfs.push({ index: i, test: stmt.test, jsxReturn: arg })
      } else if (!arg || t.isNullLiteral(arg)) {
        earlyReturnIfs.push({ index: i, test: stmt.test, jsxReturn: null })
      }
    }

    // The return argument might be a JSXElement or JSXFragment (possibly wrapped in parens)
    let jsxElement: t.JSXElement | t.JSXFragment | null = null
    if (t.isJSXElement(returnStmt.argument) || t.isJSXFragment(returnStmt.argument)) {
      jsxElement = returnStmt.argument
    } else if (
      t.isParenthesizedExpression(returnStmt.argument) &&
      (t.isJSXElement(returnStmt.argument.expression) || t.isJSXFragment(returnStmt.argument.expression))
    ) {
      jsxElement = returnStmt.argument.expression
    }

    if (!jsxElement) continue

    // 4. Transform JSX
    const ctx = {
      subs,
      usedHelpers,
      elementCounter: { value: 0 },
      anchorCounter: { value: 0 },
      compCounter: { value: 0 },
      templateDeclarations: templateDeclarations || [],
      templateCounter: templateCounter || { value: 0 },
      poolCounter: poolCounter || { value: 0 },
    }

    const [stmts, rootId] = t.isJSXFragment(jsxElement)
      ? transformJSXFragment(jsxElement, ctx)
      : transformJSXElement(jsxElement as t.JSXElement, ctx)

    // 4b. Handle early-return if-statements → reactive conditional()
    if (earlyReturnIfs.length > 0) {
      const er = earlyReturnIfs[0]
      const earlyIndices = new Set(earlyReturnIfs.map(e => e.index))
      usedHelpers.add('conditional')

      // Apply substitution to condition
      const condExpr = substituteExpression(er.test as t.Expression, subs)

      // Transform early return's JSX
      let earlyStmts: t.Statement[] = []
      let earlyRootId: t.Expression

      if (er.jsxReturn) {
        // Reset counters for the early-return branch scope
        ctx.elementCounter = { value: 0 }
        ctx.anchorCounter = { value: 0 }
        ctx.compCounter = { value: 0 }

        const [es, eid] = t.isJSXFragment(er.jsxReturn)
          ? transformJSXFragment(er.jsxReturn, ctx)
          : transformJSXElement(er.jsxReturn as t.JSXElement, ctx)
        earlyStmts = es
        earlyRootId = eid
        transformPropItemAccess(earlyStmts, usedHelpers)
      } else {
        // null return — empty comment node
        earlyRootId = t.callExpression(
          t.memberExpression(t.identifier('document'), t.identifier('createComment')),
          [t.stringLiteral('')],
        )
      }

      // Early return branch: () => { ...earlyStmts; return earlyRootId }
      const earlyBranch = t.arrowFunctionExpression(
        [],
        t.blockStatement([...earlyStmts, t.returnStatement(earlyRootId)]),
      )

      // Main content branch: kept statements after early return + main JSX
      const mainBranchBody: t.Statement[] = []
      for (let i = 0; i < body.body.length; i++) {
        if (i === returnIdx) continue
        if (indicesToRemove.has(i)) continue
        if (earlyIndices.has(i)) continue
        if (i <= er.index) continue // pre-early-return statements go outside
        if (subs.size > 0) applySubsToNode(body.body[i], subs)
        mainBranchBody.push(body.body[i])
      }
      transformPropItemAccess(stmts, usedHelpers)
      mainBranchBody.push(...stmts)
      mainBranchBody.push(t.returnStatement(rootId))
      const mainBranch = t.arrowFunctionExpression([], t.blockStatement(mainBranchBody))

      // Build new method body
      const newBodyStmts: t.Statement[] = []

      // Add `const __props = this[GEA_PROPS]` at the top
      usedHelpers.add('GEA_PROPS')
      newBodyStmts.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('__props'),
            t.memberExpression(t.thisExpression(), t.identifier('GEA_PROPS'), true),
          ),
        ]),
      )

      // Statements before the early return (outside the conditional)
      for (let i = 0; i < er.index; i++) {
        if (i === returnIdx) continue
        if (indicesToRemove.has(i)) continue
        if (subs.size > 0) applySubsToNode(body.body[i], subs)
        newBodyStmts.push(body.body[i])
      }

      // Fragment + anchor + conditional
      const fragId = t.identifier('__frag')
      const condAnchorId = t.identifier('__condAnchor')

      newBodyStmts.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(fragId,
            t.callExpression(
              t.memberExpression(t.identifier('document'), t.identifier('createDocumentFragment')),
              [],
            ),
          ),
        ]),
        t.variableDeclaration('const', [
          t.variableDeclarator(condAnchorId,
            t.callExpression(
              t.memberExpression(t.identifier('document'), t.identifier('createComment')),
              [t.stringLiteral('')],
            ),
          ),
        ]),
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(fragId, t.identifier('appendChild')),
            [condAnchorId],
          ),
        ),
        t.expressionStatement(
          t.callExpression(t.identifier('conditional'), [
            fragId,
            condAnchorId,
            t.arrowFunctionExpression([], condExpr),
            earlyBranch,
            mainBranch,
          ]),
        ),
      )

      newBodyStmts.push(t.returnStatement(fragId))

      // Rename method to [GEA_CREATE_TEMPLATE] and update
      usedHelpers.add('GEA_CREATE_TEMPLATE')
      member.key = t.identifier('GEA_CREATE_TEMPLATE')
      member.computed = true
      member.params = []
      member.body = t.blockStatement(newBodyStmts)

      if ((member as any).returnType) {
        ;(member as any).returnType = null
      }

      continue // skip normal path below
    }

    // 5. Build new method body (no early returns — original path)
    const newBodyStmts: t.Statement[] = []

    // Add `const __props = this[GEA_PROPS]` at the top
    usedHelpers.add('GEA_PROPS')
    newBodyStmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__props'),
          t.memberExpression(t.thisExpression(), t.identifier('GEA_PROPS'), true),
        ),
      ]),
    )

    // Keep non-destructuring statements (except return), applying substitutions
    for (let i = 0; i < body.body.length; i++) {
      if (i === returnIdx) continue
      if (indicesToRemove.has(i)) continue
      if (subs.size > 0) applySubsToNode(body.body[i], subs)
      newBodyStmts.push(body.body[i])
    }

    // Transform __props.X.Y → __itemSignal(__props.X, 'Y').value in reactive getters
    transformPropItemAccess(stmts, usedHelpers)

    // Add transformed JSX statements + return
    newBodyStmts.push(...stmts)
    newBodyStmts.push(t.returnStatement(rootId))

    // 6. Rename method to [GEA_CREATE_TEMPLATE] and update
    usedHelpers.add('GEA_CREATE_TEMPLATE')
    member.key = t.identifier('GEA_CREATE_TEMPLATE')
    member.computed = true
    member.params = [] // Remove params
    member.body = t.blockStatement(newBodyStmts)

    // Remove TypeScript type annotations
    if ((member as any).returnType) {
      ;(member as any).returnType = null
    }
  }
}
