import * as t from '@babel/types'
import type { ClassMethod } from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type {
  ObserveDependency,
  PathParts,
  UnresolvedRelationalClassBinding,
} from '../ir.ts'
import {
  buildObserveKey,
  resolvePath,
} from '../utils.ts'
import {
  extractCallbackBodyStatements,
} from './helpers.ts'
import { collectExpressionDependencies, collectTemplateSetupStatements } from './binding-resolver.ts'
import type { StateRefMeta } from '../parse.ts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

/** Derived filter/slice/sort/reverse chain descriptor for unresolved maps. */
export interface DerivedUnresolvedMapDescriptor {
  sourcePathParts: PathParts
  sourceStoreVar?: string
  sourceIsImportedState?: boolean
  stages: Array<{
    method: 'filter' | 'slice' | 'sort' | 'reverse'
    itemVariable?: string
    indexVariable?: string
    predicateExpr?: t.Expression
    callbackBodyStatements?: t.Statement[]
  }>
}

export function resolveHelperCallExpression(
  expr: t.Expression | undefined,
  classBody?: t.ClassBody,
): t.Expression | undefined {
  if (
    !expr ||
    !t.isCallExpression(expr) ||
    !t.isMemberExpression(expr.callee) ||
    !t.isThisExpression(expr.callee.object) ||
    !t.isIdentifier(expr.callee.property)
  ) {
    return expr
  }

  const helperName = expr.callee.property.name
  if (!classBody) return expr

  const helperMethod = classBody.body.find(
    (node) => t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === helperName,
  ) as t.ClassMethod | undefined
  if (!helperMethod || !t.isBlockStatement(helperMethod.body)) return expr

  const returnStmt = helperMethod.body.body.find((stmt) => t.isReturnStatement(stmt) && !!stmt.argument) as
    | t.ReturnStatement
    | undefined
  return returnStmt?.argument ? (t.cloneNode(returnStmt.argument, true) as t.Expression) : expr
}

export function collectHelperMethodDependencies(
  expr: t.Expression | undefined,
  classBody: t.ClassBody | undefined,
  stateRefs: Map<string, StateRefMeta>,
): ObserveDependency[] {
  if (
    !expr ||
    !t.isCallExpression(expr) ||
    !t.isMemberExpression(expr.callee) ||
    !t.isThisExpression(expr.callee.object) ||
    !t.isIdentifier(expr.callee.property) ||
    !classBody
  ) {
    return []
  }

  const helperMethodName = expr.callee.property.name
  const helperMethod = classBody.body.find(
    (node) => t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === helperMethodName,
  ) as t.ClassMethod | undefined
  if (!helperMethod || !t.isBlockStatement(helperMethod.body)) return []

  const deps = new Map<string, ObserveDependency>()
  const program = t.program(helperMethod.body.body.map((stmt) => t.cloneNode(stmt, true)))
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved?.parts?.length) return
      const observeKey = buildObserveKey(resolved.parts, resolved.isImportedState ? resolved.storeVar : undefined)
      if (!deps.has(observeKey)) {
        deps.set(observeKey, {
          observeKey,
          pathParts: resolved.parts,
          storeVar: resolved.isImportedState ? resolved.storeVar : undefined,
        })
      }
    },
  })
  return Array.from(deps.values())
}

export function collectUnresolvedComputationDependencies(
  expr: t.Expression,
  stateRefs: Map<string, StateRefMeta>,
  setupStatements: t.Statement[],
  classBody?: t.ClassBody,
): ObserveDependency[] {
  const helperDeps = collectHelperMethodDependencies(expr, classBody, stateRefs)
  if (helperDeps.length > 0) return helperDeps

  const deps = collectExpressionDependencies(expr, stateRefs, setupStatements)
  collectImportedStoreGetterDependencies(expr, setupStatements, stateRefs).forEach((dep) => {
    if (!deps.some((existing) => existing.observeKey === dep.observeKey)) deps.push(dep)
  })
  return deps
}

