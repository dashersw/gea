import type { ImportInfo } from './imports.js'

/**
 * Determine which variable names represent reactive sources.
 *
 * A reactive source is any variable whose property access must remain
 * as property access (not destructured into a local copy) so the runtime
 * can track reads reactively.
 *
 * Reactive sources:
 *  - `this` (inside a Component class)
 *  - Default imports (potential store instances)
 *  - `__props` (component props, added during transform)
 */
export function identifyReactiveSources(imports: ImportInfo): Set<string> {
  const sources = new Set<string>()

  // 'this' is always reactive inside a Component
  sources.add('this')

  // Default imports are treated as potential store instances
  for (const name of imports.defaultImports.keys()) {
    sources.add(name)
  }

  return sources
}
