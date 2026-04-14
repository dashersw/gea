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
 * Replaces e.g. `emailId` → `__props.emailId` in regular JS code.
 */
function applySubsToNode(node: any, subs: SubstitutionMap): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) applySubsToNode(node[i], subs)
    return
  }

  // Match Identifier that's in the substitution map
  if (node.type === 'Identifier' && subs.has(node.name)) {
    // Don't replace if it's a property key (obj.prop — don't touch prop)
    // The caller context handles this — we check parent relationship
    // For simplicity, we replace all matching identifiers.
    // The substituteExpression function handles this properly.
  }

  // Use substituteExpression for expression-type nodes
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    // Substitute inside the body but NOT the params
    if (node.body) {
      if (node.body.type === 'BlockStatement') {
        for (const stmt of node.body.body) {
          applySubsToNode(stmt, subs)
        }
      } else {
        // Expression body
        substituteExpression(node.body, subs)
      }
    }
    return
  }

  if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations) {
      if (decl.init) {
        decl.init = substituteExpression(decl.init, subs)
      }
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

  // Generic traversal for other statement types
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
    applySubsToNode(node[key], subs)
  }
}

/**
 * Transform a function component:
 * 1. Detect exported function with uppercase name and destructured object param
 * 2. Rewrite parameter to __props
 * 3. Build substitution map from destructured props + reactive store destructuring in body
 * 4. Transform JSX with substitution
 */
