import { parse } from '@babel/parser'
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'

export interface FunctionalComponentInfo {
  name: string
}

export interface ParseResult {
  ast: t.File
  componentClassName: string | null
  componentClassNames: string[]
  functionalComponentInfo: FunctionalComponentInfo | null
  imports: Map<string, string>
  importKinds: Map<string, 'default' | 'named' | 'namespace'>
  hasJSX: boolean
}

/**
 * Parse source code with Babel and extract component metadata.
 *
 * Detects:
 * - Classes extending an imported superclass (typically Component)
 * - Default-exported functions/arrows returning JSX (functional components)
 * - Named exports of JSX-returning functions (throws an error)
 * - All import declarations (local name -> source, import kind)
 * - JSX presence
 */
export function parseSource(code: string): ParseResult | null {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
  })

  let componentClassName: string | null = null
  const componentClassNames: string[] = []
  let functionalComponentInfo: FunctionalComponentInfo | null = null
  const imports = new Map<string, string>()
  const importKinds = new Map<string, 'default' | 'named' | 'namespace'>()
  let hasJSX = false

  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value
      for (const spec of path.node.specifiers) {
        if (t.isImportDefaultSpecifier(spec)) {
          imports.set(spec.local.name, source)
          importKinds.set(spec.local.name, 'default')
        } else if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
          imports.set(spec.local.name, source)
          importKinds.set(spec.local.name, 'named')
        } else if (t.isImportNamespaceSpecifier(spec)) {
          imports.set(spec.local.name, source)
          importKinds.set(spec.local.name, 'namespace')
        }
      }
    },

    ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
      if (!t.isIdentifier(path.node.superClass)) return
      const superName = path.node.superClass.name
      // A class is a component if it extends an imported identifier or 'Component' directly
      if (superName === 'Component' || imports.has(superName)) {
        componentClassName = path.node.id?.name ?? null
        if (componentClassName) {
          componentClassNames.push(componentClassName)
        }
      }
    },

    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      // Skip if we already found a class component
      if (componentClassName) return

      const decl = path.node.declaration
      let name: string | null = null
      let returnsJSX = false

      if (t.isFunctionDeclaration(decl)) {
        name = decl.id?.name ?? null
        returnsJSX = bodyReturnsJSX(decl.body)
      } else if (t.isArrowFunctionExpression(decl)) {
        returnsJSX = nodeReturnsJSX(decl.body)
      } else if (t.isIdentifier(decl)) {
        // export default MyFunc — resolve the binding
        const binding = path.scope.getBinding(decl.name)
        if (!binding?.path.isVariableDeclarator()) return
        const varDecl = binding.path.node as t.VariableDeclarator
        const init = varDecl.init
        if (!t.isArrowFunctionExpression(init) && !t.isFunctionExpression(init)) return
        name = t.isIdentifier(varDecl.id) ? varDecl.id.name : null
        returnsJSX = nodeReturnsJSX(init.body)
      }

      if (name && returnsJSX) {
        functionalComponentInfo = { name }
      }
    },

    ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
      const decl = path.node.declaration
      if (!decl) return

      if (t.isFunctionDeclaration(decl) && decl.id) {
        throwIfReturnsJSX(decl.id.name, decl.body)
      } else if (t.isVariableDeclaration(decl)) {
        for (const declarator of decl.declarations) {
          if (!t.isIdentifier(declarator.id) || !declarator.init) continue
          if (t.isArrowFunctionExpression(declarator.init) || t.isFunctionExpression(declarator.init)) {
            throwIfReturnsJSX(declarator.id.name, declarator.init.body)
          }
        }
      }
    },

    JSXElement() {
      hasJSX = true
    },
    JSXFragment() {
      hasJSX = true
    },
  })

  return {
    ast,
    componentClassName,
    componentClassNames,
    functionalComponentInfo,
    imports,
    importKinds,
    hasJSX,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Recursively check whether a node contains or returns JSX.
 */
function nodeReturnsJSX(node: t.Node): boolean {
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return true
  if (t.isReturnStatement(node) && node.argument) return nodeReturnsJSX(node.argument)
  if (t.isBlockStatement(node)) return bodyReturnsJSX(node)
  if (t.isArrowFunctionExpression(node)) return nodeReturnsJSX(node.body)
  if (t.isConditionalExpression(node)) {
    return nodeReturnsJSX(node.consequent) || nodeReturnsJSX(node.alternate)
  }
  if (t.isLogicalExpression(node)) return nodeReturnsJSX(node.right)
  return false
}

/** Check if a block statement has a return that yields JSX. */
function bodyReturnsJSX(block: t.BlockStatement): boolean {
  const ret = block.body.find((s): s is t.ReturnStatement => t.isReturnStatement(s) && s.argument != null)
  return !!ret && nodeReturnsJSX(ret.argument!)
}

/** Throw a compile error if a named export returns JSX. */
function throwIfReturnsJSX(name: string, body: t.Node): void {
  if (nodeReturnsJSX(body)) {
    const err = new Error(
      `[gea] Named JSX component export '${name}' is not supported. ` +
        `Use 'export default' or convert to a class extending Component. ` +
        `Only one component per file is allowed.`,
    )
    ;(err as any).__geaCompileError = true
    throw err
  }
}
