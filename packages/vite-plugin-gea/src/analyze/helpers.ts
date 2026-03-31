import * as t from '@babel/types'
import type { PathParts, ReactiveBinding, TextExpression } from '../ir.ts'
import { buildObserveKey, pathPartsToString, resolvePath } from '../utils.ts'
import type { StateRefMeta } from '../parse.ts'

export function resolvePropRef(
  expr: t.Expression | t.JSXEmptyExpression,
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
): string | null {
  if (t.isIdentifier(expr) && destructuredPropNames?.has(expr.name)) return expr.name
  if (!t.isMemberExpression(expr) || !t.isIdentifier(expr.property)) return null
  const propName = expr.property.name
  if (
    t.isMemberExpression(expr.object) &&
    t.isIdentifier(expr.object.property) &&
    expr.object.property.name === 'props'
  ) {
    const obj = expr.object.object
    if (t.isThisExpression(obj)) return propName
    if (t.isIdentifier(obj) && obj.name === propsParamName) return propName
  }
  if (t.isIdentifier(expr.object) && expr.object.name === (propsParamName || 'props')) return propName
  return null
}

export function resolveExpr(expr: t.Expression | t.JSXEmptyExpression, stateRefs: Map<string, StateRefMeta>) {
  if (t.isMemberExpression(expr) && t.isCallExpression(expr.object) && t.isMemberExpression(expr.object.callee)) {
    return resolvePath(expr.object.callee.object as t.MemberExpression | t.Identifier, stateRefs)
  }
  if (t.isMemberExpression(expr) || t.isIdentifier(expr)) return resolvePath(expr, stateRefs)
  if (t.isCallExpression(expr)) {
    if (t.isMemberExpression(expr.callee)) {
      const result = resolvePath(expr.callee.object as t.MemberExpression | t.Identifier, stateRefs)
      if (result?.parts?.length) return result
    }
    for (const arg of expr.arguments) {
      if (t.isExpression(arg) && (t.isMemberExpression(arg) || t.isIdentifier(arg))) {
        const result = resolvePath(arg as t.MemberExpression | t.Identifier, stateRefs)
        if (result?.parts?.length) return result
      }
    }
  }
  // Handle template literals: resolve the first expression that references state
  if (t.isTemplateLiteral(expr)) {
    for (const inner of expr.expressions) {
      if (t.isExpression(inner)) {
        const result = resolveExpr(inner, stateRefs)
        if (result?.parts?.length) return result
      }
    }
  }
  return null
}

export function applyImportedState(
  binding: ReactiveBinding,
  result: { parts: PathParts | null; isImportedState?: boolean; storeVar?: string },
  stateProps: Map<string, PathParts>,
) {
  if (result.isImportedState && result.parts) {
    binding.isImportedState = true
    binding.storeVar = result.storeVar
    stateProps.set(buildObserveKey(result.parts, result.storeVar), [...result.parts])
  }
}

export function isComputedArrayProp(
  pathParts: PathParts,
  textExpressions: TextExpression[],
  stateRefs: Map<string, StateRefMeta>,
): boolean {
  const deps = new Set<string>()
  textExpressions.forEach((te) => {
    if (te.expression && t.isCallExpression(te.expression) && t.isMemberExpression(te.expression.callee)) {
      const r = resolvePath(te.expression.callee.object as t.MemberExpression | t.Identifier, stateRefs)
      if (r?.parts?.length) deps.add(r.parts[0]!)
    }
  })
  return pathParts.length > 0 && deps.has(pathParts[0]!)
}

export function addArrayTextBindings(
  selector: string,
  tagName: string,
  elementPath: string[],
  bindings: ReactiveBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  textTemplate: string,
  textExpressions: TextExpression[],
  result: { parts: PathParts | null; isImportedState?: boolean; storeVar?: string },
) {
  const deps = new Set<string>()
  textExpressions.forEach((te) => {
    if (te.pathParts.length > 0) deps.add(te.pathParts[0])
    if (te.expression && t.isCallExpression(te.expression) && t.isMemberExpression(te.expression.callee)) {
      const r = resolvePath(te.expression.callee.object as t.MemberExpression | t.Identifier, stateRefs)
      if (r?.parts?.length) deps.add(r.parts[0]!)
    }
  })

  deps.forEach((arrayPath) => {
    const existing = bindings.find((b) => pathPartsToString(b.pathParts) === arrayPath)
    if (!existing) {
      const isArr = result.parts?.[0] === arrayPath
      if (isArr) stateProps.set(buildObserveKey([arrayPath], result.storeVar), [arrayPath])
      bindings.push({
        pathParts: [arrayPath],
        type: 'text',
        selector,
        elementPath: [...elementPath],
        textTemplate,
        textExpressions,
        ...(isArr ? { isImportedState: true, storeVar: result.storeVar } : {}),
      })
    } else if (existing.type === 'text' && !existing.textTemplate) {
      existing.textTemplate = textTemplate
      existing.textExpressions = textExpressions
    }
  })
}

