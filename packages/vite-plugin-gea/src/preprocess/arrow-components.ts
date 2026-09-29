import { t, traverse, type NodePath } from '../utils/babel-interop.ts'
import { isFunctionComponent } from '../closure-codegen/transform/transform-components.ts'

/**
 * Rewrites top-level arrow-function and function-expression components into
 * function declarations, the only function form the closure compiler
 * recognizes as a component:
 *
 * - `const Foo = (props) => <div/>`            → `function Foo(props) { return <div/> }`
 * - `export const Foo = (props) => { …; return <div/> }`
 *                                              → `export function Foo(props) { …; return <div/> }`
 * - `export const Foo = function (props) { … }` → `export function Foo(props) { … }`
 * - `export default (props) => <div/>`         → `export default function Foo(props) { return <div/> }`
 * - `export default function (props) { … }`    → `export default function Foo(props) { … }`
 *   (the name comes from the file name, since the function has none)
 *
 * A function is rewritten only if the resulting declaration passes
 * `isFunctionComponent`. Arrows that read `this` or `arguments`, which a
 * function declaration would rebind, are left alone.
 *
 * Mutates the AST in place. Returns true if anything was rewritten.
 */
export function normalizeArrowComponents(ast: t.File, filename?: string): boolean {
  const body = ast.program.body
  let changed = false

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i]

    if (t.isExportDefaultDeclaration(stmt) && t.isArrowFunctionExpression(stmt.declaration)) {
      const name = defaultComponentName(ast, filename)
      const fn = arrowToFunctionDeclaration(name, stmt.declaration)
      if (!fn) continue
      stmt.declaration = fn
      changed = true
      continue
    }

    if (t.isExportDefaultDeclaration(stmt) && t.isFunctionDeclaration(stmt.declaration) && !stmt.declaration.id) {
      const fn = stmt.declaration
      fn.id = t.identifier(defaultComponentName(ast, filename))
      if (isFunctionComponent(fn)) changed = true
      else fn.id = null
      continue
    }

    const exported = t.isExportNamedDeclaration(stmt)
    const decl = exported ? stmt.declaration : stmt
    if (!t.isVariableDeclaration(decl) || decl.kind !== 'const') continue

    // Split the declaration so each converted function becomes its own function
    // declaration; the remaining declarators stay `const`, in order.
    const replacement: t.Statement[] = []
    let pending: t.VariableDeclarator[] = []
    const wrap = (node: t.Declaration): t.Statement => (exported ? t.exportNamedDeclaration(node, []) : node)
    const flush = () => {
      if (pending.length === 0) return
      replacement.push(wrap(t.variableDeclaration('const', pending)))
      pending = []
    }
    for (const declarator of decl.declarations) {
      const fn = t.isIdentifier(declarator.id) ? toFunctionDeclaration(declarator.id.name, declarator.init) : null
      if (!fn) {
        pending.push(declarator)
        continue
      }
      flush()
      replacement.push(wrap(fn))
    }
    if (pending.length === decl.declarations.length) continue
    flush()

    t.inherits(replacement[0]!, stmt)
    body.splice(i, 1, ...replacement)
    i += replacement.length - 1
    changed = true
  }

  return changed
}

function toFunctionDeclaration(name: string, init: t.Expression | null | undefined): t.FunctionDeclaration | null {
  if (t.isArrowFunctionExpression(init)) return arrowToFunctionDeclaration(name, init)
  if (t.isFunctionExpression(init)) return functionExpressionToDeclaration(name, init)
  return null
}

function arrowToFunctionDeclaration(name: string, arrow: t.ArrowFunctionExpression): t.FunctionDeclaration | null {
  // Parameter defaults are evaluated in the function's scope too.
  if (readsFunctionScopedBinding(arrow.params) || readsFunctionScopedBinding(arrow.body)) return null
  const body = t.isBlockStatement(arrow.body) ? arrow.body : t.blockStatement([t.returnStatement(arrow.body)])
  const fn = t.functionDeclaration(t.identifier(name), arrow.params, body, false, arrow.async)
  // Carries over loc, comments, type parameters and the return type annotation.
  t.inherits(fn, arrow)
  return isFunctionComponent(fn) ? fn : null
}

