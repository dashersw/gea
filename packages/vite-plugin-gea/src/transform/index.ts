import * as t from '@babel/types'
import _traverse from '@babel/traverse'
import type { File } from '@babel/types'
import { parse } from '../parse.js'
import { codegen } from '../codegen.js'
import { analyzeImports, identifyReactiveSources } from '../analyze/index.js'
import type { RuntimeHelper } from '../utils.js'
import { isUpperCase } from '../utils.js'
import { transformClassComponent } from './component-class.js'
import { transformFunctionComponent } from './function-component.js'
import { transformStoreClass } from './store-class.js'
import { transformJSXElement } from './jsx-element.js'
import { substituteExpression } from './jsx-expression.js'

// Handle ESM / CJS compat for @babel/traverse
const traverse = (typeof (_traverse as any).default === 'function'
  ? (_traverse as any).default
  : _traverse) as typeof _traverse

/**
 * Main entry point: parse source, analyze, transform, codegen.
 * Returns the transformed source code, or null if no transform was needed.
 */
export function transformSource(source: string, id?: string): string | null {
  const ast = parse(source)
  const imports = analyzeImports(ast)

  // Only transform files that use gea or have JSX
  // Heuristic: has Component/Store import from '@geajs/core', or has JSX syntax,
  // or has `extends Store` / `extends Component` (e.g. test files importing from relative paths)
  const hasGeaImport = imports.geaNamed.size > 0
  const hasJSX = source.includes('<') && (source.includes('/>') || source.includes('</'))
  const hasExtendsGea = source.includes('extends Store') || source.includes('extends Component')

  if (!hasGeaImport && !hasJSX && !hasExtendsGea) return null

  const reactiveSources = identifyReactiveSources(imports)
  const usedHelpers = new Set<RuntimeHelper>()
  const templateDeclarations: t.Statement[] = []
  const templateCounter = { value: 0 }

  // 1. Transform Component templates FIRST (renames template → __createTemplate)
  //    Recognises `extends Component` and any class with a `template()` method
  //    containing JSX (covers custom bases like ZagComponent).
  function hasTemplateMethod(body: t.ClassBody): boolean {
    return body.body.some(
      (m) =>
        t.isClassMethod(m) &&
        t.isIdentifier(m.key, { name: 'template' }) &&
        !m.computed &&
        !m.static,
    )
  }
  traverse(ast, {
    ClassDeclaration(path) {
      const node = path.node
      if (!node.superClass) return
      const isComponent =
        (t.isIdentifier(node.superClass) && node.superClass.name === 'Component') ||
        (t.isMemberExpression(node.superClass) &&
          t.isIdentifier(node.superClass.property, { name: 'Component' })) ||
        hasTemplateMethod(node.body)
      if (!isComponent) return
      transformClassComponent(node.body, reactiveSources, usedHelpers, templateDeclarations, templateCounter)
    },
  })

  // 2. Transform fields → signals and methods → batch for ALL reactive classes
  //    (extends Store OR extends Component). Handles both declarations and expressions.
  //    Runs AFTER template transform so [GEA_CREATE_TEMPLATE] gets skipped (computed/Symbol key).
  const allSignalConstants: Array<{ name: string; fieldName: string }> = []
  function visitReactiveClass(node: t.ClassDeclaration | t.ClassExpression) {
    if (!node.superClass) return
    const name = t.isIdentifier(node.superClass) ? node.superClass.name : null
    const memberName = t.isMemberExpression(node.superClass) && t.isIdentifier(node.superClass.property)
      ? node.superClass.property.name : null
    if (name !== 'Store' && name !== 'Component' && memberName !== 'Store' && memberName !== 'Component') return
    const result = transformStoreClass(node.body, usedHelpers)
    if (result.signalConstants.length > 0) {
      allSignalConstants.push(...result.signalConstants)
    }
  }
  traverse(ast, {
    ClassDeclaration(path) { visitReactiveClass(path.node) },
    ClassExpression(path) { visitReactiveClass(path.node) },
  })

  // Transform function components
  traverse(ast, {
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration
      if (t.isFunctionDeclaration(decl) && decl.id && isUpperCase(decl.id.name)) {
        transformFunctionComponent(decl, reactiveSources, usedHelpers, templateDeclarations, templateCounter)
      }
    },
    ExportNamedDeclaration(path) {
      const decl = path.node.declaration
      if (t.isFunctionDeclaration(decl) && decl.id && isUpperCase(decl.id.name)) {
        transformFunctionComponent(decl, reactiveSources, usedHelpers, templateDeclarations, templateCounter)
      }
    },
  })

  // Generic JSX sweep: compile any remaining JSXElements in the AST.
  // After class/function component transforms, JSX inside expressions
  // (map callbacks, ternaries, etc.) may still be unconverted.
  // Each remaining JSXElement → IIFE: (() => { template + DOM ops; return __el })()
  traverse(ast, {
    JSXElement(path) {
      // Check if this is a component reference (uppercase tag) — those become __mount calls
      const opening = path.node.openingElement
      if (t.isJSXIdentifier(opening.name) && isUpperCase(opening.name.name)) {
        // Component JSX — transform into __mount call
        const compName = opening.name.name
        const propsEntries: t.ObjectProperty[] = []
        const childNodes: t.Expression[] = []

        for (const attr of opening.attributes) {
          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
            if (attr.name.name === 'key') continue
            let val: t.Expression
            if (t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)) {
              val = attr.value.expression
            } else if (t.isStringLiteral(attr.value)) {
              val = attr.value
            } else if (attr.value === null) {
              val = t.booleanLiteral(true)
            } else {
              continue
            }
            propsEntries.push(t.objectProperty(t.identifier(attr.name.name), t.arrowFunctionExpression([], val)))
          }
        }

        // Collect children
        for (const child of path.node.children) {
          if (t.isJSXText(child)) {
            const text = child.value.replace(/\n\s*/g, ' ').trim()
            if (text) childNodes.push(t.stringLiteral(text))
          } else if (t.isJSXExpressionContainer(child) && t.isExpression(child.expression)) {
            childNodes.push(child.expression)
          } else if (t.isJSXElement(child)) {
            // Will be handled by recursive traversal
            childNodes.push(child as any)
          }
        }

        if (childNodes.length > 0) {
          const childExpr = childNodes.length === 1 ? childNodes[0] : t.arrayExpression(childNodes)
          propsEntries.push(t.objectProperty(t.identifier('children'),
            t.arrowFunctionExpression([], childExpr)))
        }

        const propsObj = propsEntries.length > 0 ? t.objectExpression(propsEntries) : t.objectExpression([])
        usedHelpers.add('mount')

        path.replaceWith(
          t.callExpression(t.identifier('mount'), [t.identifier(compName), propsObj])
        )
        return
      }

      // Plain HTML element JSX — transform into template + DOM manipulation IIFE
      const ctx = {
        subs: new Map<string, string>(),
        usedHelpers,
        elementCounter: { value: 0 },
        anchorCounter: { value: 0 },
        compCounter: { value: 0 },
        templateDeclarations,
        templateCounter,
      }

      try {
        const [stmts, rootId] = transformJSXElement(path.node, ctx)
        const iife = t.callExpression(
          t.arrowFunctionExpression(
            [],
            t.blockStatement([...stmts, t.returnStatement(rootId)]),
          ),
          [],
        )
        path.replaceWith(iife)
      } catch {
        // If transform fails, leave as-is (will be caught as error later)
      }
    },
  })

  // If no helpers were used, no transforms happened
  if (usedHelpers.size === 0) return null

  // Inject runtime import
  injectRuntimeImport(ast, usedHelpers)

  // No symbol constants needed — store fields use string-keyed properties ($$gea_<name>)

  // Inject template declarations at module level (after imports)
  if (templateDeclarations.length > 0) {
    injectTemplateDeclarations(ast, templateDeclarations)
  }

  return codegen(ast)
}

