import * as t from '@babel/types'

export interface TextChild {
  kind: 'text'
  value: string
}

export interface ExpressionChild {
  kind: 'expression'
  expression: t.Expression
}

export interface ElementChild {
  kind: 'element'
  node: t.JSXElement
}

export type ClassifiedChild = TextChild | ExpressionChild | ElementChild

/**
 * Classify JSX children into text, expression, or nested element categories.
 * Trims/collapses whitespace in text nodes following JSX conventions.
 */
export function classifyChildren(
  children: (t.JSXElement | t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXFragment)[],
): ClassifiedChild[] {
  const result: ClassifiedChild[] = []

  for (const child of children) {
    if (t.isJSXText(child)) {
      // Collapse whitespace following JSX conventions:
      // - Newlines with surrounding whitespace collapse to nothing
      // - Multiple spaces collapse to one
      // - But preserve single spaces between expressions (e.g., {a} {b})
      const raw = child.value
      // Lines that are only whitespace collapse to empty
      const lines = raw.split('\n')
      const processed = lines.map((line, i) => {
        if (i === 0 && i === lines.length - 1) return line.replace(/\s+/g, ' ')
        if (i === 0) return line.replace(/\s+$/g, '')
        if (i === lines.length - 1) return line.replace(/^\s+/g, '')
        return line.trim()
      }).filter(l => l.length > 0).join(' ')

      if (processed) {
        result.push({ kind: 'text', value: processed })
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (t.isJSXEmptyExpression(child.expression)) continue
      if (t.isExpression(child.expression)) {
        result.push({ kind: 'expression', expression: child.expression })
      }
    } else if (t.isJSXElement(child)) {
      result.push({ kind: 'element', node: child })
    } else if (t.isJSXFragment(child)) {
      // Flatten fragment children into the parent
      const fragmentChildren = classifyChildren(child.children)
      result.push(...fragmentChildren)
    }
    // We skip JSXSpreadChild for now
  }

  return result
}