export function buildDerivedUnresolvedMapDescriptor(
  expr: t.Expression | undefined,
  stateRefs: Map<string, StateRefMeta>,
  classBody?: t.ClassBody,
): DerivedUnresolvedMapDescriptor | undefined {
  const normalized = resolveHelperCallExpression(expr, classBody)
  const stages: DerivedUnresolvedMapDescriptor['stages'] = []

  const walk = (
    node: t.Expression | t.SpreadElement,
  ): { sourcePathParts: PathParts; sourceStoreVar?: string; sourceIsImportedState?: boolean } | null => {
    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property) &&
      !node.callee.computed
    ) {
      const method = node.callee.property.name
      if (method === 'filter' || method === 'slice' || method === 'sort' || method === 'reverse') {
        const source = walk(node.callee.object as t.Expression)
        if (!source) return null
        const stage: DerivedUnresolvedMapDescriptor['stages'][number] = { method }
        if (method === 'filter' && t.isArrowFunctionExpression(node.arguments[0])) {
          const filterFn = node.arguments[0]
          stage.itemVariable = t.isIdentifier(filterFn.params[0]) ? filterFn.params[0].name : 'item'
          stage.indexVariable = t.isIdentifier(filterFn.params[1]) ? filterFn.params[1].name : undefined
          const callbackBodyStatements = extractCallbackBodyStatements(filterFn)
          if (callbackBodyStatements.length > 0) stage.callbackBodyStatements = callbackBodyStatements
          if (t.isExpression(filterFn.body)) {
            stage.predicateExpr = t.cloneNode(filterFn.body, true) as t.Expression
          } else if (t.isBlockStatement(filterFn.body)) {
            const returnStmt = filterFn.body.body.find(
              (stmt): stmt is t.ReturnStatement => t.isReturnStatement(stmt) && !!stmt.argument,
            )
            if (returnStmt?.argument) {
              stage.predicateExpr = t.cloneNode(returnStmt.argument, true) as t.Expression
            }
          }
        }
        stages.push(stage)
        return source
      }
    }

    if (!t.isExpression(node)) return null
    if (
      !t.isMemberExpression(node) &&
      !t.isIdentifier(node) &&
      !t.isThisExpression(node) &&
      !t.isCallExpression(node)
    ) {
      return null
    }

    const resolved = resolvePath(node, stateRefs)
    if (!resolved?.parts?.length) return null
    return {
      sourcePathParts: resolved.parts,
      sourceStoreVar: resolved.isImportedState ? resolved.storeVar : undefined,
      sourceIsImportedState: resolved.isImportedState || false,
    }
  }

  const source = normalized ? walk(normalized) : null
  if (!source || stages.length === 0) return undefined
  return {
    ...source,
    stages,
  }
}

export function getHelperMethodObserveKey(expr: t.Expression | undefined): string | undefined {
  if (
    !expr ||
    !t.isCallExpression(expr) ||
    !t.isMemberExpression(expr.callee) ||
    !t.isThisExpression(expr.callee.object) ||
    !t.isIdentifier(expr.callee.property)
  ) {
    return undefined
  }
  return buildObserveKey([expr.callee.property.name])
}