function unwrapJSX(expr: t.Expression): t.JSXElement | t.JSXFragment | undefined {
  if (t.isJSXElement(expr)) return expr
  if (t.isJSXFragment(expr)) return expr
  if (t.isParenthesizedExpression(expr) && t.isJSXElement(expr.expression)) return expr.expression
  if (t.isConditionalExpression(expr)) {
    const fromCons = unwrapJSX(expr.consequent)
    if (fromCons) return fromCons
    return unwrapJSX(expr.alternate)
  }
  return undefined
}

/** When a .map() callback uses destructured parameters like ({ a, b }) => ...,
 *  normalize it to (__item) => ... with all destructured name references rewritten
 *  as member expressions on __item (e.g., a -> __item.a). */
export function normalizeDestructuredMapCallback(arrowFn: t.ArrowFunctionExpression): void {
  const param = arrowFn.params[0]
  if (!param || t.isIdentifier(param) || t.isRestElement(param)) return
  if (!t.isObjectPattern(param) && !t.isArrayPattern(param)) return

  const itemName = '__item'

  if (t.isArrayPattern(param)) {
    // Handle array destructuring like ([key, value]) from Object.entries()
    const indexMap = new Map<string, number>()
    for (let i = 0; i < param.elements.length; i++) {
      const el = param.elements[i]
      if (t.isIdentifier(el)) indexMap.set(el.name, i)
    }
    if (indexMap.size === 0) return

    const rewriteNode = (node: t.Node): void => {
      if (!node || typeof node !== 'object') return
      for (const key of Object.keys(node) as (keyof typeof node)[]) {
        if (
          key === 'type' ||
          key === 'start' ||
          key === 'end' ||
          key === 'loc' ||
          key === 'leadingComments' ||
          key === 'trailingComments' ||
          key === 'innerComments'
        )
          continue
        const child = (node as any)[key]
        if (Array.isArray(child)) {
          for (let i = 0; i < child.length; i++) {
            if (child[i] && typeof child[i] === 'object' && child[i].type) {
              if (t.isIdentifier(child[i]) && indexMap.has(child[i].name)) {
                if (t.isMemberExpression(node) && key === 'property' && !(node as t.MemberExpression).computed) continue
                if (t.isObjectProperty(node) && key === 'key') continue
                child[i] = t.memberExpression(
                  t.identifier(itemName),
                  t.numericLiteral(indexMap.get(child[i].name)!),
                  true,
                )
              } else {
                rewriteNode(child[i])
              }
            }
          }
        } else if (child && typeof child === 'object' && child.type) {
          if (t.isIdentifier(child) && indexMap.has(child.name)) {
            if (t.isMemberExpression(node) && key === 'property' && !(node as t.MemberExpression).computed) continue
            if (t.isObjectProperty(node) && key === 'key') continue
            ;(node as any)[key] = t.memberExpression(
              t.identifier(itemName),
              t.numericLiteral(indexMap.get(child.name)!),
              true,
            )
          } else {
            rewriteNode(child)
          }
        }
      }
    }
    rewriteNode(arrowFn.body)
    arrowFn.params[0] = t.identifier(itemName)
    return
  }

  // Collect local->property name mappings from the ObjectPattern
  const nameMap = new Map<string, string>()
  for (const prop of param.properties) {
    if (t.isObjectProperty(prop)) {
      const keyName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
      const valueName = t.isIdentifier(prop.value) ? prop.value.name : null
      if (keyName && valueName) nameMap.set(valueName, keyName)
    }
  }
  if (nameMap.size === 0) return

  // Rewrite all identifier references in the body
  const rewriteNode = (node: t.Node): void => {
    if (!node || typeof node !== 'object') return
    for (const key of Object.keys(node) as (keyof typeof node)[]) {
      if (
        key === 'type' ||
        key === 'start' ||
        key === 'end' ||
        key === 'loc' ||
        key === 'leadingComments' ||
        key === 'trailingComments' ||
        key === 'innerComments'
      )
        continue
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          if (child[i] && typeof child[i] === 'object' && child[i].type) {
            if (t.isIdentifier(child[i]) && nameMap.has(child[i].name)) {
              // Don't replace if it's a property key in a member expression
              if (t.isMemberExpression(node) && key === 'property' && !(node as t.MemberExpression).computed) continue
              // Don't replace if it's a property key in an object
              if (t.isObjectProperty(node) && key === 'key') continue
              child[i] = t.memberExpression(t.identifier(itemName), t.identifier(nameMap.get(child[i].name)!))
            } else {
              rewriteNode(child[i])
            }
          }
        }
      } else if (child && typeof child === 'object' && child.type) {
        if (t.isIdentifier(child) && nameMap.has(child.name)) {
          if (t.isMemberExpression(node) && key === 'property' && !(node as t.MemberExpression).computed) continue
          if (t.isObjectProperty(node) && key === 'key') continue
          ;(node as any)[key] = t.memberExpression(t.identifier(itemName), t.identifier(nameMap.get(child.name)!))
        } else {
          rewriteNode(child)
        }
      }
    }
  }
  rewriteNode(arrowFn.body)

  arrowFn.params[0] = t.identifier(itemName)
}

