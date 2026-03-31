/**
 * JSX tag inspection, string-expression analysis, class-value expression
 * builders, selector generation, and direct-child-element enumeration.
 */
import { t } from '../utils/babel-interop.ts'

// ─── JSX tag helpers ────────────────────────────────────────────────

export function getJSXTagName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  if (t.isJSXIdentifier(name)) return name.name
  if (t.isJSXMemberExpression(name))
    return `${getJSXTagName(name.object)}.${name.property.name}`
  if (t.isJSXNamespacedName(name))
    return `${name.namespace.name}:${name.name.name}`
  return ''
}

export function isUpperCase(char: string): boolean {
  return char >= 'A' && char <= 'Z'
}

export function isComponentTag(tagName: string): boolean {
  return tagName.length > 0 && isUpperCase(tagName[0])
}

export function camelToKebab(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase()
}

// ─── String-expression analysis ─────────────────────────────────────

export function isAlwaysStringExpression(expr: t.Expression): boolean {
  if (t.isStringLiteral(expr)) return true
  if (t.isTemplateLiteral(expr)) return true
  if (t.isConditionalExpression(expr)) {
    return (
      isAlwaysStringExpression(expr.consequent as t.Expression) &&
      isAlwaysStringExpression(expr.alternate as t.Expression)
    )
  }
  if (t.isLogicalExpression(expr) && expr.operator === '??') {
    return isAlwaysStringExpression(expr.right as t.Expression)
  }
  return false
}

export function isWhitespaceFree(expr: t.Expression): boolean {
  if (t.isStringLiteral(expr)) return expr.value === expr.value.trim()
  if (t.isConditionalExpression(expr)) {
    return (
      isWhitespaceFree(expr.consequent as t.Expression) &&
      isWhitespaceFree(expr.alternate as t.Expression)
    )
  }
  return false
}

// ─── Class-value expression builders ────────────────────────────────

export function buildTrimmedClassValueExpression(
  expr: t.Expression,
): t.Expression {
  if (isAlwaysStringExpression(expr) && isWhitespaceFree(expr)) return expr

  if (isAlwaysStringExpression(expr)) {
    return t.callExpression(
      t.memberExpression(t.cloneNode(expr, true), t.identifier('trim')),
      [],
    )
  }

  const forCompare = t.cloneNode(expr, true) as t.Expression
  const forString = t.cloneNode(expr, true) as t.Expression
  const coerced = t.conditionalExpression(
    t.binaryExpression('!=', forCompare, t.nullLiteral()),
    t.callExpression(t.identifier('String'), [forString]),
    t.stringLiteral(''),
  )
  return t.callExpression(
    t.memberExpression(
      t.parenthesizedExpression(coerced),
      t.identifier('trim'),
    ),
    [],
  )
}

export function buildTrimmedClassJoinedExpression(
  expr: t.Expression,
): t.Expression {
  return t.callExpression(
    t.memberExpression(t.cloneNode(expr, true), t.identifier('trim')),
    [],
  )
}

// ─── Selector generation ────────────────────────────────────────────

export function generateSelector(selectorPath: string[]): string {
  if (selectorPath.length === 0) return ':scope'
  return `:scope > ${selectorPath.join(' > ')}`
}

// ─── Direct child elements ──────────────────────────────────────────

export function getDirectChildElements(
  children:
    | readonly t.JSXText[]
    | readonly (
        | t.JSXText
        | t.JSXExpressionContainer
        | t.JSXSpreadChild
        | t.JSXElement
        | t.JSXFragment
      )[],
) {
  const directChildren: t.JSXElement[] = []

  const pushChildren = (
    nodes: readonly (
      | t.JSXText
      | t.JSXExpressionContainer
      | t.JSXSpreadChild
      | t.JSXElement
      | t.JSXFragment
    )[],
  ) => {
    nodes.forEach((child) => {
      if (t.isJSXElement(child)) {
        directChildren.push(child)
      } else if (t.isJSXFragment(child)) {
        pushChildren(child.children)
      } else if (
        t.isJSXExpressionContainer(child) &&
        !t.isJSXEmptyExpression(child.expression)
      ) {
        if (t.isJSXElement(child.expression)) {
          directChildren.push(child.expression)
        } else if (t.isJSXFragment(child.expression)) {
          pushChildren(child.expression.children)
        }
      }
    })
  }

  pushChildren(
    children as readonly (
      | t.JSXText
      | t.JSXExpressionContainer
      | t.JSXSpreadChild
      | t.JSXElement
      | t.JSXFragment
    )[],
  )

  const perTagCounts = new Map<string, number>()
  return directChildren.map((node) => {
    const tagName = getJSXTagName(node.openingElement.name) || 'div'
    const tagCount = (perTagCounts.get(tagName) || 0) + 1
    perTagCounts.set(tagName, tagCount)
    return {
      node,
      selectorSegment: `${tagName}:nth-of-type(${tagCount})`,
    }
  })
}
