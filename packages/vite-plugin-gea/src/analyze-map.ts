import * as t from '@babel/types'
import type {
  ConditionalMapBinding,
  ObserveDependency,
  PathParts,
  ReactiveBinding,
  RelationalMapBinding,
} from './ir.ts'
import { buildObserveKey, resolvePath, generateSelector, getDirectChildElements } from './utils.ts'
import { ITEM_IS_KEY } from './analyze-helpers.ts'
import type { StateRefMeta } from './parse.ts'
import type { NodePath } from '@babel/traverse'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

function getItemMemberPath(expr: t.Expression, itemVar: string): string | null {
  const parts: string[] = []
  let current: t.Expression = expr
  while (t.isMemberExpression(current) && !current.computed && t.isIdentifier(current.property)) {
    parts.unshift(current.property.name)
    current = current.object
  }
  if (!t.isIdentifier(current) || current.name !== itemVar || parts.length === 0) return null
  return parts.join('.')
}

export function analyzeJSXInMap(
  node: t.JSXElement,
  arrayPath: PathParts,
  itemVar: string,
  itemBindings: ReactiveBinding[],
  relationalBindings: RelationalMapBinding[],
  conditionalBindings: ConditionalMapBinding[],
  elementPath: string[],
  isImportedState: boolean,
  itemIdProperty: string,
  stateRefs: Map<string, StateRefMeta>,
  childIndices: number[] = [],
  storeVar?: string,
): void {
  const context = { inMap: true, mapItemVar: itemVar }

  node.openingElement.attributes.forEach((attr) => {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return
    const attrName = attr.name.name
    if (!attr.value || !t.isJSXExpressionContainer(attr.value)) return
    const expr = attr.value.expression

    if (t.isMemberExpression(expr)) {
      analyzeItemMemberExpr(
        expr,
        attrName,
        arrayPath,
        itemVar,
        itemBindings,
        elementPath,
        isImportedState,
        itemIdProperty,
        node,
        stateRefs,
        context,
        childIndices,
      )
    } else if (t.isConditionalExpression(expr)) {
      const isClassAttr = attrName === 'class' || attrName === 'className'
      analyzeItemConditional(
        expr,
        attrName,
        arrayPath,
        itemVar,
        itemBindings,
        relationalBindings,
        conditionalBindings,
        elementPath,
        isImportedState,
        itemIdProperty,
        node,
        stateRefs,
        childIndices,
        storeVar,
        isClassAttr,
      )
    } else if (t.isTemplateLiteral(expr)) {
      analyzeItemTemplateLiteral(
        expr,
        arrayPath,
        itemVar,
        itemBindings,
        relationalBindings,
        conditionalBindings,
        elementPath,
        isImportedState,
        itemIdProperty,
        node,
        stateRefs,
        childIndices,
        storeVar,
      )
    }
  })

  node.children.forEach((child) => {
    if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      if (t.isMemberExpression(child.expression)) {
        const propPathResult = resolvePath(child.expression, stateRefs, context)
        if (propPathResult?.parts?.length === 1 && propPathResult.parts[0] !== 'id') {
          const wildcardPath = [...arrayPath, '*', propPathResult.parts[0]]
          const binding: ReactiveBinding = {
            pathParts: wildcardPath,
            type: 'text',
            selector: generateSelector(elementPath),
            elementPath: [...elementPath],
            childPath: [...childIndices],
            ...(isImportedState ? { isImportedState: true } : {}),
          }
          itemBindings.push(binding)
        }
      } else if (t.isConditionalExpression(child.expression)) {
        collectConditionalBindings(
          child.expression,
          'text',
          undefined,
          conditionalBindings,
          arrayPath,
          itemVar,
          elementPath,
          childIndices,
          stateRefs,
          storeVar,
        )
      }
    }
  })

  getDirectChildElements(node.children).forEach((child, idx) => {
    analyzeJSXInMap(
      child.node,
      arrayPath,
      itemVar,
      itemBindings,
      relationalBindings,
      conditionalBindings,
      [...elementPath, child.selectorSegment],
      isImportedState,
      itemIdProperty,
      stateRefs,
      [...childIndices, idx],
      storeVar,
    )
  })
}

function analyzeItemMemberExpr(
  expr: t.MemberExpression,
  attrName: string,
  arrayPath: PathParts,
  itemVar: string,
  itemBindings: ReactiveBinding[],
  elementPath: string[],
  isImportedState: boolean,
  itemIdProperty: string,
  node: t.JSXElement,
  stateRefs: Map<string, StateRefMeta>,
  context: { inMap: boolean; mapItemVar: string },
  childIndices: number[] = [],
) {
  const result = resolvePath(expr, stateRefs, context)
  if (!result?.parts || result.parts.length !== 1 || result.parts[0] === 'id') return
  const wildcardPath = [...arrayPath, '*', result.parts[0]]
  const binding: ReactiveBinding = {
    pathParts: wildcardPath,
    type: attrName === 'checked' ? 'checked' : attrName === 'value' ? 'value' : 'class',
    selector: generateSelector(elementPath),
    attributeName: attrName,
    elementPath: [...elementPath],
    childPath: [...childIndices],
    itemIdProperty,
    ...(isImportedState ? { isImportedState: true } : {}),
  }
  itemBindings.push(binding)
}