export function transformFunctionComponent(
  funcDecl: t.FunctionDeclaration,
  reactiveSources: Set<string>,
  usedHelpers: Set<RuntimeHelper>,
  templateDeclarations?: t.Statement[],
  templateCounter?: { value: number },
  poolCounter?: { value: number },
): void {
  if (!funcDecl.id) return
  if (!funcDecl.body) return

  const subs: SubstitutionMap = new Map()

  // 1. Process destructured params
  const destructuredParamNames: string[] = []
  if (funcDecl.params.length > 0) {
    const param = funcDecl.params[0]
    if (t.isObjectPattern(param)) {
      const paramSubs = buildSubstitutionMap(param, '__props')
      for (const [k, v] of paramSubs) {
        subs.set(k, v)
        destructuredParamNames.push(k)
      }
      // Rewrite param to __props
      funcDecl.params[0] = t.identifier('__props')
    }
  }

  const body = funcDecl.body.body

  // 2. Scan body for destructuring from reactive sources
  const { map: bodySubs, indicesToRemove } = scanDestructuringStatements(body, reactiveSources)
  for (const [k, v] of bodySubs) subs.set(k, v)

  // 3. Find return statement with JSX
  let returnIdx = -1
  let returnStmt: t.ReturnStatement | null = null
  for (let i = 0; i < body.length; i++) {
    if (t.isReturnStatement(body[i])) {
      returnIdx = i
      returnStmt = body[i] as t.ReturnStatement
      break
    }
  }

  if (!returnStmt || !returnStmt.argument) return

  // 3b. Scan for reactive local const declarations to inline
  const { map: localSubs, indicesToRemove: localIndicesToRemove } = scanReactiveLocalConsts(
    body,
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

  for (let i = 0; i < body.length; i++) {
    if (i >= returnIdx) break
    if (indicesToRemove.has(i)) continue
    const stmt = body[i]
    if (!t.isIfStatement(stmt)) continue
    if (stmt.alternate) continue

    let retArg: t.Expression | null | undefined = undefined
    const cons = stmt.consequent
    if (t.isBlockStatement(cons)) {
      const lastStmt = cons.body[cons.body.length - 1]
      if (t.isReturnStatement(lastStmt)) retArg = lastStmt.argument ?? null
    } else if (t.isReturnStatement(cons)) {
      retArg = cons.argument ?? null
    }

    if (retArg === undefined) continue

    let arg = retArg
    if (arg && t.isParenthesizedExpression(arg)) arg = arg.expression

    if (arg && (t.isJSXElement(arg) || t.isJSXFragment(arg))) {
      earlyReturnIfs.push({ index: i, test: stmt.test, jsxReturn: arg })
    } else if (!arg || t.isNullLiteral(arg)) {
      earlyReturnIfs.push({ index: i, test: stmt.test, jsxReturn: null })
    }
  }

  let jsxElement: t.JSXElement | t.JSXFragment | null = null
  if (t.isJSXElement(returnStmt.argument) || t.isJSXFragment(returnStmt.argument)) {
    jsxElement = returnStmt.argument
  } else if (
    t.isParenthesizedExpression(returnStmt.argument) &&
    (t.isJSXElement(returnStmt.argument.expression) || t.isJSXFragment(returnStmt.argument.expression))
  ) {
    jsxElement = returnStmt.argument.expression
  }

  if (!jsxElement) return

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

    const condExpr = substituteExpression(er.test as t.Expression, subs)

    let earlyStmts: t.Statement[] = []
    let earlyRootId: t.Expression

    if (er.jsxReturn) {
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
      earlyRootId = t.callExpression(
        t.memberExpression(t.identifier('document'), t.identifier('createComment')),
        [t.stringLiteral('')],
      )
    }

    const earlyBranch = t.arrowFunctionExpression(
      [],
      t.blockStatement([...earlyStmts, t.returnStatement(earlyRootId)]),
    )

    const mainBranchBody: t.Statement[] = []
    for (let i = 0; i < body.length; i++) {
      if (i === returnIdx) continue
      if (indicesToRemove.has(i)) continue
      if (earlyIndices.has(i)) continue
      if (i <= er.index) continue
      if (subs.size > 0) applySubsToNode(body[i], subs)
      mainBranchBody.push(body[i])
    }
    transformPropItemAccess(stmts, usedHelpers)
    mainBranchBody.push(...stmts)
    mainBranchBody.push(t.returnStatement(rootId))
    const mainBranch = t.arrowFunctionExpression([], t.blockStatement(mainBranchBody))

    const newBodyStmts: t.Statement[] = []

    // Statements before the early return
    for (let i = 0; i < er.index; i++) {
      if (i === returnIdx) continue
      if (indicesToRemove.has(i)) continue
      if (subs.size > 0) applySubsToNode(body[i], subs)
      newBodyStmts.push(body[i])
    }

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
    funcDecl.body = t.blockStatement(newBodyStmts)

    for (const param of funcDecl.params) {
      if (t.isIdentifier(param) && (param as any).typeAnnotation) {
        ;(param as any).typeAnnotation = null
      }
    }
    if ((funcDecl as any).returnType) {
      ;(funcDecl as any).returnType = null
    }
    return
  }

  // 5. Build new body (no early returns — original path)
  const newBodyStmts: t.Statement[] = []

  // Apply substitution to ALL non-return statements (not just JSX).
  // This ensures that code like `const email = () => store.getById(emailId)`
  // uses `__props.emailId` instead of a destructured snapshot.
  const keptStatements: t.Statement[] = []
  for (let i = 0; i < body.length; i++) {
    if (i === returnIdx) continue
    if (indicesToRemove.has(i)) continue
    keptStatements.push(body[i])
  }

  // Apply substitution to kept statements
  if (subs.size > 0) {
    for (const stmt of keptStatements) {
      applySubsToNode(stmt, subs)
    }
  }

  newBodyStmts.push(...keptStatements)

  // Transform __props.X.Y → __itemSignal(__props.X, 'Y').value in reactive getters
  transformPropItemAccess(stmts, usedHelpers)

  // Add transformed JSX statements + return
  newBodyStmts.push(...stmts)
  newBodyStmts.push(t.returnStatement(rootId))

  funcDecl.body = t.blockStatement(newBodyStmts)

  // Remove TypeScript type annotations from params
  for (const param of funcDecl.params) {
    if (t.isIdentifier(param) && (param as any).typeAnnotation) {
      ;(param as any).typeAnnotation = null
    }
  }
  // Remove return type
  if ((funcDecl as any).returnType) {
    ;(funcDecl as any).returnType = null
  }
}
