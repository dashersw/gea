import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'

/**
 * Converts a functional component default export into a class-based Gea component.
 *
 * Supports:
 * - `export default function Foo(props) { return <div/> }`
 * - `export default (props) => <div/>`
 * - `const Foo = (props) => <div/>; export default Foo`
 *
 * The result is:
 * ```
 * class Foo extends Component { template(props) { return <div/> } }
 * export default Foo
 * ```
 *
 * Mutates the AST in place.
 */
export function convertFunctionalToClass(
  ast: t.File,
  info: { name: string },
  imports: Map<string, string>,
): void {
  const name = info.name
  let params: (t.Identifier | t.Pattern | t.RestElement)[] = [t.identifier('props')]
  let templateBody: t.Statement[] = []
  let removeVarDeclPath: NodePath<t.VariableDeclaration> | null = null
  let exportPath: NodePath<t.ExportDefaultDeclaration> | null = null

  traverse(ast, {
    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      exportPath = path
      const decl = path.node.declaration

      const extractFunction = (
        fn: t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression,
      ) => {
        if (fn.params.length > 0) {
          params = fn.params.map(
            (p) => t.cloneNode(p) as t.Identifier | t.Pattern | t.RestElement,
          )
        }

        if (t.isBlockStatement(fn.body)) {
          const returnIdx = fn.body.body.findIndex(
            (s) => t.isReturnStatement(s) && (s as t.ReturnStatement).argument,
          )
          if (returnIdx >= 0) {
            templateBody = fn.body.body
              .slice(0, returnIdx + 1)
              .map((s) => t.cloneNode(s) as t.Statement)
          }
        } else {
          // Arrow with expression body
          templateBody = [t.returnStatement(t.cloneNode(fn.body) as t.Expression)]
        }
      }

      if (t.isFunctionDeclaration(decl)) {
        extractFunction(decl)
      } else if (t.isArrowFunctionExpression(decl)) {
        extractFunction(decl)
      } else if (t.isIdentifier(decl)) {
        // `const Foo = () => ...; export default Foo`
        const binding = path.scope.getBinding(decl.name)
        const init = binding?.path?.isVariableDeclarator()
          ? (binding.path.node as t.VariableDeclarator).init
          : null

        if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
          extractFunction(init)
          const varDeclPath = binding!.path.findParent((p) =>
            t.isVariableDeclaration(p.node),
          ) as NodePath<t.VariableDeclaration> | null
          if (varDeclPath) removeVarDeclPath = varDeclPath
        }
      }

      path.stop()
    },
  })

  if (templateBody.length === 0 || !exportPath) return

  // If the first param is a plain identifier and the first body statement
  // destructures it, lift the destructuring pattern into the params.
  const firstParam = params[0]
  const firstStmt = templateBody[0]
  if (
    params.length === 1 &&
    t.isIdentifier(firstParam) &&
    t.isVariableDeclaration(firstStmt) &&
    firstStmt.declarations.length === 1
  ) {
    const decl = firstStmt.declarations[0]
    if (
      decl &&
      t.isObjectPattern(decl.id) &&
      decl.init &&
      t.isIdentifier(decl.init, { name: firstParam.name })
    ) {
      params = [t.cloneNode(decl.id)]
      templateBody = templateBody.slice(1)
    }
  }

  ensureComponentImport(ast, imports)

  const templateMethod = t.classMethod(
    'method',
    t.identifier('template'),
    params,
    t.blockStatement(templateBody),
  )

  const classDecl = t.classDeclaration(
    t.identifier(name),
    t.identifier('Component'),
    t.classBody([templateMethod]),
  )

  if (removeVarDeclPath) {
    removeVarDeclPath.remove()
  }

  const program = ast.program
  const idx = program.body.indexOf(exportPath.node)
  if (idx >= 0) {
    program.body[idx] = t.exportDefaultDeclaration(classDecl)
  }
}

function ensureComponentImport(ast: t.File, imports: Map<string, string>): void {
  if (imports.get('Component')) return

  const source = '@geajs/core'

  // Check if there is already an import from @geajs/core
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.source.value === source) {
      node.specifiers.push(
        t.importSpecifier(t.identifier('Component'), t.identifier('Component')),
      )
      imports.set('Component', source)
      return
    }
  }

  // No existing import — create one
  ast.program.body.unshift(
    t.importDeclaration(
      [t.importSpecifier(t.identifier('Component'), t.identifier('Component'))],
      t.stringLiteral(source),
    ),
  )
  imports.set('Component', source)
}