export function collectImportedStoreGetterDependencies(
  expr: t.Expression,
  setupStatements: t.Statement[],
  stateRefs: Map<string, StateRefMeta>,
): import('../ir').ObserveDependency[] {
  if (!t.isIdentifier(expr)) return []
  const deps = new Map<string, import('../ir').ObserveDependency>()
  for (const stmt of setupStatements) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const decl of stmt.declarations) {
      if (!t.isObjectPattern(decl.id) || !t.isIdentifier(decl.init)) continue
      const storeRef = stateRefs.get(decl.init.name)
      if (!storeRef || storeRef.kind !== 'imported') continue
      for (const prop of decl.id.properties) {
        if (!t.isObjectProperty(prop)) continue
        const localName = t.isIdentifier(prop.value) ? prop.value.name : t.isIdentifier(prop.key) ? prop.key.name : null
        if (localName !== expr.name) continue
        const getterName = t.isIdentifier(prop.key) ? prop.key.name : null
        const getterStatePaths = getterName ? storeRef.getterDeps?.get(getterName) : undefined
        if (getterStatePaths && getterStatePaths.length > 0) {
          for (const pathParts of getterStatePaths) {
            const observeKey = buildObserveKey(pathParts, decl.init.name)
            deps.set(observeKey, { observeKey, pathParts, storeVar: decl.init.name })
          }
        } else {
          const observeKey = buildObserveKey([], decl.init.name)
          deps.set(observeKey, { observeKey, pathParts: [], storeVar: decl.init.name })
        }
      }
    }
  }
  return Array.from(deps.values())
}

function isInsideRefAttribute(path: NodePath): boolean {
  let current: NodePath | null = path
  while (current) {
    if (t.isJSXAttribute(current.node) && t.isJSXIdentifier(current.node.name) && current.node.name.name === 'ref')
      return true
    current = current.parentPath
  }
  return false
}

export function collectAllStateAccesses(
  templateMethod: ClassMethod,
  stateRefs: Map<string, StateRefMeta>,
  stateProps: Map<string, PathParts>,
  templateSetupContext?: {
    params: Array<t.Identifier | t.Pattern | t.RestElement>
    statements: t.Statement[]
    earlyReturnBarrierIndex?: number
  },
  rootExpr?: t.Expression,
) {
  const params = templateMethod.params.filter((param) => !t.isTSParameterProperty(param)) as t.FunctionParameter[]
  const expr =
    rootExpr && !t.isJSXEmptyExpression(rootExpr)
      ? (t.cloneNode(rootExpr, true) as t.Expression)
      : t.arrowFunctionExpression(params, templateMethod.body)
  const setupStatements =
    rootExpr && templateSetupContext
      ? (() => {
          const collected = collectTemplateSetupStatements(rootExpr, templateSetupContext)
          if (collected.length > 0) return collected.map((s) => t.cloneNode(s, true) as t.Statement)
          if (templateSetupContext.earlyReturnBarrierIndex === undefined) return []
          return templateSetupContext.statements
            .slice(0, templateSetupContext.earlyReturnBarrierIndex + 1)
            .map((s) => t.cloneNode(s, true) as t.Statement)
        })()
      : []
  const prog = t.program([...setupStatements, t.expressionStatement(expr)])

  traverse(prog, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!stateRefs.has(path.node.name)) return
      if (isInsideRefAttribute(path)) return
      const ref = stateRefs.get(path.node.name)!
      // Skip identifiers that are objects of property access -- the MemberExpression
      // handler will register the deeper path (e.g. currentCategory.name -> ["currentCategory", "name"]).
      // But do NOT skip when the member expression is a method call callee (e.g. totalPrice.toLocaleString())
      // or a computed access (e.g. selections[activeCategory]), since the MemberExpression handler
      // won't handle those cases.
      if (
        path.parentPath &&
        t.isMemberExpression(path.parentPath.node) &&
        path.parentPath.node.object === path.node &&
        t.isIdentifier(path.parentPath.node.property) &&
        !path.parentPath.node.computed
      ) {
        const grandParent = path.parentPath.parentPath
        if (
          !(grandParent && t.isCallExpression(grandParent.node) && grandParent.node.callee === path.parentPath.node)
        ) {
          return
        }
      }
      if (ref.kind === 'local-destructured' && ref.propName) {
        const observeKey = buildObserveKey([ref.propName])
        if (!stateProps.has(observeKey)) stateProps.set(observeKey, [ref.propName])
        return
      }
      if (ref.kind === 'imported-destructured' && ref.propName && ref.storeVar) {
        const storeRef = stateRefs.get(ref.storeVar)
        if (storeRef?.getterDeps?.has(ref.propName)) {
          // Register the getter path itself -- delegate resolution in apply-reactivity
          // will map it to observers on the underlying dependency paths.
          const observeKey = buildObserveKey([ref.propName], ref.storeVar)
          if (!stateProps.has(observeKey)) stateProps.set(observeKey, [ref.propName])
        } else if (storeRef?.reactiveFields?.has(ref.propName!)) {
          const observeKey = buildObserveKey([ref.propName], ref.storeVar)
          if (!stateProps.has(observeKey)) stateProps.set(observeKey, [ref.propName])
        } else {
          const observeKey = buildObserveKey([], ref.storeVar)
          if (!stateProps.has(observeKey)) stateProps.set(observeKey, [])
        }
      }
    },
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (!t.isIdentifier(path.node.property)) return
      if (isInsideRefAttribute(path)) return

      const parent = path.parentPath
      if (parent && t.isCallExpression(parent.node) && parent.node.callee === path.node) return

      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved || resolved.parts === null) return

      // optionsStore yields parts: [] -- handle destructuring: const { luggage, seat } = optionsStore
      if (resolved.parts.length === 0 && resolved.storeVar) {
        const decl = parent?.node
        if (t.isVariableDeclarator(decl) && t.isObjectPattern(decl.id)) {
          for (const prop of decl.id.properties) {
            if (!t.isObjectProperty(prop)) continue
            const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
            if (!key) continue
            const observeKey = buildObserveKey([key], resolved.storeVar)
            if (!stateProps.has(observeKey)) stateProps.set(observeKey, [key])
          }
        }
        return
      }

      if (!resolved.parts.length) return
      const parts = [...resolved.parts]
      if (parts.length >= 2 && parts[parts.length - 1] === 'length') parts.pop()
      const observeKey = buildObserveKey(parts, resolved.isImportedState ? resolved.storeVar : undefined)
      if (!stateProps.has(observeKey)) stateProps.set(observeKey, parts)
    },
  })
}

