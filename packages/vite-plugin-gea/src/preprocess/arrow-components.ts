import { t } from '../utils/babel-interop.ts'
import { isFunctionComponent } from '../closure-codegen/transform/transform-components.ts'

/**
 * Rewrites top-level arrow-function components into function declarations,
 * the only function form the closure compiler recognizes as a component:
 *
 * - `const Foo = (props) => <div/>`            → `function Foo(props) { return <div/> }`
 * - `export const Foo = (props) => { …; return <div/> }`
 *                                              → `export function Foo(props) { …; return <div/> }`
 * - `export default (props) => <div/>`         → `export default function Foo(props) { return <div/> }`
 *   (the name comes from the file name, since the arrow has none)
 *
 * An arrow is rewritten only if the resulting function passes
 * `isFunctionComponent`, and never if it reads `this` or `arguments`, which a
 * function declaration would rebind.
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

    const exported = t.isExportNamedDeclaration(stmt)
    const decl = exported ? stmt.declaration : stmt
    if (!t.isVariableDeclaration(decl) || decl.kind !== 'const') continue

    // Split the declaration so each converted arrow becomes its own function
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
      const fn =
        t.isIdentifier(declarator.id) && t.isArrowFunctionExpression(declarator.init)
          ? arrowToFunctionDeclaration(declarator.id.name, declarator.init)
          : null
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

function arrowToFunctionDeclaration(name: string, arrow: t.ArrowFunctionExpression): t.FunctionDeclaration | null {
  // Parameter defaults are evaluated in the function's scope too.
  if (readsFunctionScopedBinding(arrow.params) || readsFunctionScopedBinding(arrow.body)) return null
  const body = t.isBlockStatement(arrow.body) ? arrow.body : t.blockStatement([t.returnStatement(arrow.body)])
  const fn = t.functionDeclaration(t.identifier(name), arrow.params, body, false, arrow.async)
  // Carries over loc, comments, type parameters and the return type annotation.
  t.inherits(fn, arrow)
  return isFunctionComponent(fn) ? fn : null
}

/** True if `node` reads `this` or `arguments` from the arrow's enclosing scope. */
function readsFunctionScopedBinding(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(readsFunctionScopedBinding)
  if (t.isThisExpression(node) || t.isJSXIdentifier(node, { name: 'this' })) return true
  if (t.isIdentifier(node, { name: 'arguments' })) return true
  // Non-arrow functions bind their own `this` and `arguments`.
  if (t.isFunction(node) && !t.isArrowFunctionExpression(node)) return false
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    if (readsFunctionScopedBinding(node[k])) return true
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
