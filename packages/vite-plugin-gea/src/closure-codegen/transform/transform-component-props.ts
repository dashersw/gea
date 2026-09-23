import type { ClassDeclaration, File, TSType, TSTypeLiteral } from '@babel/types'

import { t, traverse } from '../../utils/babel-interop.ts'

/**
 * Best-effort props-shape inference for compiled component classes.
 *
 * PROBLEM: the codegen rewrites `class HomeView extends Component { ... }`
 * into `class HomeView extends CompiledComponent { ... }` with no type
 * argument. `CompiledComponent<P extends Record<string, any> = Record<string,
 * any>>` then defaults `P` to `Record<string, any>`, so every
 * `this.props.x` read inside the class infers as `any` — even though the
 * original JSX call site (`<HomeView app={this} />`) fully determines the
 * real shape.
 *
 * FIX: scan the module for JSX usages of each locally-declared component and
 * synthesize a `{ attr: Type; ... }` literal from what's actually passed, so
 * callers can thread it onto the rewritten `extends CompiledXxx<...>` clause.
 *
 * This has no type checker to lean on — only the attribute value's own AST
 * shape. Only a few forms are classified:
 *   - `this`                      → the name of the enclosing class
 *   - string / template (static) → `string`
 *   - number / boolean / null literal → their primitive type
 * Anything else (a spread attribute, JSX children, an arbitrary expression)
 * makes that JSX usage "unresolvable", and the whole component is skipped —
 * emitting a narrower-than-reality type would be worse than emitting none,
 * since geatsc has no boxing to fall back on.
 */
/**
 * Names among `componentNames` that appear as a JSX opening-element tag
 * anywhere in this module — regardless of whether the usage is resolvable
 * into a props shape (unlike `inferComponentPropsTypes`, which drops
 * unresolvable or props-less usages entirely).
 *
 * Used to distinguish "used here, but with a shape we couldn't infer" from
 * "never used as JSX in this file at all" — only the latter is safe grounds
 * for treating a class as provably propless. See `applyPropsTypeArgument`
 * in transform.ts for how this combines with `classPropsReadsAreCovered`.
 */
export function collectComponentsUsedAsJsx(ast: File, componentNames: Set<string>): Set<string> {
  const used = new Set<string>()
  if (componentNames.size === 0) return used
  traverse(ast, {
    noScope: true,
    JSXElement(path) {
      const name = path.node.openingElement.name
      if (t.isJSXIdentifier(name) && componentNames.has(name.name)) used.add(name.name)
    },
  })
  return used
}

export function inferComponentPropsTypes(ast: File, componentNames: Set<string>): Map<string, TSTypeLiteral> {
  if (componentNames.size === 0) return new Map()

  const usages = new Map<string, ComponentUsage>()
  const getUsage = (name: string): ComponentUsage => {
    let usage = usages.get(name)
    if (!usage) {
      usage = { attrs: new Map(), siteCount: 0, unresolvable: false }
      usages.set(name, usage)
    }
    return usage
  }

  traverse(ast, {
    noScope: true,
    JSXElement(path) {
      const opening = path.node.openingElement
      const name = opening.name
      if (!t.isJSXIdentifier(name) || !componentNames.has(name.name)) return
      const usage = getUsage(name.name)
      usage.siteCount++

      const meaningfulChildren = (path.node.children ?? []).filter(
        (child) => !(t.isJSXText(child) && /^\s*$/.test(child.value)),
      )
      if (meaningfulChildren.length > 0) usage.unresolvable = true

      const enclosingClassName = findEnclosingClassName(path)
      for (const attr of opening.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) {
          usage.unresolvable = true
          continue
        }
        const attrName = attr.name.name
        const typeStr = classifyAttrValue(attr.value, enclosingClassName)
        if (typeStr == null) {
          usage.unresolvable = true
          continue
        }
        let observation = usage.attrs.get(attrName)
        if (!observation) {
          observation = { types: new Set(), seenCount: 0 }
          usage.attrs.set(attrName, observation)
        }
        observation.types.add(typeStr)
        observation.seenCount++
      }
    },
  })

  const result = new Map<string, TSTypeLiteral>()
  for (const [name, usage] of usages) {
    if (usage.unresolvable || usage.siteCount === 0 || usage.attrs.size === 0) continue
    const members = [...usage.attrs.entries()].map(([attrName, observation]) => {
      const required = observation.seenCount === usage.siteCount
      const member = t.tsPropertySignature(
        t.identifier(attrName),
        t.tsTypeAnnotation(unionOfTypeStrings(observation.types)),
      )
      member.optional = !required
      return member
    })
    result.set(name, t.tsTypeLiteral(members))
  }
  return result
}

