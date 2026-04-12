import * as t from '@babel/types'

/**
 * Detect if an expression is a conditional pattern:
 * - `condition && <Element>`  or  `condition && <Fragment>`
 * - `condition ? <Element> : <Element>`
 * - `condition ? <Element> : null`
 */
export function isConditionalPattern(expr: t.Expression): boolean {
  // condition && <Element> or condition && <Fragment>
  if (
    t.isLogicalExpression(expr) &&
    expr.operator === '&&' &&
    (t.isJSXElement(expr.right) || isParenthesizedJSX(expr.right) ||
     t.isJSXFragment(expr.right) || isParenthesizedJSXFragment(expr.right))
  ) {
    return true
  }

  // condition ? <Element|Fragment> : ...
  if (
    t.isConditionalExpression(expr) &&
    (t.isJSXElement(expr.consequent) || isParenthesizedJSX(expr.consequent) ||
     t.isJSXFragment(expr.consequent) || isParenthesizedJSXFragment(expr.consequent))
  ) {
    return true
  }

  return false
}

function isParenthesizedJSX(node: t.Node): boolean {
  return t.isParenthesizedExpression(node) && t.isJSXElement(node.expression)
}

function isParenthesizedJSXFragment(node: t.Node): boolean {
  return t.isParenthesizedExpression(node) && t.isJSXFragment(node.expression)
}

function unwrapJSX(node: t.Expression): t.JSXElement | null {
  if (t.isJSXElement(node)) return node
  if (t.isParenthesizedExpression(node) && t.isJSXElement(node.expression)) return node.expression
  return null
}

function unwrapJSXFragment(node: t.Expression): t.JSXFragment | null {
  if (t.isJSXFragment(node)) return node
  if (t.isParenthesizedExpression(node) && t.isJSXFragment(node.expression)) return node.expression
  return null
}

/**
 * Extract parts from a conditional pattern.
 */
export function getConditionalParts(
  expr: t.Expression,
): { condition: t.Expression; element: t.JSXElement; elseElement?: t.JSXElement; fragment?: t.JSXFragment } | null {
  // condition && <Element> or <Fragment>
  if (t.isLogicalExpression(expr) && expr.operator === '&&') {
    const el = unwrapJSX(expr.right)
    if (el) return { condition: expr.left, element: el }
    const frag = unwrapJSXFragment(expr.right)
    if (frag) return { condition: expr.left, element: null as any, fragment: frag }
  }

  // condition ? <Element|Fragment> : ...
  if (t.isConditionalExpression(expr)) {
    const el = unwrapJSX(expr.consequent)
    if (!el) {
      // consequent might be a Fragment
      const frag = unwrapJSXFragment(expr.consequent)
      if (frag) {
        const elseEl = unwrapJSX(expr.alternate)
        return { condition: expr.test, element: null as any, fragment: frag, elseElement: elseEl || undefined }
      }
      return null
    }

    const elseEl = unwrapJSX(expr.alternate)
    // condition ? <Element> : <ElseElement>
    if (elseEl) return { condition: expr.test, element: el, elseElement: elseEl }
    // condition ? <Element> : null/undefined/false
    return { condition: expr.test, element: el }
  }

  return null
}
