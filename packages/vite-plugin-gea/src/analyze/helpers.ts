import * as t from '@babel/types'
import type { PathParts, ReactiveBinding, TextExpression } from '../ir/types.ts'
import { buildObserveKey, pathPartsToString, resolvePath } from '../codegen/member-chain.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'

export function resolvePropRef(
  expr: t.Expression | t.JSXEmptyExpression, propsParamName?: string, destructuredPropNames?: Set<string>,
): string | null {
  if (t.isIdentifier(expr) && destructuredPropNames?.has(expr.name)) return expr.name
  if (!t.isMemberExpression(expr) || !t.isIdentifier(expr.property)) return null
  const name = expr.property.name
  if (t.isMemberExpression(expr.object) && t.isIdentifier(expr.object.property) && expr.object.property.name === 'props') {
    if (t.isThisExpression(expr.object.object)) return name
    if (t.isIdentifier(expr.object.object) && expr.object.object.name === propsParamName) return name
  }
  return t.isIdentifier(expr.object) && expr.object.name === (propsParamName || 'props') ? name : null
}

export function resolveExpr(expr: t.Expression | t.JSXEmptyExpression, stateRefs: Map<string, StateRefMeta>): ReturnType<typeof resolvePath> | null {
  if (t.isMemberExpression(expr) && t.isCallExpression(expr.object) && t.isMemberExpression(expr.object.callee))
    return resolvePath(expr.object.callee.object as t.MemberExpression | t.Identifier, stateRefs)
  if (t.isMemberExpression(expr) || t.isIdentifier(expr)) return resolvePath(expr, stateRefs)
  if (t.isCallExpression(expr)) {
    if (t.isMemberExpression(expr.callee)) {
      const r = resolvePath(expr.callee.object as t.MemberExpression | t.Identifier, stateRefs)
      if (r?.parts?.length) return r
    }
    for (const arg of expr.arguments) {
      if (t.isExpression(arg) && (t.isMemberExpression(arg) || t.isIdentifier(arg))) {
        const r = resolvePath(arg as t.MemberExpression | t.Identifier, stateRefs)
        if (r?.parts?.length) return r
      }
    }
  }
  if (t.isTemplateLiteral(expr)) {
    for (const inner of expr.expressions)
      if (t.isExpression(inner)) { const r = resolveExpr(inner, stateRefs); if (r?.parts?.length) return r }
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

/** Collect root array paths from text expressions (direct pathParts + call expression callee objects). */
function collectTextExprArrayDeps(textExpressions: TextExpression[], stateRefs: Map<string, StateRefMeta>, includeDirectPaths = false): Set<string> {
  const deps = new Set<string>()
  for (const te of textExpressions) {
    if (includeDirectPaths && te.pathParts.length > 0) deps.add(te.pathParts[0])
    if (te.expression && t.isCallExpression(te.expression) && t.isMemberExpression(te.expression.callee)) {
      const r = resolvePath(te.expression.callee.object as t.MemberExpression | t.Identifier, stateRefs)
      if (r?.parts?.length) deps.add(r.parts[0]!)
    }
  }
  return deps
}

export function isComputedArrayProp(
  pathParts: PathParts,
  textExpressions: TextExpression[],
  stateRefs: Map<string, StateRefMeta>,
): boolean {
  return pathParts.length > 0 && collectTextExprArrayDeps(textExpressions, stateRefs).has(pathParts[0]!)
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
  const deps = collectTextExprArrayDeps(textExpressions, stateRefs, true)

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
  if (t.isJSXElement(expr) || t.isJSXFragment(expr)) return expr
  if (t.isParenthesizedExpression(expr) && t.isJSXElement(expr.expression)) return expr.expression
  if (t.isConditionalExpression(expr)) return unwrapJSX(expr.consequent) || unwrapJSX(expr.alternate)
  return undefined
}

const META_KEYS = new Set(['type', 'start', 'end', 'loc', 'leadingComments', 'trailingComments', 'innerComments'])

/** Generic AST rewriter: walks every child node and replaces identifiers matched by `lookup`
 *  with the expression returned by `makeReplacement`. Skips non-computed member property keys
 *  and object-literal keys to avoid false rewrites. */
function rewriteIdentifiers(
  root: t.Node,
  lookup: { has(name: string): boolean },
  makeReplacement: (name: string) => t.Expression,
): void {
  const walk = (node: t.Node): void => {
    if (!node || typeof node !== 'object') return
    for (const key of Object.keys(node) as (keyof typeof node)[]) {
      if (META_KEYS.has(key as string)) continue
      const child = (node as any)[key]
      const process = (c: any, idx?: number) => {
        if (!c || typeof c !== 'object' || !c.type) return
        if (t.isIdentifier(c) && lookup.has(c.name)) {
          if (t.isMemberExpression(node) && key === 'property' && !(node as t.MemberExpression).computed) return
          if (t.isObjectProperty(node) && key === 'key') return
          const replacement = makeReplacement(c.name)
          if (idx !== undefined) (child as any[])[idx] = replacement
          else (node as any)[key] = replacement
        } else {
          walk(c)
        }
      }
      if (Array.isArray(child)) child.forEach((c, i) => process(c, i))
      else process(child)
    }
  }
  walk(root)
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
    const indexMap = new Map<string, number>()
    param.elements.forEach((el, i) => { if (t.isIdentifier(el)) indexMap.set(el.name, i) })
    if (indexMap.size === 0) return
    rewriteIdentifiers(arrowFn.body, indexMap, (name) =>
      t.memberExpression(t.identifier(itemName), t.numericLiteral(indexMap.get(name)!), true),
    )
    arrowFn.params[0] = t.identifier(itemName)
    return
  }

  const nameMap = new Map<string, string>()
  for (const prop of param.properties) {
    if (!t.isObjectProperty(prop)) continue
    const keyName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
    const valueName = t.isIdentifier(prop.value) ? prop.value.name : null
    if (keyName && valueName) nameMap.set(valueName, keyName)
  }
  if (nameMap.size === 0) return
  rewriteIdentifiers(arrowFn.body, nameMap, (name) =>
    t.memberExpression(t.identifier(itemName), t.identifier(nameMap.get(name)!)),
  )
  arrowFn.params[0] = t.identifier(itemName)
}

export function extractItemTemplate(arrowFn: t.ArrowFunctionExpression): t.JSXElement | t.JSXFragment | undefined {
  const { body } = arrowFn
  const expr: t.Expression | undefined =
    t.isJSXElement(body) || t.isJSXFragment(body) || t.isConditionalExpression(body) ? body
    : t.isParenthesizedExpression(body) ? body.expression
    : t.isBlockStatement(body) ? (body.body.find((s) => t.isReturnStatement(s)) as t.ReturnStatement | undefined)?.argument as t.Expression | undefined
    : undefined
  return expr ? unwrapJSX(expr) : undefined
}

/** Extract statements from a block-body map callback that precede the JSX return.
 *  Includes variable declarations and early-return guards (e.g. `if (!u) return null`).
 *  Converts early `return null`/`return undefined` to `return ''` so they produce empty strings in .join('').  */
export function extractCallbackBodyStatements(arrowFn: t.ArrowFunctionExpression): t.Statement[] {
  if (!t.isBlockStatement(arrowFn.body)) return []
  const stmts: t.Statement[] = []
  for (const s of arrowFn.body.body) {
    if (t.isReturnStatement(s) && s.argument) {
      if (t.isJSXElement(s.argument) || t.isJSXFragment(s.argument) || t.isParenthesizedExpression(s.argument)) break
      stmts.push(t.returnStatement(t.stringLiteral('')))
    } else { const c = t.cloneNode(s, true) as t.Statement; rewriteEarlyReturns(c); stmts.push(c) }
  }
  return stmts
}

const isNullish = (arg: t.Expression | null | undefined): boolean =>
  !arg || t.isNullLiteral(arg) || (t.isIdentifier(arg) && arg.name === 'undefined')

function rewriteEarlyReturns(node: t.Statement): void {
  if (!t.isIfStatement(node)) return
  for (const branch of [node.consequent, node.alternate] as (t.Statement | null)[]) {
    if (!branch) continue
    if (t.isReturnStatement(branch) && isNullish(branch.argument as t.Expression | null)) {
      if (branch === node.consequent) node.consequent = t.returnStatement(t.stringLiteral(''))
      else node.alternate = t.returnStatement(t.stringLiteral(''))
    } else if (t.isBlockStatement(branch)) branch.body.forEach(rewriteEarlyReturns)
    else if (t.isIfStatement(branch)) rewriteEarlyReturns(branch)
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

function hasJSXAttr(template: t.JSXElement | t.JSXFragment | undefined, name: string): boolean {
  if (!template || !t.isJSXElement(template)) return false
  return template.openingElement.attributes.some(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === name,
  )
}

/** Extract the raw key expression AST from a map item template (for complex keys like template literals). */
export function extractKeyExpression(
  template: t.JSXElement | t.JSXFragment | undefined,
): t.Expression | undefined {
  if (!template || !t.isJSXElement(template)) return undefined
  for (const attr of template.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || attr.name.name !== 'key') continue
    if (!t.isJSXExpressionContainer(attr.value)) continue
    const keyExpr = attr.value.expression
    if (t.isJSXEmptyExpression(keyExpr)) continue
    return keyExpr as t.Expression
  }
  return undefined
}

export function hasExplicitItemKey(template: t.JSXElement | t.JSXFragment | undefined): boolean {
  return hasJSXAttr(template, 'key')
}

export function hasRootUserIdAttribute(template: t.JSXElement | t.JSXFragment | undefined): boolean {
  return hasJSXAttr(template, 'id')
}

export function detectContainerSelector(node: t.JSXElement, tagName: string): string {
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    if (attr.name.name === 'class' && t.isStringLiteral(attr.value)) return `.${attr.value.value.split(' ')[0]}`
    if (attr.name.name === 'id' && t.isStringLiteral(attr.value)) return `#${attr.value.value}`
  }
  return tagName
}
