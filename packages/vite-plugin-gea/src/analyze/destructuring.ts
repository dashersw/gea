import * as t from '@babel/types'

/**
 * Maps variable name → replacement.
 * - string: a dotted path like "__props.column" (parsed by substituteExpression)
 * - t.Expression: a full AST node (cloned and inserted directly)
 */
export type SubstitutionMap = Map<string, string | t.Expression>

/**
 * Build a substitution map from a destructuring pattern and its source.
 *
 * Example: `const { filter, todos } = todoStore`
 *   → { filter: "todoStore.filter", todos: "todoStore.todos" }
 *
 * Example: `const { editing } = this`
 *   → { editing: "this.editing" }
 *
 * Example: function param `{ name, onClick }` with source `__props`
 *   → { name: "__props.name", onClick: "__props.onClick" }
 */
export function buildSubstitutionMap(
  pattern: t.ObjectPattern,
  sourceName: string,
): SubstitutionMap {
  const map: SubstitutionMap = new Map()

  for (const prop of pattern.properties) {
    if (t.isObjectProperty(prop)) {
      // Normal property: { filter } or { filter: localName }
      const key = t.isIdentifier(prop.key) ? prop.key.name : null
      // Handle both `{ x }` and `{ x = defaultValue }` (AssignmentPattern)
      const value = t.isIdentifier(prop.value)
        ? prop.value.name
        : t.isAssignmentPattern(prop.value) && t.isIdentifier(prop.value.left)
          ? prop.value.left.name
          : null
      // We handle simple cases: `{ x }` and `{ x: y }`
      // For `{ x }`, key === value (shorthand)
      // For `{ x: y }`, key is the source property, value is local binding
      if (key && value) {
        map.set(value, `${sourceName}.${key}`)
      }
    }
    // RestElement: we ignore spread patterns
  }

  return map
}

/**
 * Scan an array of statements for destructuring from reactive sources.
 * Returns the combined substitution map and the indices of statements to remove.
 */
export function scanDestructuringStatements(
  body: t.Statement[],
  reactiveSources: Set<string>,
): { map: SubstitutionMap; indicesToRemove: Set<number> } {
  const map: SubstitutionMap = new Map()
  const indicesToRemove = new Set<number>()

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i]
    if (!t.isVariableDeclaration(stmt)) continue

    for (const decl of stmt.declarations) {
      if (!t.isObjectPattern(decl.id) || !decl.init) continue

      let sourceName: string | null = null

      if (t.isIdentifier(decl.init) && reactiveSources.has(decl.init.name)) {
        sourceName = decl.init.name
      } else if (t.isThisExpression(decl.init) && reactiveSources.has('this')) {
        sourceName = 'this'
      }

      if (sourceName) {
        const sub = buildSubstitutionMap(decl.id, sourceName)
        for (const [k, v] of sub) map.set(k, v)
        indicesToRemove.add(i)
      }
    }
  }

  return { map, indicesToRemove }
}

/**
 * Check if an expression AST node references any reactive source or __props.
 * Used to determine if a local const should be inlined into reactive contexts.
 */
function containsReactiveReference(node: any, reactiveSources: Set<string>): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) {
    return node.some(n => containsReactiveReference(n, reactiveSources))
  }
  if (t.isIdentifier(node)) {
    return reactiveSources.has(node.name) || node.name === '__props'
  }
  if (t.isThisExpression(node)) {
    return reactiveSources.has('this')
  }
  // Don't recurse into function bodies — they're deferred
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) return false
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const child = (node as any)[key]
    if (containsReactiveReference(child, reactiveSources)) return true
  }
  return false
}

/**
 * Scan for `const x = <expr>` declarations where the initializer references
 * reactive state (stores, props). These should be inlined — keeping them as
 * one-time const evaluations breaks reactivity.
 *
 * Processes declarations in order so later locals can reference earlier ones.
 * Uses substituteExprFn to apply existing subs to each init expression.
 *
 * Returns the substitution entries and indices to remove.
 */
export function scanReactiveLocalConsts(
  body: t.Statement[],
  reactiveSources: Set<string>,
  existingSubs: SubstitutionMap,
  substituteExprFn: (expr: t.Expression, subs: SubstitutionMap) => t.Expression,
  skipIndices: Set<number>,
  returnIdx: number,
): { map: SubstitutionMap; indicesToRemove: Set<number> } {
  const map: SubstitutionMap = new Map()
  const indicesToRemove = new Set<number>()

  // Build a combined subs map that grows as we discover more locals
  const combinedSubs: SubstitutionMap = new Map(existingSubs)

  for (let i = 0; i < body.length; i++) {
    if (i === returnIdx) continue
    if (skipIndices.has(i)) continue
    const stmt = body[i]
    if (!t.isVariableDeclaration(stmt) || stmt.kind !== 'const') continue

    for (const decl of stmt.declarations) {
      if (!t.isIdentifier(decl.id) || !decl.init) continue
      // Skip function expressions — those are event handlers, not reactive state
      if (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init)) continue

      // Apply all current substitutions to the init expression
      const substituted = substituteExprFn(decl.init, combinedSubs)

      // Check if the substituted expression references reactive state
      if (containsReactiveReference(substituted, reactiveSources)) {
        const varName = decl.id.name
        map.set(varName, substituted)
        combinedSubs.set(varName, substituted)
        indicesToRemove.add(i)
      }
    }
  }

  return { map, indicesToRemove }
}
