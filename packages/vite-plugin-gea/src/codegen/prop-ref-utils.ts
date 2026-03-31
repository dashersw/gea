/**
 * Prop-ref rewriting, handler body extraction, and dead-code pruning.
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'

// ─── Handler body extraction ────────────────────────────────────────

export function extractHandlerBody(
  handlerExpression: t.Expression,
  propNames?: Set<string>,
): t.Statement[] {
  if (t.isArrowFunctionExpression(handlerExpression)) {
    let body: t.Statement[]
    if (t.isBlockStatement(handlerExpression.body)) {
      body = handlerExpression.body.body
    } else {
      body = [t.expressionStatement(handlerExpression.body)]
    }
    return propNames?.size ? replacePropRefsInStatements(body, propNames) : body
  }
  if (t.isFunctionExpression(handlerExpression)) {
    const body = handlerExpression.body.body
    return propNames?.size ? replacePropRefsInStatements(body, propNames) : body
  }
  const callee = t.isIdentifier(handlerExpression)
    ? t.memberExpression(
        t.memberExpression(t.thisExpression(), t.identifier('props')),
        t.cloneNode(handlerExpression),
      )
    : handlerExpression
  return [t.expressionStatement(t.callExpression(callee, [t.identifier('e')]))]
}

// ─── Prop-ref rewriting ─────────────────────────────────────────────

export function replacePropRefsInStatements(
  statements: t.Statement[],
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Statement[] {
  return statements.map(
    (stmt) =>
      replacePropRefsInNode(
        stmt,
        propNames,
        wholeParamName,
        propDefaults,
      ) as t.Statement,
  )
}

export function replacePropRefsInExpression(
  expr: t.Expression,
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Expression {
  return replacePropRefsInNode(
    expr,
    propNames,
    wholeParamName,
    propDefaults,
  ) as t.Expression
}

function isThisPropsMember(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isThisExpression(node.object) &&
    t.isIdentifier(node.property, { name: 'props' })
  )
}

export function replaceThisPropsRootWithValueParam(
  expr: t.Expression,
  propName: string,
): t.Expression {
  const visit = (e: t.Expression): t.Expression => {
    if (
      t.isMemberExpression(e) &&
      !e.computed &&
      isThisPropsMember(e.object) &&
      t.isIdentifier(e.property, { name: propName })
    ) {
      return t.identifier('value')
    }
    if (t.isMemberExpression(e))
      return t.memberExpression(
        visit(e.object as t.Expression),
        e.property,
        e.computed,
      )
    if (t.isOptionalMemberExpression(e))
      return t.optionalMemberExpression(
        visit(e.object as t.Expression),
        e.property as t.Expression,
        e.computed,
        e.optional,
      )
    if (t.isOptionalCallExpression(e))
      return t.optionalCallExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
        e.optional,
      )
    if (t.isCallExpression(e))
      return t.callExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    if (t.isConditionalExpression(e))
      return t.conditionalExpression(
        visit(e.test),
        visit(e.consequent),
        visit(e.alternate),
      )
    if (t.isLogicalExpression(e))
      return t.logicalExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isBinaryExpression(e))
      return t.binaryExpression(
        e.operator,
        visit(e.left as t.Expression),
        visit(e.right as t.Expression),
      )
    if (t.isUnaryExpression(e))
      return t.unaryExpression(
        e.operator,
        visit(e.argument as t.Expression),
        e.prefix,
      )
    if (t.isSequenceExpression(e))
      return t.sequenceExpression(
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isAssignmentExpression(e))
      return t.assignmentExpression(
        e.operator,
        e.left as t.LVal,
        visit(e.right as t.Expression),
      )
    if (t.isArrayExpression(e))
      return t.arrayExpression(
        e.elements.map((el) => {
          if (el === null) return null
          if (t.isSpreadElement(el)) return t.spreadElement(visit(el.argument))
          return visit(el as t.Expression)
        }),
      )
    if (t.isObjectExpression(e))
      return t.objectExpression(
        e.properties.map((p) => {
          if (t.isSpreadElement(p)) return t.spreadElement(visit(p.argument))
          if (t.isObjectProperty(p))
            return t.objectProperty(
              p.computed
                ? (visit(p.key as t.Expression) as
                    | t.Expression
                    | t.Identifier
                    | t.StringLiteral)
                : p.key,
              visit(p.value as t.Expression),
              p.computed,
              p.shorthand,
            )
          return p
        }),
      )
    if (t.isTemplateLiteral(e))
      return t.templateLiteral(
        e.quasis,
        e.expressions.map((x) => visit(x as t.Expression)),
      )
    if (t.isTaggedTemplateExpression(e))
      return t.taggedTemplateExpression(
        visit(e.tag as t.Expression),
        visit(e.quasi) as t.TemplateLiteral,
      )
    if (t.isNewExpression(e))
      return t.newExpression(
        visit(e.callee as t.Expression),
        e.arguments.map((a) =>
          (t.isExpression(a) ? visit(a) : a) as t.Expression,
        ),
      )
    return e
  }
  return visit(expr)
}

export function derivedExprGuardsValueWhenNullish(
  expr: t.Expression,
): boolean {
  if (!t.isConditionalExpression(expr)) return false
  return testBranchesOnValueNullish(expr.test)
}

function testBranchesOnValueNullish(test: t.Expression): boolean {
  if (t.isIdentifier(test, { name: 'value' })) return true
  if (
    t.isBinaryExpression(test) &&
    ['==', '===', '!=', '!=='].includes(test.operator)
  ) {
    const isValue = (e: t.Expression) => t.isIdentifier(e, { name: 'value' })
    const isNullishLit = (e: t.Expression) =>
      t.isNullLiteral(e) || (t.isIdentifier(e) && e.name === 'undefined')
    return (
      (isValue(test.left) && isNullishLit(test.right)) ||
      (isValue(test.right) && isNullishLit(test.left))
    )
  }
  if (
    t.isUnaryExpression(test) &&
    test.operator === '!' &&
    t.isIdentifier(test.argument, { name: 'value' })
  )
    return true
  if (t.isLogicalExpression(test)) {
    return (
      testBranchesOnValueNullish(test.left) ||
      testBranchesOnValueNullish(test.right)
    )
  }
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
      while (t.isTSAsExpression(obj) || t.isTSSatisfiesExpression(obj))
        obj = obj.expression
      if (t.isIdentifier(obj, { name: valueId })) {
        found = true
        path.stop()
      }
    },
  })
  return found
}

// ─── Pruning helpers ────────────────────────────────────────────────

export function pruneDeadParamDestructuring(
  statements: t.Statement[],
  additionalNodes?: t.Node[],
): t.Statement[] {
  return statements.filter((stmt, i) => {
    if (!t.isVariableDeclaration(stmt)) return true
    const decl = stmt.declarations[0]
    if (!decl || !t.isObjectPattern(decl.id)) return true
    if (
      !t.isMemberExpression(decl.init) ||
      !t.isThisExpression(decl.init.object) ||
      !t.isIdentifier(decl.init.property, { name: 'props' })
    )
      return true

    const boundNames = new Set<string>()
    for (const prop of decl.id.properties) {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.value))
        boundNames.add(prop.value.name)
      else if (t.isRestElement(prop) && t.isIdentifier(prop.argument))
        boundNames.add(prop.argument.name)
    }

    const referencedInRest = collectAllIdentifierNames(
      statements,
      i + 1,
      additionalNodes,
    )

    const usedNames = [...boundNames].filter((n) => referencedInRest.has(n))
    if (usedNames.length === 0) return false

    decl.id.properties = decl.id.properties.filter((prop) => {
      if (t.isRestElement(prop)) return true
      if (t.isObjectProperty(prop)) {
        const key = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
            ? prop.key.value
            : null
        return key ? referencedInRest.has(key) : true
      }
      return true
    })
    return decl.id.properties.length > 0
  })
}

function collectAllIdentifierNames(
  statements: t.Statement[],
  fromIndex: number,
  additionalNodes?: t.Node[],
): Set<string> {
  const names = new Set<string>()
  const walk = (node: t.Node | null | undefined): void => {
    if (!node || typeof node !== 'object' || !('type' in node)) return
    if (t.isIdentifier(node)) {
      names.add(node.name)
      return
    }
    if (
      (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
      !node.computed
    ) {
      walk(node.object)
      return
    }
    if (t.isVariableDeclarator(node)) {
      walk(node.init)
      return
    }
    for (const key of t.VISITOR_KEYS[node.type] || []) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const c of child)
          if (c && typeof c === 'object' && 'type' in c) walk(c as t.Node)
      } else if (child && typeof child === 'object' && 'type' in child) {
        walk(child as t.Node)
      }
    }
  }
  for (let j = fromIndex; j < statements.length; j++) walk(statements[j])
  if (additionalNodes) for (const node of additionalNodes) walk(node)
  return names
}

export function pruneUnusedSetupDestructuring(
  setupStatements: t.Statement[],
  bodyNodes: t.Node[],
): t.Statement[] {
  return setupStatements.filter((stmt, i) => {
    if (!t.isVariableDeclaration(stmt)) return true
    const decl = stmt.declarations[0]
    if (!decl) return true

    const usedNames = collectAllIdentifierNames(
      setupStatements,
      i + 1,
      bodyNodes,
    )

    if (t.isObjectPattern(decl.id)) {
      decl.id.properties = decl.id.properties.filter((prop) => {
        if (t.isRestElement(prop)) return true
        if (t.isObjectProperty(prop)) {
          const valueName = t.isIdentifier(prop.value)
            ? prop.value.name
            : null
          return valueName ? usedNames.has(valueName) : true
        }
        return true
      })
      return decl.id.properties.length > 0
    }

    if (t.isIdentifier(decl.id)) {
      return usedNames.has(decl.id.name)
    }

    return true
  })
}

// ─── Prop-ref rewriting (internal) ──────────────────────────────────

function replacePropRefsInNode(
  node: t.Node,
  propNames: Set<string>,
  wholeParamName?: string,
  propDefaults?: Map<string, t.Expression>,
): t.Node {
  if (t.isIdentifier(node) && wholeParamName && node.name === wholeParamName)
    return t.memberExpression(t.thisExpression(), t.identifier('props'))
  if (t.isIdentifier(node) && propNames.has(node.name)) {
    const member = t.memberExpression(
      t.memberExpression(t.thisExpression(), t.identifier('props')),
      t.identifier(node.name),
    )
    const def = propDefaults?.get(node.name)
    if (def)
      return t.logicalExpression(
        '??',
        member,
        t.cloneNode(def, true) as t.Expression,
      )
    return member
  }
  const r = (n: t.Node) =>
    replacePropRefsInNode(n, propNames, wholeParamName, propDefaults)
  if (t.isExpressionStatement(node))
    return t.expressionStatement(r(node.expression) as t.Expression)
  if (t.isBlockStatement(node))
    return t.blockStatement(node.body.map((s) => r(s) as t.Statement))
  if (t.isIfStatement(node))
    return t.ifStatement(
      r(node.test) as t.Expression,
      r(node.consequent) as t.Statement,
      node.alternate ? (r(node.alternate) as t.Statement) : null,
    )
  if (t.isReturnStatement(node))
    return t.returnStatement(
      node.argument ? (r(node.argument) as t.Expression) : null,
    )
  if (t.isCallExpression(node))
    return t.callExpression(
      r(node.callee) as t.Expression,
      node.arguments.map((a) =>
        (t.isExpression(a) ? r(a) : a) as t.Expression,
      ),
    )
  if (t.isMemberExpression(node))
    return t.memberExpression(
      r(node.object) as t.Expression,
      node.property,
      node.computed,
    )
  if (t.isOptionalMemberExpression(node))
    return t.optionalMemberExpression(
      r(node.object) as t.Expression,
      node.property as t.Expression,
      node.computed,
      node.optional,
    )
  if (t.isOptionalCallExpression(node))
    return t.optionalCallExpression(
      r(node.callee) as t.Expression,
      node.arguments.map((a) =>
        (t.isExpression(a) ? r(a) : a) as t.Expression,
      ),
      node.optional,
    )
  if (t.isConditionalExpression(node))
    return t.conditionalExpression(
      r(node.test) as t.Expression,
      r(node.consequent) as t.Expression,
      r(node.alternate) as t.Expression,
    )
  if (t.isLogicalExpression(node))
    return t.logicalExpression(
      node.operator,
      r(node.left) as t.Expression,
      r(node.right) as t.Expression,
    )
  if (t.isBinaryExpression(node))
    return t.binaryExpression(
      node.operator,
      r(node.left) as t.Expression,
      r(node.right) as t.Expression,
    )
  if (t.isUnaryExpression(node))
    return t.unaryExpression(
      node.operator,
      r(node.argument) as t.Expression,
      node.prefix,
    )
  if (t.isSequenceExpression(node))
    return t.sequenceExpression(
      node.expressions.map((e) => r(e) as t.Expression),
    )
  if (t.isAssignmentExpression(node))
    return t.assignmentExpression(
      node.operator,
      r(node.left) as t.LVal,
      r(node.right) as t.Expression,
    )
  if (t.isVariableDeclaration(node))
    return t.variableDeclaration(
      node.kind,
      node.declarations.map((d) =>
        t.variableDeclarator(
          d.id,
          d.init ? (r(d.init) as t.Expression) : null,
        ),
      ),
    )
  if (t.isArrowFunctionExpression(node)) {
    const body = t.isBlockStatement(node.body)
      ? t.blockStatement(node.body.body.map((s) => r(s) as t.Statement))
      : (r(node.body) as t.Expression)
    return t.arrowFunctionExpression(node.params, body, node.async)
  }
  if (t.isFunctionExpression(node)) {
    const body = t.blockStatement(
      node.body.body.map((s) => r(s) as t.Statement),
    )
    return t.functionExpression(
      node.id,
      node.params,
      body,
      node.generator,
      node.async,
    )
  }
  if (t.isTemplateLiteral(node))
    return t.templateLiteral(
      node.quasis,
      node.expressions.map((e) => r(e) as t.Expression),
    )
  if (t.isTaggedTemplateExpression(node))
    return t.taggedTemplateExpression(
      r(node.tag) as t.Expression,
      r(node.quasi) as t.TemplateLiteral,
    )
  if (t.isArrayExpression(node))
    return t.arrayExpression(
      node.elements.map((e) =>
        e === null
          ? null
          : t.isSpreadElement(e)
            ? (r(e) as t.SpreadElement)
            : (r(e) as t.Expression),
      ),
    )
  if (t.isObjectExpression(node))
    return t.objectExpression(
      node.properties.map((p) => {
        if (t.isSpreadElement(p)) return r(p) as t.SpreadElement
        if (t.isObjectProperty(p))
          return t.objectProperty(
            p.computed ? (r(p.key) as t.Expression) : p.key,
            r(p.value) as t.Expression,
            p.computed,
            p.shorthand,
          )
        return p
      }),
    )
  if (t.isSpreadElement(node))
    return t.spreadElement(r(node.argument) as t.Expression)
  if (t.isNewExpression(node))
    return t.newExpression(
      r(node.callee) as t.Expression,
      node.arguments.map((a) =>
        (t.isExpression(a) ? r(a) : a) as t.Expression,
      ),
    )
  if (t.isTryStatement(node)) {
    const block = t.blockStatement(
      node.block.body.map((s) => r(s) as t.Statement),
    )
    const handler = node.handler
      ? t.catchClause(
          node.handler.param,
          t.blockStatement(
            node.handler.body.body.map((s) => r(s) as t.Statement),
          ),
        )
      : null
    const finalizer = node.finalizer
      ? t.blockStatement(
          node.finalizer.body.map((s) => r(s) as t.Statement),
        )
      : null
    return t.tryStatement(block, handler, finalizer)
  }
  if (t.isThrowStatement(node))
    return t.throwStatement(r(node.argument) as t.Expression)
  return node
}
