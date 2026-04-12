import * as t from '@babel/types'
import type { SubstitutionMap } from '../analyze/index.js'
import { buildSubstitutionMap, scanDestructuringStatements, scanReactiveLocalConsts } from '../analyze/index.js'
import type { RuntimeHelper } from '../utils.js'
import { transformJSXElement, transformJSXFragment, transformPropItemAccess } from './jsx-element.js'
import { substituteExpression } from './jsx-expression.js'

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
    }

    const [stmts, rootId] = t.isJSXFragment(jsxElement)
      ? transformJSXFragment(jsxElement, ctx)
      : transformJSXElement(jsxElement as t.JSXElement, ctx)

    // 5. Build new method body
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
