import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'
import { id, js, jsExpr } from 'eszter'

// ─── Generic deep-map over AST nodes ──────────────────────────────
// Replaces the two 150+ line hand-rolled recursive visitors with one
// generic function that uses t.VISITOR_KEYS for structural descent.

const SKIP_BINDING: Record<string, Set<string>> = {
  VariableDeclarator: new Set(['id']),
  AssignmentExpression: new Set(['left']),
  ArrowFunctionExpression: new Set(['params']),
  FunctionExpression: new Set(['params', 'id']),
  FunctionDeclaration: new Set(['params', 'id']),
  MemberExpression: new Set(['property']),
  OptionalMemberExpression: new Set(['property']),
  CatchClause: new Set(['param']),
}

function deepMap(node: t.Node, visit: (n: t.Node) => t.Node | undefined): t.Node {
  const hit = visit(node)
  if (hit !== undefined) return hit
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys?.length) return node
  const skip = SKIP_BINDING[node.type]
  let changed = false
  const updates: Record<string, any> = {}
  for (const key of keys) {
    if (skip?.has(key)) continue
    if (t.isObjectProperty(node) && key === 'key' && !node.computed) continue
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      let arrChanged = false
      const mapped = child.map((c: any) => {
        if (c && typeof c === 'object' && 'type' in c) {
          const r = deepMap(c, visit)
          if (r !== c) arrChanged = true
          return r
        }
        return c
      })
      if (arrChanged) { changed = true; updates[key] = mapped }
    } else if (child && typeof child === 'object' && 'type' in child) {
      const r = deepMap(child, visit)
      if (r !== child) { changed = true; updates[key] = r }
    }
  }
  if (!changed) return node
  return { ...node, ...updates } as t.Node
}

// ─── Public API ───────────────────────────────────────────────────

export function extractHandlerBody(
  handlerExpression: t.Expression,
  propNames?: Set<string>,
): t.Statement[] {
  if (t.isArrowFunctionExpression(handlerExpression)) {
    const body = t.isBlockStatement(handlerExpression.body)
      ? handlerExpression.body.body
      : [t.expressionStatement(handlerExpression.body)]
    return propNames?.size ? replacePropRefsInStatements(body, propNames) : body
  }
  if (t.isFunctionExpression(handlerExpression)) {
    const body = handlerExpression.body.body
    return propNames?.size ? replacePropRefsInStatements(body, propNames) : body
  }
  const thisProps = jsExpr`this.props` as t.MemberExpression
  const callee = t.isIdentifier(handlerExpression)
    ? t.memberExpression(thisProps, t.cloneNode(handlerExpression))
    : handlerExpression
  return [js`${callee}(${id('e')});` as t.Statement]
}

export function replacePropRefsInStatements(
  statements: t.Statement[],
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Statement[] {
  return statements.map((stmt) => replacePropRefsInNode(stmt, propNames, wholeParamName, propDefaults) as t.Statement)
}

export function replacePropRefsInExpression(
  expr: t.Expression,
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Expression {
  return replacePropRefsInNode(expr, propNames, wholeParamName, propDefaults) as t.Expression
}

function isThisPropsMember(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) && !node.computed &&
    t.isThisExpression(node.object) && t.isIdentifier(node.property, { name: 'props' })
  )
}

export function replaceThisPropsRootWithValueParam(expr: t.Expression, propName: string): t.Expression {
  return deepMap(expr, (n) => {
    if (
      t.isMemberExpression(n) && !n.computed &&
      isThisPropsMember(n.object) && t.isIdentifier(n.property, { name: propName })
    ) return id('value')
    return undefined
  }) as t.Expression
}

export function derivedExprGuardsValueWhenNullish(expr: t.Expression): boolean {
  if (!t.isConditionalExpression(expr)) return false
  return testBranchesOnValueNullish(expr.test)
}

function testBranchesOnValueNullish(test: t.Expression): boolean {
  if (t.isIdentifier(test, { name: 'value' })) return true
  if (t.isBinaryExpression(test) && ['==', '===', '!=', '!=='].includes(test.operator)) {
    const isValue = (e: t.Expression) => t.isIdentifier(e, { name: 'value' })
    const isNullish = (e: t.Expression) => t.isNullLiteral(e) || (t.isIdentifier(e) && e.name === 'undefined')
    return (isValue(test.left) && isNullish(test.right)) || (isValue(test.right) && isNullish(test.left))
  }
  if (t.isUnaryExpression(test) && test.operator === '!' && t.isIdentifier(test.argument, { name: 'value' })) return true
  if (t.isLogicalExpression(test)) return testBranchesOnValueNullish(test.left) || testBranchesOnValueNullish(test.right)
  return false
}

