/**
 * Whole-file checks for JSX the compiler can't compile. Each one throws a
 * compile error where the output would otherwise render nothing.
 */

import type { File } from '@babel/types'

import { t, traverse, type NodePath } from '../../utils/babel-interop.ts'
import { compilerError } from '../../utils/compile-error.ts'

import { bodyContainsJsx, extendsComponent } from './transform-components.ts'

/**
 * `const Tag = 'section'; <Tag />` compiles to `mount('section', …)`, which
 * mounts nothing: a capitalized tag is always mounted as a component. Reject
 * a tag whose variable provably holds a string. A variable holding a
 * component (`const Icon = cond ? A : B`) is left alone.
 */
export function assertNoStringTags(ast: File): void {
  const tags = new Set<string>()
  const strings = new Set<string>()
  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (t.isJSXOpeningElement(node) && t.isJSXIdentifier(node.name) && isComponentTagName(node.name.name)) {
      tags.add(node.name.name)
    }
    if (t.isVariableDeclarator(node) && t.isIdentifier(node.id) && node.init && isStringValued(node.init)) {
      strings.add(node.id.name)
    }
    if (t.isAssignmentExpression(node, { operator: '=' }) && t.isIdentifier(node.left) && isStringValued(node.right)) {
      strings.add(node.left.name)
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(node[key])
    }
  }
  visit(ast.program)
  if (![...tags].some((name) => strings.has(name))) return

  // Resolve each tag through its scope, so a string variable elsewhere that
  // shares a component's name doesn't count. Traverse a copy, so no cached
  // scope outlives the transform's later AST rewrites.
  traverse(t.cloneNode(ast, true), {
    JSXOpeningElement(path: NodePath<any>) {
      const name = path.node.name
      if (!t.isJSXIdentifier(name) || !strings.has(name.name)) return
      const binding = path.scope.getBinding(name.name)
      if (!binding || !binding.path.isVariableDeclarator()) return
      // Every value the variable can hold is a string: its initializer, if
      // any, and each later assignment. `let Tag; Tag = 'section'` counts.
      const init = (binding.path.node as any).init
      if (init && !isStringValued(init)) return
      const writes = binding.constantViolations
      if (!init && writes.length === 0) return
      if (!writes.every((w) => w.isAssignmentExpression({ operator: '=' }) && isStringValued(w.node.right))) return
      throw compilerError(
        `<${name.name}> holds a string, not a component, so it would render nothing.`,
        name,
        `A JSX tag can't come from a string variable. Write the element itself, or pick one with a conditional: ` +
          `{cond ? <section>…</section> : <div>…</div>}.`,
      )
    },
  })
}

/** Same test the template walker uses to mount a tag as a component. */
function isComponentTagName(name: string): boolean {
  return name[0] === name[0].toUpperCase()
}

function isStringValued(node: any): boolean {
  if (t.isStringLiteral(node) || t.isTemplateLiteral(node)) return true
  if (
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSTypeAssertion(node) ||
    t.isTSNonNullExpression(node) ||
    t.isParenthesizedExpression(node)
  ) {
    return isStringValued(node.expression)
  }
  if (t.isConditionalExpression(node)) return isStringValued(node.consequent) && isStringValued(node.alternate)
  if (t.isLogicalExpression(node) && node.operator !== '&&') {
    return isStringValued(node.left) && isStringValued(node.right)
  }
  return false
}

/**
 * The transform compiles top-level component classes only. One declared
 * inside a function keeps its raw `template()`, which renders nothing, and
 * the dev HMR code patches it at module scope, where it isn't defined.
 */
export function assertNoNestedComponentClasses(ast: File): void {
  const visit = (node: any, inFunction: boolean): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, inFunction)
      return
    }
    if (inFunction && t.isClass(node) && extendsComponent(node as any) && bodyContainsJsx(node.body)) {
      const name = node.id ? `\`${node.id.name}\` ` : ''
      throw compilerError(
        `Component class ${name}is declared inside a function. Only top-level component classes are compiled.`,
        node,
        'Declare the class at the top level of the module, and pass values in as props.',
      )
    }
    const nested = inFunction || t.isFunction(node)
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(node[key], nested)
    }
  }
  visit(ast.program, false)
}
