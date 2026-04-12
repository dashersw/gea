import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import type { StateRefMeta } from '../ir/types.ts'
export type { StateRefMeta }

/**
 * Collect all state references reachable from the AST.
 *
 * Produces a map of local variable name -> metadata describing how that
 * variable relates to reactive state (imported store, destructured store
 * field, destructured `this` property, store alias, or derived).
 */
export function collectStateReferences(ast: t.File, storeImports: Map<string, string>): Map<string, StateRefMeta> {
  const stateRefs = new Map<string, StateRefMeta>()

  // Seed with known store imports
  for (const [localName, source] of storeImports) {
    stateRefs.set(localName, { kind: 'imported', source })
  }

  // First pass: detect destructured stores, destructured `this`, and store aliases
  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      const init = path.node.init
      if (!init) return

      // const { x, y } = this
      if (t.isObjectPattern(path.node.id) && t.isThisExpression(init)) {
        for (const prop of path.node.id.properties) {
          if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue
          const localName = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name
          if (!stateRefs.has(localName)) {
            stateRefs.set(localName, { kind: 'local-destructured', propName: prop.key.name })
          }
        }
      }

      // const { x, y } = someStore  (where someStore is an imported store)
      if (t.isObjectPattern(path.node.id) && t.isIdentifier(init) && storeImports.has(init.name)) {
        const storeVar = init.name
        const source = storeImports.get(storeVar)
        for (const prop of path.node.id.properties) {
          if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue
          const localName = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name
          if (!stateRefs.has(localName)) {
            stateRefs.set(localName, {
              kind: 'imported-destructured',
              source,
              storeVar,
              propName: prop.key.name,
            })
          }
        }
      }

      // const project = projectStore.project  (store property alias)
      if (
        t.isIdentifier(path.node.id) &&
        t.isMemberExpression(init) &&
        !init.computed &&
        t.isIdentifier(init.object) &&
        storeImports.has(init.object.name) &&
        t.isIdentifier(init.property)
      ) {
        const localName = path.node.id.name
        if (!stateRefs.has(localName)) {
          stateRefs.set(localName, {
            kind: 'store-alias',
            storeVar: init.object.name,
            propName: init.property.name,
          })
        }
      }
    },
  })

  // Second pass: collect derived consts inside class methods whose
  // init expressions transitively reference known state refs.
  // e.g. `const issueType = issue.type || 'task'` where `issue` is a state ref.
  const candidates = new Map<string, t.Expression>()

  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!path.node.init || !t.isIdentifier(path.node.id)) return
      if (stateRefs.has(path.node.id.name)) return
      // Only consider variables declared inside class methods
      const classMethod = path.findParent((p: NodePath) => t.isClassMethod(p.node))
      if (!classMethod) return
      candidates.set(path.node.id.name, t.cloneNode(path.node.init, true))
    },
  })

  // Fixpoint loop: keep marking variables as derived until no more can be found
  let changed = true
  while (changed) {
    changed = false
    for (const [name, init] of candidates) {
      if (stateRefs.has(name)) continue
      if (expressionReferencesAny(init, stateRefs)) {
        stateRefs.set(name, {
          kind: 'derived',
          initExpression: t.cloneNode(init, true),
        })
        candidates.delete(name)
        changed = true
      }
    }
  }

  return stateRefs
}

/**
 * Recursively check whether an AST expression references any known state ref.
 */
function expressionReferencesAny(expr: t.Node, stateRefs: Map<string, StateRefMeta>): boolean {
  if (t.isIdentifier(expr) && stateRefs.has(expr.name)) return true

  const visitorKeys = t.VISITOR_KEYS[expr.type]
  if (!visitorKeys) return false

  for (const key of visitorKeys) {
    const child = (expr as any)[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type && expressionReferencesAny(item, stateRefs)) {
          return true
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      if (expressionReferencesAny(child, stateRefs)) return true
    }
  }
  return false
}
