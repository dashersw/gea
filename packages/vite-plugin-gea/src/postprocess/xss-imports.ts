import { t } from '../utils/babel-interop.ts'

const XSS_SOURCE = '@geajs/core'
const XSS_SPECIFIERS = ['__escapeHtml', '__sanitizeAttr'] as const

/**
 * Ensures `__escapeHtml` and `__sanitizeAttr` are imported from `@geajs/core`.
 *
 * If an import declaration for `@geajs/core` already exists, any missing
 * specifiers are appended. Otherwise a new import declaration is created.
 *
 * Mutates the AST in place.
 */
export function ensureXSSImports(ast: t.File): void {
  let existingDecl: t.ImportDeclaration | undefined

  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.source.value === XSS_SOURCE) {
      existingDecl = node
      break
    }
  }

  const needed = XSS_SPECIFIERS.filter((name) => {
    if (!existingDecl) return true
    return !existingDecl.specifiers.some(
      (s) => t.isImportSpecifier(s) && t.isIdentifier(s.imported) && s.imported.name === name,
    )
  })

  if (needed.length === 0) return

  const specs = needed.map((name) =>
    t.importSpecifier(t.identifier(name), t.identifier(name)),
  )

  if (existingDecl) {
    existingDecl.specifiers.push(...specs)
  } else {
    ast.program.body.unshift(
      t.importDeclaration(specs, t.stringLiteral(XSS_SOURCE)),
    )
  }
}
