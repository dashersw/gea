/**
 * Transforms `router.setPath('./pages')` calls into the expanded form:
 *
 *   router.setRoutes(
 *     __geaBuildFileRoutes(
 *       import.meta.glob('./pages/** /page.{tsx,ts,jsx,js}'),
 *       import.meta.glob('./pages/** /layout.{tsx,ts,jsx,js}', { eager: true }),
 *       './pages'
 *     )
 *   )
 *
 * The `buildFileRoutes` helper is imported from `@geajs/core` under the
 * `__geaBuildFileRoutes` alias to avoid collisions with user code.
 *
 * Uses an AST-based approach so that template literals, strings in comments,
 * and other non-call occurrences are never accidentally mutated.
 */

import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default
const generate = require('@babel/generator').default

const IMPORT_MARKER = '__geaBuildFileRoutes'
const IMPORT_SOURCE = '@geajs/core'

function buildGlobCall(pattern: string, options?: t.ObjectExpression): t.CallExpression {
  const callee = t.memberExpression(
    t.metaProperty(t.identifier('import'), t.identifier('meta')),
    t.identifier('glob'),
  )
  const args: t.Expression[] = [t.stringLiteral(pattern)]
  if (options) args.push(options)
  return t.callExpression(callee, args)
}

export function transformFileRoutes(code: string): { code: string; map: null } | null {
  if (!code.includes('.setPath(')) return null

  let ast: t.File
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties'],
    })
  } catch {
    return null
  }

  let hasSetPath = false
  let alreadyImported = false

  traverse(ast, {
    ImportDeclaration(path: any) {
      if (path.node.source.value !== IMPORT_SOURCE) return
      for (const spec of path.node.specifiers) {
        if (
          t.isImportSpecifier(spec) &&
          t.isIdentifier(spec.imported) &&
          spec.imported.name === 'buildFileRoutes' &&
          spec.local.name === IMPORT_MARKER
        ) {
          alreadyImported = true
        }
      }
    },

    CallExpression(path: any) {
      const node = path.node as t.CallExpression
      if (
        !t.isMemberExpression(node.callee) ||
        !t.isIdentifier(node.callee.property) ||
        node.callee.property.name !== 'setPath' ||
        node.arguments.length < 1 ||
        !t.isStringLiteral(node.arguments[0]) ||
        !/^\.{1,2}\//.test((node.arguments[0] as t.StringLiteral).value)
      ) {
        return
      }

      hasSetPath = true
      const dirPath = (node.arguments[0] as t.StringLiteral).value

      const eagerOpts = t.objectExpression([
        t.objectProperty(t.identifier('eager'), t.booleanLiteral(true)),
      ])

      const buildCall = t.callExpression(t.identifier(IMPORT_MARKER), [
        buildGlobCall(`${dirPath}/**/page.{tsx,ts,jsx,js}`),
        buildGlobCall(`${dirPath}/**/layout.{tsx,ts,jsx,js}`, eagerOpts),
        t.stringLiteral(dirPath),
      ])

      path.replaceWith(
        t.callExpression(t.memberExpression(node.callee.object, t.identifier('setRoutes')), [
          buildCall,
        ]),
      )
    },
  })

  if (!hasSetPath) return null

  if (!alreadyImported) {
    const importDecl = t.importDeclaration(
      [t.importSpecifier(t.identifier(IMPORT_MARKER), t.identifier('buildFileRoutes'))],
      t.stringLiteral(IMPORT_SOURCE),
    )
    ast.program.body.unshift(importDecl)
  }

  const { code: generated } = generate(ast, {}, code)
  return { code: generated, map: null }
}
