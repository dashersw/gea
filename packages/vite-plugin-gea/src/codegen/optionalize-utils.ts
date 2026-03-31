/**
 * Utilities for optionalizing member expression chains based on
 * binding roots and computed item keys, and early-return guard analysis.
 */
import { js } from 'eszter'
import { t } from '../utils/babel-interop.ts'

// ─── Generic deep-map for optionalization ──────────────────────────
// Uses t.VISITOR_KEYS for structural descent instead of 15+ manual
// node-type branches.  The `visit` callback may return a replacement
// node; returning `undefined` means "keep descending structurally".

function deepMapExpr(
  node: t.Node,
  visit: (n: t.Node) => t.Node | undefined,
): t.Node {
  const hit = visit(node)
  if (hit !== undefined) return hit
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys?.length) return node
  let changed = false
  const updates: Record<string, any> = {}
  for (const key of keys) {
    if (key === 'left' && t.isAssignmentExpression(node)) continue
    if (key === 'id' && t.isVariableDeclarator(node)) continue
    if (
      key === 'property' &&
      (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
      !node.computed
    ) continue
    if (key === 'key' && t.isObjectProperty(node) && !node.computed) continue
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      let arrChanged = false
      const mapped = child.map((c: any) => {
        if (c && typeof c === 'object' && 'type' in c) {
          const r = deepMapExpr(c, visit)
          if (r !== c) arrChanged = true
          return r
        }
        return c
      })
      if (arrChanged) { changed = true; updates[key] = mapped }
    } else if (child && typeof child === 'object' && 'type' in child) {
      const r = deepMapExpr(child, visit)
      if (r !== child) { changed = true; updates[key] = r }
    }
  }
  if (!changed) return node
  return { ...node, ...updates } as t.Node
}

// ─── Early-return guard helpers ─────────────────────────────────────

export function earlyReturnFalsyBindingName(
  guard: t.Expression,
): string | null {
  if (
    t.isUnaryExpression(guard) &&
    guard.operator === '!' &&
    t.isIdentifier(guard.argument)
  )
    return guard.argument.name
  if (
    t.isBinaryExpression(guard) &&
    (guard.operator === '==' || guard.operator === '===')
  ) {
    const nullish = (e: t.Expression) =>
      t.isNullLiteral(e) || (t.isIdentifier(e) && e.name === 'undefined')
    if (t.isIdentifier(guard.left) && nullish(guard.right))
      return guard.left.name
    if (t.isIdentifier(guard.right) && nullish(guard.left))
      return guard.right.name
  }
  if (t.isLogicalExpression(guard) && guard.operator === '||') {
    return (
      earlyReturnFalsyBindingName(guard.left) ||
      earlyReturnFalsyBindingName(guard.right)
    )
  }
  return null
}

// ─── Optionalize member chains ──────────────────────────────────────

/**
 * Core chain optionalizer.  Walks an expression tree, converting
 * non-computed member accesses to optional (`?.`) when `isRoot`
 * returns true for the object.  After the first optional link,
 * all subsequent non-computed accesses become optional too.
 */
function optionalizeChains(
  expr: t.Expression,
  isRoot: (obj: t.Expression) => boolean,
): t.Expression {
  return deepMapExpr(expr, (e) => {
    // Only intercept non-computed MemberExpression for optionalization
    if (!t.isMemberExpression(e) || e.computed) return undefined
    // Recurse into the object sub-tree first (bottom-up chain walking)
    const obj = optionalizeChains(e.object as t.Expression, isRoot)
    if (isRoot(e.object as t.Expression))
      return t.optionalMemberExpression(
        e.object as t.Expression, e.property as t.Identifier, false, true,
      )
    if (t.isOptionalMemberExpression(obj))
      return t.optionalMemberExpression(
        obj, e.property as t.Identifier, false, true,
      )
    if (obj !== e.object) return t.memberExpression(obj, e.property, false)
    return undefined
  }) as t.Expression
}

/**
 * Transforms `root.x.y` → `root?.x?.y` for all non-computed member
 * chains rooted at an identifier named `rootName`.
 */
export function optionalizeMemberChainsFromBindingRoot(
  expr: t.Expression,
  rootName: string,
): t.Expression {
  return optionalizeChains(expr, (obj) => t.isIdentifier(obj, { name: rootName }))
}

/**
 * Transforms `obj[itemKey].x.y` → `obj[itemKey]?.x?.y` for all
 * non-computed member chains following a computed access with `itemKeyName`.
 */
export function optionalizeMemberChainsAfterComputedItemKey(
  expr: t.Expression,
  itemKeyName: string,
): t.Expression {
  return optionalizeChains(expr, (obj) =>
    t.isMemberExpression(obj) &&
    obj.computed &&
    t.isIdentifier(obj.property, { name: itemKeyName }),
  )
}

// ─── Statement-level optionalization ────────────────────────────────

function optionalizeInStatements(
  stmts: t.Statement[],
  transform: (e: t.Expression) => t.Expression,
): t.Statement[] {
  const mapStmt = (s: t.Statement): t.Statement => {
    if (t.isVariableDeclaration(s))
      return t.variableDeclaration(
        s.kind,
        s.declarations.map((d) =>
          t.variableDeclarator(d.id, d.init ? transform(d.init) : null),
        ),
      )
    if (t.isExpressionStatement(s)) return js`${transform(s.expression)};`
    if (t.isReturnStatement(s)) {
      const arg = s.argument ? transform(s.argument) : null
      return arg ? js`return ${arg};` : js`return;`
    }
    if (t.isBlockStatement(s)) return t.blockStatement(s.body.map(mapStmt))
    if (t.isIfStatement(s))
      return t.ifStatement(
        transform(s.test),
        mapStmt(s.consequent) as t.Statement,
        s.alternate ? (mapStmt(s.alternate) as t.Statement) : null,
      )
    return s
  }
  return stmts.map((s) => mapStmt(t.cloneNode(s, true) as t.Statement))
}

export function optionalizeBindingRootInStatements(
  stmts: t.Statement[],
  rootName: string,
): t.Statement[] {
  return optionalizeInStatements(stmts, (e) =>
    optionalizeMemberChainsFromBindingRoot(e, rootName),
  )
}

export function optionalizeComputedItemKeyInStatements(
  stmts: t.Statement[],
  itemKeyName: string,
): t.Statement[] {
  return optionalizeInStatements(stmts, (e) =>
    optionalizeMemberChainsAfterComputedItemKey(e, itemKeyName),
  )
}
