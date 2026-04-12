/**
 * reactivity-types.ts
 *
 * Shared types for the reactivity sub-modules.
 * Bundles the closure-shared state that was previously implicit
 * inside applyStaticReactivity().
 */

import type { t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'

/**
 * Context bundle threaded through the reactivity sub-modules.
 * Replaces the 50+ closure-captured locals from the original monolith.
 */
export interface ReactivityContext {
  /** The ClassDeclaration path being processed */
  classPath: NodePath<t.ClassDeclaration>

  /** Map from observeKey -> added ClassMethod */
  addedMethods: Map<string, t.ClassMethod>

  /** Map from method name -> added ClassMethod */
  addedMethodsByName: Map<string, t.ClassMethod>

  /** Whether any reactivity code was applied */
  applied: boolean

  /** Align method body params when merging into an existing method */
  alignMethodBodyParams: (
    source: t.ClassMethod,
    targetParams: (t.Identifier | t.Pattern | t.RestElement)[],
  ) => t.Statement[]
}