function analyzeItemConditional(
  expr: t.ConditionalExpression,
  attrName: string,
  arrayPath: PathParts,
  itemVar: string,
  itemBindings: ReactiveBinding[],
  relationalBindings: RelationalMapBinding[],
  conditionalBindings: ConditionalMapBinding[],
  elementPath: string[],
  isImportedState: boolean,
  itemIdProperty: string,
  node: t.JSXElement,
  stateRefs: Map<string, StateRefMeta>,
  childIndices: number[] = [],
  storeVar?: string,
  isFullClassExpr?: boolean,
) {
  const relationalBinding = buildRelationalClassBinding(expr, elementPath, itemVar, itemIdProperty, stateRefs)
  if (relationalBinding) {
    if (isFullClassExpr) relationalBinding.scopeClassIsPure = true
    relationalBindings.push(relationalBinding)
    return
  }

  const isClassAttribute = attrName === 'class' || attrName === 'className'

  if (
    isClassAttribute &&
    t.isMemberExpression(expr.test) &&
    t.isIdentifier(expr.test.object) &&
    expr.test.object.name === itemVar
  ) {
    const propName = t.isIdentifier(expr.test.property) ? expr.test.property.name : null
    if (!propName) return

    const detectedClassName = extractClassName(expr.consequent) || extractClassName(expr.alternate)
    const wildcardPath = [...arrayPath, '*', propName]
    const binding: ReactiveBinding = {
      pathParts: wildcardPath,
      type: 'class',
      selector: generateSelector(elementPath),
      attributeName: 'class',
      elementPath: [...elementPath],
      childPath: [...childIndices],
      classToggleName: detectedClassName,
      itemIdProperty,
      ...(isImportedState ? { isImportedState: true } : {}),
    }
    itemBindings.push(binding)
    return
  }

  if (
    isClassAttribute &&
    t.isBinaryExpression(expr.test) &&
    (expr.test.operator === '===' || expr.test.operator === '==')
  ) {
    const detectedClassName = extractClassName(expr.consequent) || extractClassName(expr.alternate)
    if (!detectedClassName) return

    const binding: ReactiveBinding = {
      pathParts: [...arrayPath, '*', 'class'],
      type: 'class',
      selector: generateSelector(elementPath),
      attributeName: 'class',
      elementPath: [...elementPath],
      childPath: [...childIndices],
      classToggleName: detectedClassName,
      itemIdProperty,
      ...(isImportedState ? { isImportedState: true } : {}),
    }
    itemBindings.push(binding)
    return
  }

  collectConditionalBindings(
    expr,
    attrName === 'class' || attrName === 'className' ? 'className' : 'attribute',
    attrName,
    conditionalBindings,
    arrayPath,
    itemVar,
    elementPath,
    childIndices,
    stateRefs,
    storeVar,
  )
}

function analyzeItemTemplateLiteral(
  expr: t.TemplateLiteral,
  arrayPath: PathParts,
  itemVar: string,
  itemBindings: ReactiveBinding[],
  relationalBindings: RelationalMapBinding[],
  conditionalBindings: ConditionalMapBinding[],
  elementPath: string[],
  isImportedState: boolean,
  itemIdProperty: string,
  node: t.JSXElement,
  stateRefs: Map<string, StateRefMeta>,
  childIndices: number[] = [],
  storeVar?: string,
) {
  expr.expressions.forEach((innerExpr) => {
    if (!t.isConditionalExpression(innerExpr)) return
    analyzeItemConditional(
      innerExpr,
      'class',
      arrayPath,
      itemVar,
      itemBindings,
      relationalBindings,
      conditionalBindings,
      elementPath,
      isImportedState,
      itemIdProperty,
      node,
      stateRefs,
      childIndices,
      storeVar,
    )
  })
}

function collectConditionalBindings(
  expr: t.ConditionalExpression,
  type: 'text' | 'className' | 'attribute',
  attributeName: string | undefined,
  conditionalBindings: ConditionalMapBinding[],
  arrayPath: PathParts,
  itemVar: string,
  elementPath: string[],
  childPath: number[],
  stateRefs: Map<string, StateRefMeta>,
  storeVar?: string,
) {
  const dependencies = new Map<string, ObserveDependency>()
  const requiresRerender = conditionalExpressionRequiresRerender(expr)
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const parent = path.parentPath
      if (parent && t.isMemberExpression(parent.node) && parent.node.object === path.node) return

      if (t.isIdentifier(path.node.object) && path.node.object.name === itemVar && t.isIdentifier(path.node.property)) {
        const pathParts = [...arrayPath]
        const observeKey = buildObserveKey(pathParts, storeVar)
        if (!dependencies.has(observeKey)) {
          dependencies.set(observeKey, {
            observeKey,
            pathParts,
            ...(storeVar ? { storeVar } : {}),
          })
        }
        return
      }

      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved?.parts?.length) return
      const observeKey = buildObserveKey(resolved.parts, resolved.isImportedState ? resolved.storeVar : undefined)
      if (!dependencies.has(observeKey)) {
        dependencies.set(observeKey, {
          observeKey,
          pathParts: resolved.parts,
          storeVar: resolved.isImportedState ? resolved.storeVar : undefined,
        })
      }
    },
  })

  dependencies.forEach((observe) => {
    conditionalBindings.push({
      observe,
      type,
      childPath: [...childPath],
      selector: generateSelector(elementPath),
      attributeName,
      expression: t.cloneNode(expr, true),
      requiresRerender,
    })
  })
}

