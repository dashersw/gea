import type { ClassDeclaration, ClassMethod, JSXElement, JSXFragment } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

/** True for JSX elements, fragments, null, undefined, or string literals (things that can be rendered in a branch). */
export function isJsxOrNullish(n: any): boolean {
  if (t.isJSXElement(n) || t.isJSXFragment(n)) return true
  if (t.isNullLiteral(n)) return true
  if (t.isIdentifier(n, { name: 'undefined' })) return true
  return false
}

/** True when `n` is `<expr>.map(arrow)` where the arrow's body returns JSX
 *  (directly or via a `return` in a BlockStatement). Used by the `&&` arm
 *  to promote `cond && xs.map(x => <JSX/>)` to a conditional slot whose
 *  truthy branch is a keyed-list. */
export function isMapWithJsxBody(n: any): boolean {
  if (!t.isCallExpression(n) && !t.isOptionalCallExpression(n)) return false
  const callee: any = (n as any).callee
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return false
  if (callee.computed) return false
  if (!t.isIdentifier(callee.property, { name: 'map' })) return false
  const arg = (n as any).arguments[0]
  if (!arg) return false
  if (!t.isArrowFunctionExpression(arg) && !t.isFunctionExpression(arg)) return false
  const body: any = arg.body
  if (t.isJSXElement(body) || t.isJSXFragment(body)) return true
  if (t.isBlockStatement(body)) {
    const ret = body.body.find((s: any) => t.isReturnStatement(s))
    if (ret && ret.argument && (t.isJSXElement(ret.argument) || t.isJSXFragment(ret.argument))) return true
  }
  return false
}

/**
 * Check if a class declaration has a `template()` method and return it.
 * Returns null if the class does not have a template method (non-component).
 */
export function findTemplateMethod(classDecl: ClassDeclaration): ClassMethod | null {
  for (const member of classDecl.body.body) {
    if (
      t.isClassMethod(member) &&
      t.isIdentifier(member.key, { name: 'template' }) &&
      !member.computed &&
      !member.static
    ) {
      return member
    }
  }
  return null
}

/**
 * Extract the JSX root from a template() method. The method body is expected to
 * be `template() { return <jsx />; }` — possibly with prop destructuring.
 */
export function extractTemplateJsx(templateMethod: ClassMethod): JSXElement | JSXFragment | null {
  for (const stmt of templateMethod.body.body) {
    if (t.isReturnStatement(stmt) && stmt.argument) {
      if (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument)) {
        return stmt.argument
      }
    }
  }
  return null
}