/**
 * Inject `import { ... } from "@geajs/core/runtime"` at the top of the file.
 */
function injectRuntimeImport(ast: File, helpers: Set<RuntimeHelper>): void {
  const specifiers = Array.from(helpers)
    .sort()
    .map((name) =>
      t.importSpecifier(t.identifier(name), t.identifier(name)),
    )

  const importDecl = t.importDeclaration(specifiers, t.stringLiteral('@geajs/core/runtime'))

  // Insert at the top, after any existing imports
  let lastImportIdx = -1
  for (let i = 0; i < ast.program.body.length; i++) {
    if (t.isImportDeclaration(ast.program.body[i])) {
      lastImportIdx = i
    }
  }

  ast.program.body.splice(lastImportIdx + 1, 0, importDecl)
}

/**
 * Inject template declarations at module level, after all imports.
 */
function injectTemplateDeclarations(ast: File, declarations: t.Statement[]): void {
  let lastImportIdx = -1
  for (let i = 0; i < ast.program.body.length; i++) {
    if (t.isImportDeclaration(ast.program.body[i])) {
      lastImportIdx = i
    }
  }

  // Insert after imports
  ast.program.body.splice(lastImportIdx + 1, 0, ...declarations)
}

export { transformClassComponent } from './component-class.js'
export { transformFunctionComponent } from './function-component.js'
export { transformJSXElement } from './jsx-element.js'
export { classifyAttributes } from './jsx-attributes.js'
export { classifyChildren } from './jsx-children.js'
export { substituteExpression, exprToString } from './jsx-expression.js'
export { transformStoreClass } from './store-class.js'
