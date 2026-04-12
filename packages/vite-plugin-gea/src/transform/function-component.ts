import * as t from '@babel/types'
import type { SubstitutionMap } from '../analyze/index.js'
import { buildSubstitutionMap, scanDestructuringStatements, scanReactiveLocalConsts } from '../analyze/index.js'
import type { RuntimeHelper } from '../utils.js'
import { transformJSXElement, transformJSXFragment, transformPropItemAccess } from './jsx-element.js'
import { substituteExpression } from './jsx-expression.js'

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
  }

  const [stmts, rootId] = t.isJSXFragment(jsxElement)
    ? transformJSXFragment(jsxElement, ctx)
    : transformJSXElement(jsxElement as t.JSXElement, ctx)

  // 5. Build new body
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
