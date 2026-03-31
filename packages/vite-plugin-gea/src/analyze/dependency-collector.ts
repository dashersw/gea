import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import type { ClassMethod } from '@babel/types'
import type { ObserveDependency, PathParts, UnresolvedRelationalClassBinding } from '../ir/types.ts'
import { buildObserveKey, resolvePath } from '../codegen/member-chain.ts'
import { extractCallbackBodyStatements } from './helpers.ts'
import { collectExpressionDependencies, collectTemplateSetupStatements } from './binding-resolver.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'

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

/** Strip trailing `.length` from path parts (we observe the array, not its length). */
function stripLength(parts: PathParts): PathParts {
  const p = [...parts]
  if (p.length >= 2 && p[p.length - 1] === 'length') p.pop()
  return p
}

/** Extract the helper method name from a `this.helperName()` call expression, or null. */
function getThisCallName(expr: t.Expression | undefined): string | null {
  if (
    !expr ||
    !t.isCallExpression(expr) ||
    !t.isMemberExpression(expr.callee) ||
    !t.isThisExpression(expr.callee.object) ||
    !t.isIdentifier(expr.callee.property)
  )
    return null
  return expr.callee.property.name
}

/** Find a class method by name in a ClassBody. */
function findClassMethod(classBody: t.ClassBody | undefined, name: string): t.ClassMethod | undefined {
  if (!classBody) return undefined
  const m = classBody.body.find(
    (node) => t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === name,
  ) as t.ClassMethod | undefined
  return m && t.isBlockStatement(m.body) ? m : undefined
}

export function resolveHelperCallExpression(
  expr: t.Expression | undefined,
  classBody?: t.ClassBody,
): t.Expression | undefined {
  const name = getThisCallName(expr)
  if (!name) return expr
  const method = findClassMethod(classBody, name)
  if (!method) return expr
  const returnStmt = method.body.body.find((stmt) => t.isReturnStatement(stmt) && !!stmt.argument) as
    | t.ReturnStatement
    | undefined
  return returnStmt?.argument ? (t.cloneNode(returnStmt.argument, true) as t.Expression) : expr
}

export function collectHelperMethodDependencies(
  expr: t.Expression | undefined,
  classBody: t.ClassBody | undefined,
  stateRefs: Map<string, StateRefMeta>,
): ObserveDependency[] {
  const name = getThisCallName(expr)
  const method = name ? findClassMethod(classBody, name) : undefined
  if (!method) return []

  const deps = new Map<string, ObserveDependency>()
  traverse(t.program(method.body.body.map((s) => t.cloneNode(s, true))), {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const r = resolvePath(path.node, stateRefs)
      if (!r?.parts?.length) return
      const storeVar = r.isImportedState ? r.storeVar : undefined
      const key = buildObserveKey(r.parts, storeVar)
      if (!deps.has(key)) deps.set(key, { observeKey: key, pathParts: r.parts, storeVar })
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
      const CHAIN_METHODS = new Set(['filter', 'slice', 'sort', 'reverse'])
      if (CHAIN_METHODS.has(method)) {
        const source = walk(node.callee.object as t.Expression)
        if (!source) return null
        const stage: DerivedUnresolvedMapDescriptor['stages'][number] = { method: method as 'filter' }
        if (method === 'filter' && t.isArrowFunctionExpression(node.arguments[0])) {
          const fn = node.arguments[0]
          stage.itemVariable = t.isIdentifier(fn.params[0]) ? fn.params[0].name : 'item'
          stage.indexVariable = t.isIdentifier(fn.params[1]) ? fn.params[1].name : undefined
          const cbs = extractCallbackBodyStatements(fn)
          if (cbs.length > 0) stage.callbackBodyStatements = cbs
          const predicate = t.isExpression(fn.body) ? fn.body
            : t.isBlockStatement(fn.body) ? (fn.body.body.find((s): s is t.ReturnStatement => t.isReturnStatement(s) && !!s.argument))?.argument
            : undefined
          if (predicate) stage.predicateExpr = t.cloneNode(predicate, true) as t.Expression
        }
        stages.push(stage)
        return source
      }
    }

    if (
      !t.isMemberExpression(node) &&
      !t.isIdentifier(node) &&
      !t.isThisExpression(node) &&
      !t.isCallExpression(node)
    )
      return null

    const resolved = resolvePath(node as t.MemberExpression | t.Identifier, stateRefs)
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
  const name = getThisCallName(expr)
  return name ? buildObserveKey([name]) : undefined
}

export function collectImportedStoreGetterDependencies(
  expr: t.Expression,
  setupStatements: t.Statement[],
  stateRefs: Map<string, StateRefMeta>,
): import('../ir').ObserveDependency[] {
  if (!t.isIdentifier(expr)) return []
  const deps = new Map<string, import('../ir').ObserveDependency>()
  const addDep = (parts: PathParts, sv: string) => {
    const key = buildObserveKey(parts, sv); if (!deps.has(key)) deps.set(key, { observeKey: key, pathParts: parts, storeVar: sv })
  }
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
        const gn = t.isIdentifier(prop.key) ? prop.key.name : null
        const gsp = gn ? storeRef.getterDeps?.get(gn) : undefined
        if (gsp?.length) { for (const p of gsp) addDep(p, decl.init.name) }
        else addDep([], decl.init.name)
      }
    }
  }
  return Array.from(deps.values())
}