/**
 * Guard against emitting a props type narrower than what the class body
 * actually reads. `classDecl` must already reflect the fully-lowered body
 * (template method compiled in place) — this scans every `this.props.<key>`
 * read in the class and requires each key to be present in `propsType`.
 * Only guards against the codegen NARROWING props out from under real reads;
 * it does not otherwise validate the inferred shape.
 */
export function classPropsReadsAreCovered(classDecl: ClassDeclaration, propsType: TSTypeLiteral): boolean {
  const allowed = new Set<string>()
  for (const member of propsType.members) {
    if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) allowed.add(member.key.name)
  }

  let covered = true
  const isPropsMember = (node: any): boolean =>
    (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
    !node.computed &&
    t.isIdentifier(node.property, { name: 'props' }) &&
    t.isThisExpression(node.object)

  const visit = (node: any): void => {
    if (!covered || !node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (
      (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
      !node.computed &&
      t.isIdentifier(node.property) &&
      isPropsMember(node.object)
    ) {
      if (!allowed.has(node.property.name)) covered = false
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      visit(node[key])
    }
  }
  visit(classDecl.body.body)
  return covered
}

interface AttrObservation {
  /** TS primitive/reference type names seen for this attribute across call sites (deduped). */
  types: Set<string>
  /** number of call sites (for this component) that supplied this attribute. */
  seenCount: number
}

interface ComponentUsage {
  attrs: Map<string, AttrObservation>
  siteCount: number
  /** Set once any call site uses this component in a way we can't type. */
  unresolvable: boolean
}

function findEnclosingClassName(path: any): string | null {
  let current = path.parentPath
  while (current) {
    if (current.isFunctionExpression() || current.isFunctionDeclaration()) return null
    if (current.isClassDeclaration()) return current.node.id ? current.node.id.name : null
    current = current.parentPath
  }
  return null
}

function classifyAttrValue(value: any, enclosingClassName: string | null): string | null {
  if (value == null) return 'boolean' // shorthand attr, e.g. `<Foo enabled />`
  if (t.isStringLiteral(value)) return 'string'
  const expr = t.isJSXExpressionContainer(value) ? value.expression : null
  if (!expr || t.isJSXEmptyExpression(expr)) return null
  if (t.isThisExpression(expr)) return enclosingClassName
  if (t.isStringLiteral(expr)) return 'string'
  if (t.isNumericLiteral(expr)) return 'number'
  if (t.isBooleanLiteral(expr)) return 'boolean'
  if (t.isNullLiteral(expr)) return 'null'
  if (t.isTemplateLiteral(expr) && expr.expressions.length === 0) return 'string'
  return null
}

function unionOfTypeStrings(types: Set<string>): TSType {
  const nodes = [...types].sort().map(typeStringToNode)
  if (nodes.length === 1) return nodes[0]
  return t.tsUnionType(nodes)
}

function typeStringToNode(typeStr: string): TSType {
  switch (typeStr) {
    case 'string':
      return t.tsStringKeyword()
    case 'number':
      return t.tsNumberKeyword()
    case 'boolean':
      return t.tsBooleanKeyword()
    case 'null':
      return t.tsNullKeyword()
    default:
      return t.tsTypeReference(t.identifier(typeStr))
  }
}
