import { t } from '../utils/babel-interop.ts'

/**
 * Walks the AST and wraps `.map(...)` calls that appear as template literal
 * expressions with `.join('')` when they are not already wrapped.
 *
 * Without this, arrays rendered inside template literals produce commas via
 * `Array.prototype.toString()`.
 *
 * Uses a manual recursive walk instead of Babel traverse because dynamically
 * injected class methods may not be visited by traverse.
 *
 * Mutates the AST in place.
 */
export function addJoinToMapCalls(ast: t.File): void {
  const processed = new WeakSet<t.Node>()

  function wrapWithJoin(node: t.CallExpression): t.CallExpression {
    processed.add(node)
    return t.callExpression(
      t.memberExpression(node, t.identifier('join')),
      [t.stringLiteral('')],
    )
  }

  function isUnwrappedMapCall(node: t.Node): node is t.CallExpression {
    if (!t.isCallExpression(node) || processed.has(node)) return false
    if (!t.isMemberExpression(node.callee)) return false
    const prop = node.callee.property
    return (
      t.isIdentifier(prop) &&
      prop.name === 'map' &&
      node.arguments.length >= 1 &&
      t.isArrowFunctionExpression(node.arguments[0])
    )
  }

  function visitTemplateLiteral(tl: t.TemplateLiteral): void {
    for (let i = 0; i < tl.expressions.length; i++) {
      const expr = tl.expressions[i]
      if (isUnwrappedMapCall(expr)) {
        tl.expressions[i] = wrapWithJoin(expr)
      }
      walkNode(expr)
    }
  }

  function walkNode(node: t.Node | null | undefined): void {
    if (!node || typeof node !== 'object') return
    if (t.isTemplateLiteral(node)) {
      visitTemplateLiteral(node)
      return
    }
    const keys = t.VISITOR_KEYS[node.type]
    if (!keys) return
    for (const key of keys) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && typeof item.type === 'string') {
            walkNode(item)
          }
        }
      } else if (child && typeof child === 'object' && typeof child.type === 'string') {
        walkNode(child)
      }
    }
  }

  for (const stmt of ast.program.body) {
    walkNode(stmt)
  }
}