function isInsideRefAttribute(path: NodePath): boolean {
  for (let c: NodePath | null = path; c; c = c.parentPath)
    if (t.isJSXAttribute(c.node) && t.isJSXIdentifier(c.node.name) && c.node.name.name === 'ref') return true
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
  let setupStatements: t.Statement[] = []
  if (rootExpr && templateSetupContext) {
    const collected = collectTemplateSetupStatements(rootExpr, templateSetupContext)
    const cloneAll = (stmts: t.Statement[]) => stmts.map((s) => t.cloneNode(s, true) as t.Statement)
    setupStatements = collected.length > 0 ? cloneAll(collected)
      : templateSetupContext.earlyReturnBarrierIndex !== undefined
        ? cloneAll(templateSetupContext.statements.slice(0, templateSetupContext.earlyReturnBarrierIndex + 1))
        : []
  }
  const prog = t.program([...setupStatements, t.expressionStatement(expr)])
  const record = (parts: PathParts, storeVar?: string) => {
    const key = buildObserveKey(parts, storeVar)
    if (!stateProps.has(key)) stateProps.set(key, parts)
  }

  traverse(prog, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!stateRefs.has(path.node.name) || isInsideRefAttribute(path)) return
      const ref = stateRefs.get(path.node.name)!
      // Skip identifiers that are objects of non-computed property access (MemberExpression
      // registers deeper path), unless parent is a method call callee or computed access.
      const pp = path.parentPath
      if (pp && t.isMemberExpression(pp.node) && pp.node.object === path.node &&
        t.isIdentifier(pp.node.property) && !pp.node.computed) {
        const gp = pp.parentPath
        if (!(gp && t.isCallExpression(gp.node) && gp.node.callee === pp.node)) return
      }
      if (ref.kind === 'local-destructured' && ref.propName) { record([ref.propName]); return }
      if (ref.kind === 'imported-destructured' && ref.propName && ref.storeVar) {
        const sr = stateRefs.get(ref.storeVar)
        record(sr?.getterDeps?.has(ref.propName) || sr?.reactiveFields?.has(ref.propName!) ? [ref.propName] : [], ref.storeVar)
      }
    },
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (!t.isIdentifier(path.node.property) || isInsideRefAttribute(path)) return
      const parent = path.parentPath
      if (parent && t.isCallExpression(parent.node) && parent.node.callee === path.node) return
      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved || resolved.parts === null) return

      if (resolved.parts.length === 0) {
        if (resolved.storeVar && t.isVariableDeclarator(parent?.node) && t.isObjectPattern(parent.node.id)) {
          for (const prop of parent.node.id.properties) {
            if (!t.isObjectProperty(prop)) continue
            const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
            if (key) record([key], resolved.storeVar)
          }
        }
        return
      }
      record(stripLength(resolved.parts), resolved.isImportedState ? resolved.storeVar : undefined)
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
    const branches = t.isConditionalExpression(slot.originalExpr)
      ? [slot.originalExpr.consequent, slot.originalExpr.alternate]
      : t.isLogicalExpression(slot.originalExpr) ? [slot.originalExpr.right] : []
    for (const branch of branches) {
      for (const dep of collectExpressionDependencies(branch, stateRefs, collectTemplateSetupStatements(branch, templateSetupContext)))
        branchKeys.add(dep.observeKey)
    }
  }
  return new Set([...branchKeys].filter((k) => !conditionKeys.has(k) && stateProps.has(k)))
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
      const parts = stripLength(resolved.parts)
      const storeVar = resolved.isImportedState ? resolved.storeVar : undefined
      const observeKey = buildObserveKey(parts, storeVar)
      if (!dependencies.some((d) => d.observeKey === observeKey))
        dependencies.push({ observeKey, pathParts: parts, storeVar })
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
  const candidates = t.isTemplateLiteral(expr) ? expr.expressions : [expr]
  const conditionals = candidates.filter((e): e is t.ConditionalExpression => t.isConditionalExpression(e))

  const results: UnresolvedRelationalClassBinding[] = []
  for (const cond of conditionals) {
    if (!t.isBinaryExpression(cond.test)) continue
    if (!['===', '==', '!==', '!='].includes(cond.test.operator)) continue
    const matchWhenEqual = cond.test.operator === '===' || cond.test.operator === '=='

    let storeObserveKey: string | undefined
    let itemSideFound = false
    let itemProperty: string | undefined

    for (const side of [cond.test.left, cond.test.right]) {
      if (t.isIdentifier(side) && side.name === itemVar) { itemSideFound = true; continue }
      if (t.isMemberExpression(side) && t.isIdentifier(side.object) && side.object.name === itemVar && t.isIdentifier(side.property)) {
        itemSideFound = true; itemProperty = side.property.name; continue
      }
      if (t.isMemberExpression(side) || t.isIdentifier(side)) {
        const r = resolvePath(side as t.MemberExpression, stateRefs)
        if (r?.parts?.length && r.isImportedState) storeObserveKey = buildObserveKey(r.parts, r.storeVar)
      }
    }

    if (!storeObserveKey || !itemSideFound) continue
    if (!dependencies.some((d) => d.observeKey === storeObserveKey)) continue

    const strVal = (n: t.Expression): string | null => (t.isStringLiteral(n) ? n.value.trim() || null : null)
    const className = strVal(cond.consequent as t.Expression) || strVal(cond.alternate as t.Expression)
    if (!className) continue

    const consequentIsClass = !!strVal(cond.consequent as t.Expression)
    results.push({
      observeKey: storeObserveKey,
      classToggleName: className,
      matchWhenEqual: consequentIsClass ? matchWhenEqual : !matchWhenEqual,
      ...(itemProperty ? { itemProperty } : {}),
    })
  }

  return results
}
