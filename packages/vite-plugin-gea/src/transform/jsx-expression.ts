import * as t from '@babel/types'
import type { SubstitutionMap } from '../analyze/index.js'
import _generate from '@babel/generator'

const generate = (typeof (_generate as any).default === 'function'
  ? (_generate as any).default
  : _generate) as typeof _generate

/**
 * Apply substitution map to a Babel AST node (expression).
 * Replaces Identifier references that appear in the substitution map
 * with the substituted expression (parsed back to AST).
 *
 * This operates on a CLONED node to avoid mutating the original.
 */
export function substituteExpression(
  node: t.Expression,
  subs: SubstitutionMap,
): t.Expression {
  if (subs.size === 0) return node
  return substituteNode(t.cloneDeep(node), subs) as t.Expression
}

function substituteNode(node: t.Node, subs: SubstitutionMap): t.Node {
  // Base case: Identifier that's in the substitution map
  if (t.isIdentifier(node) && subs.has(node.name)) {
    const replacement = subs.get(node.name)!
    if (typeof replacement === 'string') {
      return parseExpr(replacement)
    } else {
      // AST Expression — clone it to avoid sharing nodes
      return t.cloneDeep(replacement)
    }
  }

  // Recurse into child nodes
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        if (child[i] && typeof child[i].type === 'string') {
          child[i] = substituteNode(child[i], subs)
        }
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      // Don't substitute into property keys of member expressions
      // e.g., in `foo.bar`, don't substitute `bar`
      if (t.isMemberExpression(node) && key === 'property' && !node.computed) {
        continue
      }
      // Don't substitute object property keys (non-computed)
      if (t.isObjectProperty(node) && key === 'key' && !node.computed) {
        continue
      }
      // Don't substitute arrow function / function params
      if ((t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) && key === 'params') {
        continue
      }

      ;(node as any)[key] = substituteNode(child, subs)
    }
  }

  return node
}

/**
 * Convert a simple expression string like "todoStore.filter" or "this.editing"
 * into a Babel AST Expression node.
 */
function parseExpr(expr: string): t.Expression {
  // Handle "this.prop"
  if (expr.startsWith('this.')) {
    const prop = expr.slice(5)
    return t.memberExpression(t.thisExpression(), t.identifier(prop))
  }

  // Handle "source.prop"
  const parts = expr.split('.')
  let result: t.Expression = t.identifier(parts[0])
  for (let i = 1; i < parts.length; i++) {
    result = t.memberExpression(result, t.identifier(parts[i]))
  }
  return result
}

/**
 * Convert an expression AST to source string.
 */
export function exprToString(node: t.Expression | t.Node): string {
  const { code } = generate(node as any, { compact: false, concise: true })
  return code
}