function conditionalExpressionRequiresRerender(expr: t.ConditionalExpression): boolean {
  let needsRerender = false
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    JSXElement(path: NodePath<t.JSXElement>) {
      needsRerender = true
      path.stop()
    },
    JSXFragment(path: NodePath<t.JSXFragment>) {
      needsRerender = true
      path.stop()
    },
  })
  return needsRerender
}

export function buildRelationalClassBinding(
  expr: t.ConditionalExpression,
  elementPath: string[],
  itemVar: string,
  itemIdProperty: string,
  stateRefs: Map<string, StateRefMeta>,
): RelationalMapBinding | null {
  const predicate = resolveExternalIdentityPredicate(expr.test, itemVar, itemIdProperty, stateRefs)
  if (!predicate) return null

  const consequentClass = extractClassName(expr.consequent)
  const alternateClass = extractClassName(expr.alternate)
  const consequentEmpty = isEmptyBranch(expr.consequent)
  const alternateEmpty = isEmptyBranch(expr.alternate)

  if (consequentClass && alternateEmpty) {
    return {
      observePathParts: predicate.observePathParts,
      storeVar: predicate.storeVar,
      selector: generateSelector(elementPath),
      type: 'class',
      itemIdProperty,
      classToggleName: consequentClass,
      classWhenMatch: predicate.matchWhenTrue,
    }
  }

  if (alternateClass && consequentEmpty) {
    return {
      observePathParts: predicate.observePathParts,
      storeVar: predicate.storeVar,
      selector: generateSelector(elementPath),
      type: 'class',
      itemIdProperty,
      classToggleName: alternateClass,
      classWhenMatch: !predicate.matchWhenTrue,
    }
  }

  return null
}

function resolveExternalIdentityPredicate(
  test: t.Expression,
  itemVar: string,
  itemIdProperty: string,
  stateRefs: Map<string, StateRefMeta>,
): { observePathParts: PathParts; storeVar?: string; matchWhenTrue: boolean } | null {
  if (!t.isBinaryExpression(test)) return null
  if (!['===', '==', '!==', '!='].includes(test.operator)) return null

  const left = resolveSide(test.left as t.Expression, itemVar, itemIdProperty, stateRefs)
  const right = resolveSide(test.right as t.Expression, itemVar, itemIdProperty, stateRefs)
  if (!left || !right) return null

  const external = left.kind === 'external' ? left : right.kind === 'external' ? right : null
  const item = left.kind === 'item-id' ? left : right.kind === 'item-id' ? right : null
  if (!external || !item) return null

  return {
    observePathParts: external.observePathParts,
    storeVar: external.storeVar,
    matchWhenTrue: test.operator === '===' || test.operator === '==',
  }
}

function resolveSide(
  expr: t.Expression,
  itemVar: string,
  itemIdProperty: string,
  stateRefs: Map<string, StateRefMeta>,
): { kind: 'external'; observePathParts: PathParts; storeVar?: string } | { kind: 'item-id' } | null {
  if (itemIdProperty === ITEM_IS_KEY && t.isIdentifier(expr) && expr.name === itemVar) {
    return { kind: 'item-id' }
  }
  if (getItemMemberPath(expr, itemVar) === itemIdProperty) {
    return { kind: 'item-id' }
  }

  if (!t.isMemberExpression(expr) && !t.isIdentifier(expr)) return null
  const resolved = resolvePath(expr as t.MemberExpression | t.Identifier, stateRefs)
  if (!resolved?.parts) return null
  if (resolved.parts[0] === itemVar) return null

  return {
    kind: 'external',
    observePathParts: resolved.parts,
    storeVar: resolved.storeVar,
  }
}

function isEmptyBranch(node: t.Expression): boolean {
  return (
    (t.isStringLiteral(node) && node.value.trim() === '') ||
    (t.isTemplateLiteral(node) && node.expressions.length === 0 && node.quasis.every((q) => q.value.raw.trim() === ''))
  )
}

function extractClassName(node: t.Expression): string | undefined {
  if (t.isStringLiteral(node)) {
    const cls = node.value.trim()
    return cls ? cls.split(' ')[0] : undefined
  }
  if (t.isTemplateLiteral(node)) {
    const raw = node.quasis[0]?.value.raw.trim()
    return raw ? raw.split(' ')[0] : undefined
  }
  return undefined
}
