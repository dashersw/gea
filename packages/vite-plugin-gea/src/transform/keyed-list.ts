import * as t from '@babel/types'

export interface KeyedListInfo {
  /** The expression being mapped over (e.g., `filteredTodos`) */
  collection: t.Expression
  /** The .map() callback parameter (e.g., `todo`) */
  itemParam: t.Identifier
  /** Optional second .map() callback parameter for index (e.g., `i`) */
  indexParam?: t.Identifier
  /** The key expression from the JSX key attribute (e.g., `todo.id`) */
  keyExpression: t.Expression
  /** The JSX element inside the map callback */
  element: t.JSXElement
  /** Optional guard condition from ternary body (e.g., `store.items[id]` from `store.items[id] ? <el> : null`) */
  guardCondition?: t.Expression
  /** Statements before the return in a block body (e.g., `const address = \`${col}${rowNum}\``) */
  preStatements?: t.Statement[]
}

/**
 * Detect if an expression is a keyed list pattern: `items.map((item) => <Element key={...} />)`
 */
export function isKeyedListPattern(expr: t.Expression): boolean {
  if (!t.isCallExpression(expr)) return false
  if (!t.isMemberExpression(expr.callee)) return false
  if (!t.isIdentifier(expr.callee.property, { name: 'map' })) return false
  if (expr.arguments.length !== 1) return false

  const callback = expr.arguments[0]
  if (!t.isArrowFunctionExpression(callback) && !t.isFunctionExpression(callback)) return false

  return true
}

/**
 * Extract keyed list information from a .map() call expression.
 */
export function extractKeyedListInfo(expr: t.CallExpression): KeyedListInfo | null {
  const callee = expr.callee as t.MemberExpression
  const collection = callee.object as t.Expression

  const callback = expr.arguments[0] as t.ArrowFunctionExpression | t.FunctionExpression
  if (callback.params.length < 1) return null

  const param = callback.params[0]
  if (!t.isIdentifier(param)) return null

  // Capture optional index parameter (second .map() callback arg)
  let indexParam: t.Identifier | undefined
  if (callback.params.length >= 2 && t.isIdentifier(callback.params[1])) {
    indexParam = callback.params[1]
  }

  // Get the body — could be an expression body or block body with return
  let element: t.JSXElement | null = null
  let guardCondition: t.Expression | undefined
  let preStatements: t.Statement[] | undefined
  if (t.isJSXElement(callback.body)) {
    element = callback.body
  } else if (t.isBlockStatement(callback.body)) {
    const stmts = callback.body.body
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i]
      if (t.isReturnStatement(stmt) && t.isJSXElement(stmt.argument)) {
        element = stmt.argument
        // Capture any statements before the return (e.g., local variable declarations)
        if (i > 0) {
          preStatements = stmts.slice(0, i)
        }
        break
      }
    }
  } else if (t.isParenthesizedExpression(callback.body) && t.isJSXElement(callback.body.expression)) {
    element = callback.body.expression
  } else if (t.isConditionalExpression(callback.body)) {
    // Handle: items.map(item => condition ? <Element key={...} /> : null)
    const { test, consequent, alternate } = callback.body
    const jsxBranch = unwrapJSX(consequent) ?? unwrapJSX(alternate)
    const nullBranch = isNullish(alternate) ? alternate : isNullish(consequent) ? consequent : null
    if (jsxBranch && nullBranch) {
      element = jsxBranch
      // If the JSX is in the alternate branch, negate the condition
      guardCondition = unwrapJSX(consequent) ? test : t.unaryExpression('!', test)
    }
  }

  if (!element) return null

  // Extract key from JSX attributes
  const keyAttr = element.openingElement.attributes.find(
    (attr): attr is t.JSXAttribute =>
      t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'key',
  )

  if (!keyAttr || !t.isJSXExpressionContainer(keyAttr.value)) return null
  if (!t.isExpression(keyAttr.value.expression)) return null

  return {
    collection,
    itemParam: param,
    ...(indexParam ? { indexParam } : {}),
    keyExpression: keyAttr.value.expression,
    element,
    ...(guardCondition ? { guardCondition } : {}),
    ...(preStatements ? { preStatements } : {}),
  }
}

/** Unwrap optional ParenthesizedExpression to get a JSXElement */
function unwrapJSX(node: t.Expression | t.Node): t.JSXElement | null {
  if (t.isJSXElement(node)) return node
  if (t.isParenthesizedExpression(node) && t.isJSXElement(node.expression)) return node.expression
  return null
}

/** Check if an expression is null, undefined, or a falsy literal (false, 0) */
function isNullish(node: t.Expression | t.Node): boolean {
  return t.isNullLiteral(node) || (t.isIdentifier(node) && node.name === 'undefined')
}
