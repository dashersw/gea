import type { File, ImportDeclaration, ImportSpecifier, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'
import { COMPILER_RUNTIME_ID } from '../../virtual-modules.ts'

export function injectTemplateDecls(ast: File, firstClassIdx: number, decls: Statement[]): void {
  if (decls.length === 0) return
  const body = ast.program.body
  const insertAt = firstClassIdx >= 0 ? firstClassIdx : body.length
  body.splice(insertAt, 0, ...decls)
}

function ensureNamedImports(ast: File, source: string, required: Iterable<string>): void {
  let coreImport: ImportDeclaration | null = null
  for (const n of ast.program.body) {
    if (t.isImportDeclaration(n) && n.source.value === source) {
      coreImport = n
      break
    }
  }

  const alreadyImported = new Set<string>()
  if (coreImport) {
    for (const spec of coreImport.specifiers) {
      if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
        alreadyImported.add(spec.imported.name)
      }
    }
  }

  const toAdd: ImportSpecifier[] = []
  for (const name of required) {
    if (!alreadyImported.has(name)) {
      toAdd.push(t.importSpecifier(t.identifier(name), t.identifier(name)))
    }
  }

  if (coreImport) {
    coreImport.specifiers.push(...toAdd)
  } else if (toAdd.length > 0) {
    const decl = t.importDeclaration(toAdd, t.stringLiteral(source))
    ast.program.body.unshift(decl)
  }
}

export function ensureCoreImports(ast: File, helpers: Set<string>): void {
  ensureNamedImports(ast, COMPILER_RUNTIME_ID, helpers)
}