export function extractItemTemplate(arrowFn: t.ArrowFunctionExpression): t.JSXElement | t.JSXFragment | undefined {
  let body: t.Expression | undefined
  if (t.isJSXElement(arrowFn.body) || t.isJSXFragment(arrowFn.body)) body = arrowFn.body
  else if (t.isParenthesizedExpression(arrowFn.body)) body = arrowFn.body.expression
  else if (t.isBlockStatement(arrowFn.body)) {
    const returnStmt = arrowFn.body.body.find((s) => t.isReturnStatement(s)) as t.ReturnStatement | undefined
    body = returnStmt?.argument as t.Expression | undefined
  } else if (t.isConditionalExpression(arrowFn.body)) body = arrowFn.body
  return body ? unwrapJSX(body) : undefined
}

/** Extract statements from a block-body map callback that precede the JSX return.
 *  Includes variable declarations and early-return guards (e.g. `if (!u) return null`).
 *  Converts early `return null`/`return undefined` to `return ''` so they produce empty strings in .join('').  */
export function extractCallbackBodyStatements(arrowFn: t.ArrowFunctionExpression): t.Statement[] {
  if (!t.isBlockStatement(arrowFn.body)) return []
  const stmts: t.Statement[] = []
  for (const s of arrowFn.body.body) {
    if (t.isReturnStatement(s) && s.argument) {
      if (t.isJSXElement(s.argument) || t.isJSXFragment(s.argument) || t.isParenthesizedExpression(s.argument)) {
        break
      }
      stmts.push(t.returnStatement(t.stringLiteral('')))
    } else {
      const cloned = t.cloneNode(s, true) as t.Statement
      rewriteEarlyReturns(cloned)
      stmts.push(cloned)
    }
  }
  return stmts
}

function rewriteEarlyReturns(node: t.Statement): void {
  if (t.isIfStatement(node)) {
    if (t.isReturnStatement(node.consequent)) {
      if (
        !node.consequent.argument ||
        t.isNullLiteral(node.consequent.argument) ||
        (t.isIdentifier(node.consequent.argument) && node.consequent.argument.name === 'undefined')
      ) {
        node.consequent = t.returnStatement(t.stringLiteral(''))
      }
    } else if (t.isBlockStatement(node.consequent)) {
      node.consequent.body.forEach(rewriteEarlyReturns)
    }
    if (node.alternate) {
      if (t.isReturnStatement(node.alternate)) {
        if (
          !node.alternate.argument ||
          t.isNullLiteral(node.alternate.argument) ||
          (t.isIdentifier(node.alternate.argument) && node.alternate.argument.name === 'undefined')
        ) {
          node.alternate = t.returnStatement(t.stringLiteral(''))
        }
      } else {
        rewriteEarlyReturns(node.alternate)
      }
    }
  }
}

/** Sentinel returned by detectItemIdProperty when `key={item}` -- the item itself is the key. */
export const ITEM_IS_KEY = '__self__'

function getItemMemberPath(expr: t.Expression, itemVar: string): string | undefined {
  const parts: string[] = []
  let current: t.Expression = expr
  while (t.isMemberExpression(current) && !current.computed && t.isIdentifier(current.property)) {
    parts.unshift(current.property.name)
    current = current.object
  }
  if (!t.isIdentifier(current) || current.name !== itemVar || parts.length === 0) return undefined
  return parts.join('.')
}

export function detectItemIdProperty(
  template: t.JSXElement | t.JSXFragment | undefined,
  itemVar: string,
): string | undefined {
  if (!template || !t.isJSXElement(template)) return undefined
  for (const attr of template.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || attr.name.name !== 'key') continue
    if (!t.isJSXExpressionContainer(attr.value)) continue
    const keyExpr = attr.value.expression
    const memberPath = getItemMemberPath(keyExpr as t.Expression, itemVar)
    if (memberPath) return memberPath
    if (t.isIdentifier(keyExpr) && keyExpr.name === itemVar) return ITEM_IS_KEY
  }
  return undefined
}

export function hasExplicitItemKey(template: t.JSXElement | t.JSXFragment | undefined): boolean {
  if (!template || !t.isJSXElement(template)) return false
  return template.openingElement.attributes.some(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'key',
  )
}

export function hasRootUserIdAttribute(template: t.JSXElement | t.JSXFragment | undefined): boolean {
  if (!template || !t.isJSXElement(template)) return false
  return template.openingElement.attributes.some(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'id',
  )
}

export function detectContainerSelector(node: t.JSXElement, tagName: string): string {
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    if (attr.name.name === 'class' && t.isStringLiteral(attr.value)) return `.${attr.value.value.split(' ')[0]}`
    if (attr.name.name === 'id' && t.isStringLiteral(attr.value)) return `#${attr.value.value}`
  }
  return tagName
}
