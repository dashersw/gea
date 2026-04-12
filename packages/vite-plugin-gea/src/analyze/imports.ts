import type { File } from '@babel/types'
import * as t from '@babel/types'

export interface ImportInfo {
  /** Named imports from '@geajs/core': e.g. Component, Store */
  geaNamed: Set<string>
  /** Default imports from local modules – these are potential store instances or components.
   *  Maps local binding name → import source (e.g. "todoStore" → "./todo-store") */
  defaultImports: Map<string, string>
  /** All import sources that are type-only (import type ... from ...) – we skip these */
  typeOnlyImports: Set<string>
}

/**
 * Walk top-level ImportDeclaration nodes and classify them.
 */
export function analyzeImports(ast: File): ImportInfo {
  const geaNamed = new Set<string>()
  const defaultImports = new Map<string, string>()
  const typeOnlyImports = new Set<string>()

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue

    const source = node.source.value

    // Type-only imports → skip entirely
    if (node.importKind === 'type') {
      typeOnlyImports.add(source)
      continue
    }

    for (const spec of node.specifiers) {
      // Skip type-only specifiers
      if (t.isImportSpecifier(spec) && spec.importKind === 'type') continue

      if (source === '@geajs/core') {
        // Named imports from v3 framework
        if (t.isImportSpecifier(spec)) {
          const imported = t.isIdentifier(spec.imported)
            ? spec.imported.name
            : spec.imported.value
          geaNamed.add(imported)
        }
      } else {
        // Default imports from other modules → potential store instances or components
        if (t.isImportDefaultSpecifier(spec)) {
          defaultImports.set(spec.local.name, source)
        }
      }
    }
  }

  return { geaNamed, defaultImports, typeOnlyImports }
}