/** Identify store observe keys that appear exclusively inside conditional slot branch content
 *  (not in the condition itself). These don't need rerender observers because the slot rebuild
 *  handles them when the slot is swapped. */
export function computeConditionalSlotScopedStoreKeys(
  conditionalSlots: import('../ir').ConditionalSlot[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  templateSetupContext: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
): Set<string> {
  if (conditionalSlots.length === 0) return new Set()
  const conditionKeys = new Set<string>()
  const branchKeys = new Set<string>()
  for (const slot of conditionalSlots) {
    for (const dep of slot.dependencies || []) conditionKeys.add(dep.observeKey)
    const condDeps = collectExpressionDependencies(slot.conditionExpr, stateRefs, slot.setupStatements)
    for (const dep of condDeps) conditionKeys.add(dep.observeKey)
    if (!slot.originalExpr) continue
    const branches: t.Expression[] = []
    if (t.isConditionalExpression(slot.originalExpr)) {
      branches.push(slot.originalExpr.consequent, slot.originalExpr.alternate)
    } else if (t.isLogicalExpression(slot.originalExpr)) {
      branches.push(slot.originalExpr.right)
    }
    for (const branch of branches) {
      const setupStmts = collectTemplateSetupStatements(branch, templateSetupContext)
      const deps = collectExpressionDependencies(branch, stateRefs, setupStmts)
      for (const dep of deps) branchKeys.add(dep.observeKey)
    }
  }
  const result = new Set<string>()
  for (const key of branchKeys) {
    if (conditionKeys.has(key)) continue
    if (!stateProps.has(key)) continue
    result.add(key)
  }
  return result
}

export function collectItemTemplateStoreDependencies(
  itemTemplate: t.JSXElement | t.JSXFragment | null | undefined,
  itemVar: string,
  stateRefs: Map<string, StateRefMeta>,
  dependencies: Array<{ observeKey: string; pathParts: PathParts; storeVar?: string }>,
): void {
  if (!itemTemplate) return
  const prog = t.program([t.expressionStatement(t.cloneNode(itemTemplate, true) as t.Expression)])
  traverse(prog, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      let root: t.Node = path.node
      while (t.isMemberExpression(root)) root = root.object
      if (t.isIdentifier(root) && root.name === itemVar) return

      const parent = path.parentPath
      if (parent && t.isCallExpression(parent.node) && parent.node.callee === path.node) return

      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved?.parts?.length) return
      const parts = [...resolved.parts]
      if (parts.length >= 2 && parts[parts.length - 1] === 'length') parts.pop()
      const observeKey = buildObserveKey(parts, resolved.isImportedState ? resolved.storeVar : undefined)
      if (!dependencies.some((d) => d.observeKey === observeKey)) {
        dependencies.push({
          observeKey,
          pathParts: parts,
          storeVar: resolved.isImportedState ? resolved.storeVar : undefined,
        })
      }
    },
  })
}