export function expressionAccessesValueProperties(
  expr: t.Expression | null | undefined,
  setupStmts: readonly t.Statement[] | null | undefined,
  valueId = 'value',
): boolean {
  const body: t.Statement[] = [...(setupStmts ?? [])]
  if (expr) body.push(t.expressionStatement(expr))
  const program = t.program([t.blockStatement(body)])
  let found = false
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (found) return
      let obj: t.Expression = path.node.object as t.Expression
      while (t.isParenthesizedExpression(obj)) obj = obj.expression
      while (t.isTSAsExpression(obj) || t.isTSSatisfiesExpression(obj)) obj = obj.expression
      if (t.isIdentifier(obj, { name: valueId })) { found = true; path.stop() }
    },
  })
  return found
}

export function pruneDeadParamDestructuring(
  statements: t.Statement[],
  additionalNodes?: t.Node[],
): t.Statement[] {
  return statements.filter((stmt, i) => {
    if (!t.isVariableDeclaration(stmt)) return true
    const decl = stmt.declarations[0]
    if (!decl || !t.isObjectPattern(decl.id)) return true
    if (!t.isMemberExpression(decl.init) || !t.isThisExpression(decl.init.object) || !t.isIdentifier(decl.init.property, { name: 'props' })) return true
    const boundNames = new Set<string>()
    for (const prop of decl.id.properties) {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) boundNames.add(prop.value.name)
      else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) boundNames.add(prop.argument.name)
    }
    const refs = collectAllIdentifierNames(statements, i + 1, additionalNodes)
    const usedNames = [...boundNames].filter((n) => refs.has(n))
    if (usedNames.length === 0) return false
    decl.id.properties = decl.id.properties.filter((prop) => {
      if (t.isRestElement(prop)) return true
      if (t.isObjectProperty(prop)) {
        const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
        return key ? refs.has(key) : true
      }
      return true
    })
    return decl.id.properties.length > 0
  })
}

function collectAllIdentifierNames(statements: t.Statement[], fromIndex: number, additionalNodes?: t.Node[]): Set<string> {
  const names = new Set<string>()
  const walk = (node: t.Node | null | undefined): void => {
    if (!node || typeof node !== 'object' || !('type' in node)) return
    if (t.isIdentifier(node)) { names.add(node.name); return }
    if ((t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) && !node.computed) { walk(node.object); return }
    if (t.isVariableDeclarator(node)) { walk(node.init); return }
    for (const key of t.VISITOR_KEYS[node.type] || []) {
      const child = (node as any)[key]
      if (Array.isArray(child)) { for (const c of child) if (c && typeof c === 'object' && 'type' in c) walk(c) }
      else if (child && typeof child === 'object' && 'type' in child) walk(child)
    }
  }
  for (let j = fromIndex; j < statements.length; j++) walk(statements[j])
  if (additionalNodes) for (const node of additionalNodes) walk(node)
  return names
}

export function pruneUnusedSetupDestructuring(setupStatements: t.Statement[], bodyNodes: t.Node[]): t.Statement[] {
  return setupStatements.filter((stmt, i) => {
    if (!t.isVariableDeclaration(stmt)) return true
    const decl = stmt.declarations[0]
    if (!decl) return true
    const usedNames = collectAllIdentifierNames(setupStatements, i + 1, bodyNodes)
    if (t.isObjectPattern(decl.id)) {
      decl.id.properties = decl.id.properties.filter((prop) => {
        if (t.isRestElement(prop)) return true
        if (t.isObjectProperty(prop)) {
          const valueName = t.isIdentifier(prop.value) ? prop.value.name : null
          return valueName ? usedNames.has(valueName) : true
        }
        return true
      })
      return decl.id.properties.length > 0
    }
    if (t.isIdentifier(decl.id)) return usedNames.has(decl.id.name)
    return true
  })
}

function replacePropRefsInNode(
  node: t.Node,
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Node {
  return deepMap(node, (n) => {
    if (t.isIdentifier(n) && wholeParamName && n.name === wholeParamName) return jsExpr`this.props`
    if (t.isIdentifier(n) && propNames.has(n.name)) {
      const member = jsExpr`this.props.${id(n.name)}` as t.MemberExpression
      const def = propDefaults?.get(n.name)
      return def ? t.logicalExpression('??', member, t.cloneNode(def, true) as t.Expression) : member
    }
    return undefined
  })
}