/**
 * A function expression binds `this` and `arguments` like a declaration does.
 * Only its own name needs care: in `const Foo = function Inner() { … }`,
 * `Inner` is bound inside the body alone, so its references become `Foo`.
 */
function functionExpressionToDeclaration(name: string, fn: t.FunctionExpression): t.FunctionDeclaration | null {
  const decl = t.functionDeclaration(t.identifier(name), fn.params, fn.body, fn.generator, fn.async)
  // Carries over loc, comments, type parameters and the return type annotation.
  t.inherits(decl, fn)
  if (!isFunctionComponent(decl)) return null
  if (fn.id && !renameSelfReferences(fn, name)) return null
  return decl
}

/**
 * Renames the references to a named function expression's own name to `name`.
 * Returns false, renaming nothing, if another binding of `name` is in scope
 * where one of them sits, or if the body assigns to the function's name: that
 * name is read-only, while a declaration's name can be reassigned.
 */
function renameSelfReferences(fn: t.FunctionExpression, name: string): boolean {
  // A throwaway file gives the function fresh paths and scopes, unaffected by
  // earlier traversals of the module and by the rewrites made so far.
  let fnPath!: NodePath<t.FunctionExpression>
  traverse(t.file(t.program([t.expressionStatement(fn)])), {
    FunctionExpression(path) {
      fnPath = path
      path.stop()
    },
  })
  const binding = fnPath.scope.getOwnBinding(fn.id!.name)
  // A parameter of the same name shadows the function's name everywhere.
  if (binding?.kind !== 'local') return true
  if (!binding.constant) return false
  for (const ref of binding.referencePaths) {
    const target = ref.scope.getBinding(name)
    // When the names match, `name` resolves to this binding itself.
    if (target && target !== binding) return false
  }
  for (const ref of binding.referencePaths) (ref.node as t.Identifier | t.JSXIdentifier).name = name
  return true
}

/** True if `node` reads `this` or `arguments` from the arrow's enclosing scope. */
function readsFunctionScopedBinding(node: any, parent?: any, grandparent?: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some((child) => readsFunctionScopedBinding(child, parent, grandparent))
  if (t.isThisExpression(node) || t.isJSXIdentifier(node, { name: 'this' })) return true
  // `props.arguments`, `{ arguments: 1 }` and `{ arguments: T }` types are names, not reads.
  if (t.isIdentifier(node, { name: 'arguments' })) return t.isReferenced(node, parent, grandparent)
  // Non-arrow functions bind their own `this` and `arguments`.
  if (t.isFunction(node) && !t.isArrowFunctionExpression(node)) return false
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    if (readsFunctionScopedBinding(node[k], node, parent)) return true
  }
  return false
}

/**
 * PascalCase name for an anonymous default-export component, derived from the
 * file name (`default-arrow.tsx` → `DefaultArrow`) and suffixed until it
 * clashes with no identifier in the module.
 */
function defaultComponentName(ast: t.File, filename?: string): string {
  const base = (filename ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]*$/, '')
  let name = base
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
  if (!name) name = 'DefaultComponent'
  if (!/^[A-Za-z_$]/.test(name)) name = `_${name}`

  const taken = new Set<string>()
  collectIdentifierNames(ast.program, taken)
  let candidate = name
  for (let n = 1; taken.has(candidate); n++) candidate = `${name}${n}`
  return candidate
}

function collectIdentifierNames(node: any, names: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) collectIdentifierNames(child, names)
    return
  }
  if (t.isIdentifier(node) || t.isJSXIdentifier(node)) names.add(node.name)
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    collectIdentifierNames(node[k], names)
  }
}