export function detectUnresolvedRelationalClassBindings(
  itemTemplate: t.JSXElement | t.JSXFragment | null | undefined,
  itemVar: string,
  stateRefs: Map<string, StateRefMeta>,
  dependencies: Array<{ observeKey: string; pathParts: PathParts; storeVar?: string }>,
): UnresolvedRelationalClassBinding[] {
  if (!itemTemplate || !t.isJSXElement(itemTemplate)) return []
  const classAttr = itemTemplate.openingElement.attributes.find(
    (attr) =>
      t.isJSXAttribute(attr) &&
      t.isJSXIdentifier(attr.name) &&
      (attr.name.name === 'class' || attr.name.name === 'className'),
  ) as t.JSXAttribute | undefined
  if (!classAttr?.value || !t.isJSXExpressionContainer(classAttr.value)) return []

  const expr = classAttr.value.expression
  const conditionals: t.ConditionalExpression[] = []
  if (t.isTemplateLiteral(expr)) {
    for (const inner of expr.expressions) {
      if (t.isConditionalExpression(inner)) conditionals.push(inner)
    }
  } else if (t.isConditionalExpression(expr)) {
    conditionals.push(expr)
  }

  const results: UnresolvedRelationalClassBinding[] = []
  for (const cond of conditionals) {
    if (!t.isBinaryExpression(cond.test)) continue
    if (!['===', '==', '!==', '!='].includes(cond.test.operator)) continue
    const matchWhenEqual = cond.test.operator === '===' || cond.test.operator === '=='

    let storeObserveKey: string | undefined
    let itemSideFound = false
    let itemProperty: string | undefined

    for (const side of [cond.test.left, cond.test.right]) {
      if (t.isIdentifier(side) && side.name === itemVar) {
        itemSideFound = true
        continue
      }
      if (
        t.isMemberExpression(side) &&
        t.isIdentifier(side.object) &&
        side.object.name === itemVar &&
        t.isIdentifier(side.property)
      ) {
        itemSideFound = true
        itemProperty = side.property.name
        continue
      }
      if (t.isMemberExpression(side) || t.isIdentifier(side)) {
        const resolved = resolvePath(side as t.MemberExpression, stateRefs)
        if (resolved?.parts?.length && resolved.isImportedState) {
          storeObserveKey = buildObserveKey(resolved.parts, resolved.storeVar)
        }
      }
    }

    if (!storeObserveKey || !itemSideFound) continue
    if (!dependencies.some((d) => d.observeKey === storeObserveKey)) continue

    const extractName = (node: t.Expression): string | null => {
      if (t.isStringLiteral(node)) return node.value.trim() || null
      return null
    }
    const className = extractName(cond.consequent as t.Expression) || extractName(cond.alternate as t.Expression)
    if (!className) continue

    const consequentIsClass = !!extractName(cond.consequent as t.Expression)
    results.push({
      observeKey: storeObserveKey,
      classToggleName: className,
      matchWhenEqual: consequentIsClass ? matchWhenEqual : !matchWhenEqual,
      ...(itemProperty ? { itemProperty } : {}),
    })
  }

  return results
}
