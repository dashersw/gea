import { parse } from '@babel/parser'
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

export interface FunctionalComponentInfo {
  name: string
}

export interface ParseResult {
  ast: t.File
  componentClassName: string | null
  componentClassNames: string[]
  /** Set when file has a default-exported function/arrow that returns JSX (no class component) */
  functionalComponentInfo: FunctionalComponentInfo | null
  imports: Map<string, string>
  importKinds: Map<string, 'default' | 'named' | 'namespace'>
  hasJSX: boolean
}

export interface StateRefMeta {
  kind: 'local' | 'imported' | 'imported-destructured' | 'local-destructured' | 'store-alias'
  source?: string
  storeVar?: string
  propName?: string
  getterDeps?: Map<string, import('./ir.ts').PathParts[]>
  reactiveFields?: Set<string>
}

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
      path.node.specifiers.forEach(
        (spec: t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier) => {
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
        },
      )
    },

    ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
      if (t.isIdentifier(path.node.superClass)) {
        const superName = path.node.superClass.name
        if (superName === 'Component' || imports.has(superName)) {
          componentClassName = path.node.id?.name || null
          if (componentClassName) {
            componentClassNames.push(componentClassName)
          }
        }
      }
    },

    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      if (componentClassName) return
      const decl = path.node.declaration
      let name: string | null = null
      let returnsJSX = false

      const checkReturnsJSX = (node: t.Node): boolean => {
        if (t.isJSXElement(node) || t.isJSXFragment(node)) return true
        if (t.isReturnStatement(node) && node.argument) return checkReturnsJSX(node.argument)
        if (t.isBlockStatement(node)) {
          const ret = node.body.find((s) => t.isReturnStatement(s))
          return !!ret && t.isReturnStatement(ret) && !!ret.argument && checkReturnsJSX(ret.argument)
        }
        if (t.isArrowFunctionExpression(node)) return checkReturnsJSX(node.body)
        if (t.isConditionalExpression(node)) return checkReturnsJSX(node.consequent) || checkReturnsJSX(node.alternate)
        if (t.isLogicalExpression(node)) return checkReturnsJSX(node.right)
        return false
      }

      if (t.isFunctionDeclaration(decl)) {
        name = decl.id?.name || null
        if (decl.body && t.isBlockStatement(decl.body)) {
          const ret = decl.body.body.find((s) => t.isReturnStatement(s) && (s as t.ReturnStatement).argument)
          returnsJSX = !!ret && checkReturnsJSX((ret as t.ReturnStatement).argument!)
        }
      } else if (t.isArrowFunctionExpression(decl)) {
        returnsJSX = checkReturnsJSX(decl.body)
        if (t.isBlockStatement(decl.body)) {
          const ret = decl.body.body.find((s) => t.isReturnStatement(s) && (s as t.ReturnStatement).argument)
          returnsJSX = !!ret && checkReturnsJSX((ret as t.ReturnStatement).argument!)
        }
      } else if (t.isIdentifier(decl)) {
        const binding = path.scope.getBinding(decl.name)
        const init = binding?.path?.isVariableDeclarator() ? (binding.path.node as t.VariableDeclarator).init : null
        if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
          const varDecl = binding!.path.node as t.VariableDeclarator
          name = t.isIdentifier(varDecl.id) ? varDecl.id.name : null
          returnsJSX = checkReturnsJSX(init.body)
          if (t.isBlockStatement(init.body)) {
            const ret = init.body.body.find((s) => t.isReturnStatement(s) && (s as t.ReturnStatement).argument)
            returnsJSX = !!ret && checkReturnsJSX((ret as t.ReturnStatement).argument!)
          }
        }
      }

      if (name && returnsJSX) {
        functionalComponentInfo = { name }
      }
    },

    JSXElement() {
      hasJSX = true
    },
    JSXFragment() {
      hasJSX = true
    },
  })

  return { ast, componentClassName, componentClassNames, functionalComponentInfo, imports, importKinds, hasJSX }
}

export function collectStateReferences(
  ast: t.File,
  storeImports: Map<string, string> = new Map(),
): Map<string, StateRefMeta> {
  const stateRefs = new Map<string, StateRefMeta>()

  storeImports.forEach((source, localName) => {
    stateRefs.set(localName, { kind: 'imported', source })
  })

  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      const init = path.node.init
      if (!init) return

      if (t.isObjectPattern(path.node.id) && t.isThisExpression(init)) {
        for (const prop of path.node.id.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            const localName = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name
            if (!stateRefs.has(localName)) {
              stateRefs.set(localName, { kind: 'local-destructured', propName: prop.key.name })
            }
          }
        }
      }

      if (t.isObjectPattern(path.node.id) && t.isIdentifier(init) && storeImports.has(init.name)) {
        const storeVarName = init.name
        const source = storeImports.get(storeVarName)
        for (const prop of path.node.id.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            const localName = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name
            if (!stateRefs.has(localName)) {
              stateRefs.set(localName, {
                kind: 'imported-destructured',
                source,
                storeVar: storeVarName,
                propName: prop.key.name,
              })
            }
          }
        }
      }

      // const project = projectStore.project — enables resolvePath(project.users) → ['project','users']
      if (
        t.isIdentifier(path.node.id) &&
        t.isMemberExpression(init) &&
        t.isIdentifier(init.object) &&
        storeImports.has(init.object.name) &&
        t.isIdentifier(init.property) &&
        !init.computed
      ) {
        const localName = path.node.id.name
        if (!stateRefs.has(localName)) {
          stateRefs.set(localName, {
            kind: 'store-alias',
            storeVar: init.object.name,
            propName: init.property.name,
          })
        }
      }
    },
  })

  return stateRefs
}
