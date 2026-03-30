import * as t from '@babel/types'
import type { ClassMethod } from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type {
  ConditionalMapBinding,
  DerivedUnresolvedMapDescriptor,
  ObserveDependency,
  PathParts,
  PropBinding,
  ReactiveBinding,
  ArrayMapBinding,
  RelationalMapBinding,
  TextExpression,
  UnresolvedMapInfo,
  UnresolvedRelationalClassBinding,
} from './ir.ts'
import {
  buildObserveKey,
  pathPartsToString,
  resolvePath,
  generateSelector,
  getDirectChildElements,
  getJSXTagName,
} from './utils.ts'
import { getTemplateParamBinding } from './template-param-utils.ts'
import { analyzeJSXInMap } from './analyze-map.ts'
import {
  resolveExpr,
  resolvePropRef,
  applyImportedState,
  isComputedArrayProp,
  addArrayTextBindings,
  extractItemTemplate,
  extractCallbackBodyStatements,
  normalizeDestructuredMapCallback,
  detectItemIdProperty,
  hasRootUserIdAttribute,
  detectContainerSelector,
  hasExplicitItemKey,
} from './analyze-helpers.ts'
import { collectExpressionDependencies, collectTemplateSetupStatements } from './transform-attributes.ts'
import type { StateRefMeta } from './parse.ts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

export interface AnalysisResult {
  bindings: ReactiveBinding[]
  propBindings: PropBinding[]
  arrayMaps: ArrayMapBinding[]
  stateProps: Map<string, PathParts>
  unresolvedMaps: UnresolvedMapInfo[]
  rerenderPropNames: string[]
  /** Condition expressions (with setup statements) that control conditional JSX rendering */
  rerenderConditions: Array<{ expression: t.Expression; setupStatements: t.Statement[] }>
  conditionalSlots: import('./ir').ConditionalSlot[]
  stateChildSlots: import('./transform-jsx').StateChildSlot[]
  /** elementPath.join(' > ') -> bindingId for template transform to inject id attributes */
  elementPathToBindingId: Map<string, string>
  /** elementPath.join(' > ') -> user-provided id expression (static string or dynamic expr) */
  elementPathToUserIdExpr: Map<string, t.Expression>
  /** Store observe keys that appear exclusively inside conditional slot branch content */
  conditionalSlotScopedStoreKeys: Set<string>
  /** Original AST expression node → slotId, used by transform-jsx for direct lookup instead of cursor */
  conditionalSlotNodeMap: Map<t.Node, string>
  /** Guard condition from early return pattern (if (guard) return A; return B;) that requires full re-render */
  earlyReturnGuard?: t.Expression
  /**
   * Index into templateSetupContext.statements (statements before the final return) of the
   * early-return if. Setup after this index must not run unless that if has been evaluated first.
   */
  earlyReturnBarrierIndex?: number
}

function buildTextTemplateExpressionFromParts(
  textTemplate: string,
  textExpressions: TextExpression[],
): t.TemplateLiteral {
  const templateParts = textTemplate.split(/\$\{(\d+)\}/g)
  const quasis: t.TemplateElement[] = []
  const expressions: t.Expression[] = []

  for (let i = 0; i < templateParts.length; i++) {
    if (i % 2 === 0) {
      const raw = templateParts[i] || ''
      quasis.push(t.templateElement({ raw, cooked: raw }, i === templateParts.length - 1))
      continue
    }

    const idx = Number.parseInt(templateParts[i] || '-1', 10)
    const textExpr = textExpressions[idx]
    if (textExpr?.expression) {
      expressions.push(t.cloneNode(textExpr.expression, true) as t.Expression)
    } else {
      expressions.push(t.identifier('undefined'))
    }
  }

  return t.templateLiteral(quasis, expressions)
}

/** Assign unique bindingId for getElementById. Root (empty path) gets ''. */
function assignBindingIds(
  bindings: ReactiveBinding[],
  propBindings: PropBinding[],
  unresolvedMaps: UnresolvedMapInfo[],
  arrayMaps: ArrayMapBinding[],
): void {
  const pathToId = new Map<string, string>()
  let counter = 0
  for (const b of bindings) {
    const pathKey = b.elementPath.join(' > ')
    if (!pathToId.has(pathKey)) {
      pathToId.set(pathKey, pathKey ? `b${++counter}` : '')
    }
    b.bindingId = pathToId.get(pathKey)!
  }
  for (const pb of propBindings) {
    if (!pb.elementPath?.length) continue
    const pathKey = pb.elementPath.join(' > ')
    if (!pathToId.has(pathKey)) {
      pathToId.set(pathKey, `b${++counter}`)
    }
    pb.bindingId = pathToId.get(pathKey)!
  }
  for (const um of unresolvedMaps) {
    if (!um.containerElementPath?.length) continue
    const pathKey = um.containerElementPath.join(' > ')
    if (!pathToId.has(pathKey)) {
      pathToId.set(pathKey, `b${++counter}`)
    }
    um.containerBindingId = pathToId.get(pathKey)!
  }
  for (const am of arrayMaps) {
    if (!am.containerElementPath?.length) continue
    const pathKey = am.containerElementPath.join(' > ')
    if (!pathToId.has(pathKey)) {
      pathToId.set(pathKey, `b${++counter}`)
    }
    am.containerBindingId = pathToId.get(pathKey)!
  }
}

export function analyzeTemplate(
  templateMethod: ClassMethod,
  stateRefs: Map<string, StateRefMeta>,
  classBody?: t.ClassBody,
): AnalysisResult {
  const bindings: ReactiveBinding[] = []
  const propBindings: PropBinding[] = []
  const arrayMaps: ArrayMapBinding[] = []
  const stateProps = new Map<string, PathParts>()
  const unresolvedMaps: UnresolvedMapInfo[] = []
  const rerenderPropNames = new Set<string>()
  const rerenderConditions: Array<{ expression: t.Expression; setupStatements: t.Statement[] }> = []
  const conditionalSlots: import('./ir').ConditionalSlot[] = []
  let propsParamName: string | undefined
  const destructuredPropNames = new Set<string>()
  const binding = getTemplateParamBinding(templateMethod.params[0])
  if (binding) {
    if (t.isIdentifier(binding)) propsParamName = binding.name
    else {
      propsParamName = 'props'
      for (const prop of binding.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && !prop.computed)
          destructuredPropNames.add(prop.key.name)
      }
    }
  }

  if (!templateMethod.body || !t.isBlockStatement(templateMethod.body))
    return {
      bindings,
      propBindings,
      arrayMaps,
      stateProps,
      unresolvedMaps,
      rerenderPropNames: [],
      rerenderConditions: [],
      conditionalSlots: [],
      stateChildSlots: [],
      elementPathToBindingId: new Map(),
      elementPathToUserIdExpr: new Map(),
      conditionalSlotScopedStoreKeys: new Set(),
      conditionalSlotNodeMap: new Map(),
    }

  const bodyStmts = templateMethod.body.body
  const returnStmt = bodyStmts.find((s) => t.isReturnStatement(s) && s.argument !== null) as
    | t.ReturnStatement
    | undefined
  if (!returnStmt?.argument)
    return {
      bindings,
      propBindings,
      arrayMaps,
      stateProps,
      unresolvedMaps,
      rerenderPropNames: [],
      rerenderConditions: [],
      conditionalSlots: [],
      stateChildSlots: [],
      elementPathToBindingId: new Map(),
      elementPathToUserIdExpr: new Map(),
      conditionalSlotScopedStoreKeys: new Set(),
      conditionalSlotNodeMap: new Map(),
    }

  const returnIndex = bodyStmts.indexOf(returnStmt)

  // if (guard) return A; …setup…; return B — guard must run before main-branch setup (e.g. const x = item.foo).
  let earlyReturnGuard: t.Expression | undefined
  let earlyReturnBarrierIndex: number | undefined
  const earlyReturnFromIf = (s: t.IfStatement): t.ReturnStatement | null => {
    if (t.isReturnStatement(s.consequent) && s.consequent.argument) return s.consequent
    if (
      t.isBlockStatement(s.consequent) &&
      s.consequent.body.length === 1 &&
      t.isReturnStatement(s.consequent.body[0]) &&
      s.consequent.body[0].argument
    ) {
      return s.consequent.body[0]
    }
    return null
  }
  for (let i = 0; i < returnIndex; i++) {
    const s = bodyStmts[i]
    if (!t.isIfStatement(s) || s.alternate) continue
    const earlyRet = earlyReturnFromIf(s)
    if (!earlyRet?.argument) continue
    earlyReturnGuard = t.cloneNode(s.test, true) as t.Expression
    earlyReturnBarrierIndex = i
    break
  }

  const templateSetupContext = {
    params: templateMethod.params.filter(
      (param): param is t.Identifier | t.Pattern | t.RestElement => !t.isTSParameterProperty(param),
    ),
    statements: returnIndex >= 0 ? templateMethod.body.body.slice(0, returnIndex) : [],
  }

  const templateRoot = t.isJSXElement(returnStmt.argument) ? returnStmt.argument : null
  const conditionalSlotNodeMap = new Map<t.Node, string>()
  const elementPathToUserIdExpr = new Map<string, t.Expression>()

  const walk = (node: t.JSXElement | t.JSXFragment, elementPath: string[] = []): void => {
    if (t.isJSXFragment(node)) {
      getDirectChildElements(node.children).forEach((child) => {
        walk(child.node, [...elementPath, child.selectorSegment])
      })
      return
    }

    const tagName = t.isJSXIdentifier(node.openingElement.name) ? node.openingElement.name.name : 'div'
    const isComponentTag = /^[A-Z]/.test(tagName)
    if (!isComponentTag) {
      const idAttr = node.openingElement.attributes.find(
        (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === 'id',
      ) as t.JSXAttribute | undefined
      if (idAttr) {
        const pathKey = elementPath.join(' > ')
        if (t.isStringLiteral(idAttr.value)) {
          elementPathToUserIdExpr.set(pathKey, t.stringLiteral(idAttr.value.value))
        } else if (
          t.isJSXExpressionContainer(idAttr.value) &&
          idAttr.value.expression &&
          !t.isJSXEmptyExpression(idAttr.value.expression)
        ) {
          elementPathToUserIdExpr.set(pathKey, t.cloneNode(idAttr.value.expression, true) as t.Expression)
        }
      }
      analyzeAttributes(
        node,
        tagName,
        elementPath,
        bindings,
        propBindings,
        stateProps,
        stateRefs,
        propsParamName,
        destructuredPropNames,
        templateSetupContext,
        classBody,
      )
    }
    const { textTemplate, textExpressions, shouldBuildTextTemplate } = collectTextChildren(node, stateRefs, stateProps)
    analyzeChildren(
      node,
      tagName,
      elementPath,
      bindings,
      propBindings,
      arrayMaps,
      stateProps,
      stateRefs,
      textTemplate,
      textExpressions,
      shouldBuildTextTemplate,
      walk,
      (info: UnresolvedMapInfo) => unresolvedMaps.push(info),
      classBody,
      propsParamName,
      destructuredPropNames,
      templateSetupContext,
      rerenderPropNames,
      rerenderConditions,
      conditionalSlots,
      templateRoot,
      conditionalSlotNodeMap,
    )
  }

  if (t.isJSXElement(returnStmt.argument)) walk(returnStmt.argument)
  else if (t.isJSXFragment(returnStmt.argument)) walk(returnStmt.argument)

  collectAllStateAccesses(templateMethod, stateRefs, stateProps, templateSetupContext, returnStmt.argument)

  assignBindingIds(bindings, propBindings, unresolvedMaps, arrayMaps)

  const elementPathToBindingId = new Map<string, string>()
  for (const b of bindings) {
    if (b.bindingId !== undefined) {
      const pathKey = b.elementPath.join(' > ')
      elementPathToBindingId.set(pathKey, b.bindingId)
    }
  }
  for (const pb of propBindings) {
    if (pb.bindingId !== undefined && pb.elementPath?.length) {
      const pathKey = pb.elementPath.join(' > ')
      elementPathToBindingId.set(pathKey, pb.bindingId)
    }
  }
  for (const um of unresolvedMaps) {
    if (um.containerBindingId !== undefined && um.containerElementPath?.length) {
      const pathKey = um.containerElementPath.join(' > ')
      elementPathToBindingId.set(pathKey, um.containerBindingId)
    }
  }
  for (const am of arrayMaps) {
    if (am.containerBindingId !== undefined && am.containerElementPath?.length) {
      const pathKey = am.containerElementPath.join(' > ')
      elementPathToBindingId.set(pathKey, am.containerBindingId)
    }
  }

  for (const b of bindings) {
    const pathKey = b.elementPath.join(' > ')
    const userExpr = elementPathToUserIdExpr.get(pathKey)
    if (userExpr) b.userIdExpr = t.cloneNode(userExpr, true) as t.Expression
  }
  for (const pb of propBindings) {
    if (!pb.elementPath?.length) continue
    const pathKey = pb.elementPath.join(' > ')
    const userExpr = elementPathToUserIdExpr.get(pathKey)
    if (userExpr) pb.userIdExpr = t.cloneNode(userExpr, true) as t.Expression
  }

  for (const um of unresolvedMaps) {
    if (um.containerElementPath?.length) {
      const pathKey = um.containerElementPath.join(' > ')
      const userExpr = elementPathToUserIdExpr.get(pathKey)
      if (userExpr) um.containerUserIdExpr = t.cloneNode(userExpr, true) as t.Expression
    }
  }
  for (const am of arrayMaps) {
    if (am.containerElementPath?.length) {
      const pathKey = am.containerElementPath.join(' > ')
      const userExpr = elementPathToUserIdExpr.get(pathKey)
      if (userExpr) am.containerUserIdExpr = t.cloneNode(userExpr, true) as t.Expression
    }
  }

  for (const um of unresolvedMaps) {
    if (!um.computationExpr) continue
    if (t.isIdentifier(um.computationExpr)) {
      const varName = um.computationExpr.name
      um.mapObjectExpr = t.identifier(varName)
      for (const stmt of templateMethod.body.body) {
        if (!t.isVariableDeclaration(stmt)) continue
        for (const decl of stmt.declarations) {
          if (t.isIdentifier(decl.id) && decl.id.name === varName && decl.init) {
            um.computationExpr = t.cloneNode(decl.init, true)
            break
          }
        }
      }
    } else {
      um.mapObjectExpr = t.cloneNode(um.computationExpr, true)
    }

    const derived = buildDerivedUnresolvedMapDescriptor(um.computationExpr, stateRefs, classBody)
    if (derived) {
      um.derived = derived
    }

    const recomputed = collectUnresolvedComputationDependencies(
      um.computationExpr,
      stateRefs,
      um.computationSetupStatements || [],
      classBody,
    )
    if (derived) {
      const sourceObserveKey = buildObserveKey(derived.sourcePathParts, derived.sourceStoreVar)
      if (!recomputed.some((dep) => dep.observeKey === sourceObserveKey)) {
        recomputed.push({
          observeKey: sourceObserveKey,
          pathParts: derived.sourcePathParts,
          storeVar: derived.sourceStoreVar,
        })
      }
    }
    if (recomputed.length > 0) {
      const merged = new Map<string, ObserveDependency>()
      const helperMethodObserveKey = getHelperMethodObserveKey(um.computationExpr)
      for (const dep of um.dependencies || []) {
        if (helperMethodObserveKey && dep.observeKey === helperMethodObserveKey) continue
        merged.set(dep.observeKey, dep)
      }
      for (const dep of recomputed) merged.set(dep.observeKey, dep)
      um.dependencies = Array.from(merged.values())
    }
  }

  const conditionalSlotScopedStoreKeys = computeConditionalSlotScopedStoreKeys(
    conditionalSlots,
    stateProps,
    stateRefs,
    templateSetupContext,
  )

  return {
    bindings,
    propBindings,
    arrayMaps,
    stateProps,
    unresolvedMaps,
    rerenderPropNames: Array.from(rerenderPropNames),
    rerenderConditions,
    conditionalSlots,
    stateChildSlots: [],
    elementPathToBindingId,
    elementPathToUserIdExpr,
    conditionalSlotScopedStoreKeys,
    conditionalSlotNodeMap,
    earlyReturnGuard,
    earlyReturnBarrierIndex,
  }
}

/** Identify store observe keys that appear exclusively inside conditional slot branch content
 *  (not in the condition itself). These don't need rerender observers because the slot rebuild
 *  handles them when the slot is swapped. */
function computeConditionalSlotScopedStoreKeys(
  conditionalSlots: import('./ir').ConditionalSlot[],
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

function resolveHelperCallExpression(
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

function collectHelperMethodDependencies(
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

function collectUnresolvedComputationDependencies(
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

function buildDerivedUnresolvedMapDescriptor(
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

function getHelperMethodObserveKey(expr: t.Expression | undefined): string | undefined {
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

function analyzeAttributes(
  node: t.JSXElement,
  tagName: string,
  elementPath: string[],
  bindings: ReactiveBinding[],
  propBindings: PropBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  classBody?: t.ClassBody,
) {
  node.openingElement.attributes.forEach((attr) => {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return
    if (!attr.value || !t.isJSXExpressionContainer(attr.value)) return
    const name = attr.name.name
    if (name === 'ref') return
    const eventNames = [
      'click',
      'dblclick',
      'change',
      'input',
      'keydown',
      'keyup',
      'blur',
      'focus',
      'mousedown',
      'mouseup',
      'submit',
      'tap',
      'longTap',
      'swipeRight',
      'swipeUp',
      'swipeLeft',
      'swipeDown',
      'dragstart',
      'dragend',
      'dragover',
      'dragleave',
      'drop',
    ]
    if (eventNames.includes(name)) return
    // Handle on* prefixed event names (e.g. onclick, oninput)
    if (name.startsWith('on') && name.length > 2) {
      const normalized = name.charAt(2).toLowerCase() + name.slice(3)
      if (eventNames.includes(normalized)) return
    }
    if (name === 'dangerouslySetInnerHTML') {
      // Track as a state-dependent binding for reactive innerHTML updates
      const expr = attr.value.expression
      if (templateSetupContext && !t.isJSXEmptyExpression(expr)) {
        const setupStatements = collectTemplateSetupStatements(expr, templateSetupContext)
        const dependencies = collectExpressionDependencies(expr, stateRefs, setupStatements)
        const stateDeps = dependencies.filter((d) => d.storeVar || (d.pathParts.length > 0 && d.pathParts[0] !== 'props'))
        if (stateDeps.length > 0) {
          const selector = generateSelector(elementPath)
          propBindings.push({
            propName: '__state__',
            selector,
            type: 'attribute',
            attributeName: 'dangerouslySetInnerHTML',
            elementPath: [...elementPath],
            expression: t.cloneNode(expr, true) as t.Expression,
            setupStatements: setupStatements.length > 0 ? setupStatements : undefined,
          })
        }
      }
      return
    }
    const expr = attr.value.expression

    const propName = resolvePropRef(expr, propsParamName, destructuredPropNames)
    if (propName) {
      const selector = generateSelector(elementPath)
      if (name === 'class' || name === 'className') {
        propBindings.push({ propName, selector, type: 'class', elementPath: [...elementPath] })
      } else if (name === 'value' || name === 'checked') {
        propBindings.push({
          propName,
          selector,
          type: name as 'value' | 'checked',
          attributeName: name,
          elementPath: [...elementPath],
        })
      } else {
        propBindings.push({ propName, selector, type: 'attribute', attributeName: name, elementPath: [...elementPath] })
      }
      return
    }

    const attrType =
      name === 'class' || name === 'className'
        ? 'class'
        : name === 'value' || name === 'checked'
          ? (name as 'value' | 'checked')
          : 'attribute'
    const derived = buildDerivedPropBindings(
      expr,
      attrType,
      attrType === 'class' ? undefined : name,
      elementPath,
      propsParamName,
      destructuredPropNames,
      templateSetupContext,
      classBody,
    )
    if (derived.length > 0) {
      propBindings.push(...derived)
    }

    const tagNameNode = node.openingElement.name
    const isNativeElement = t.isJSXIdentifier(tagNameNode) && /^[a-z]/.test(tagNameNode.name)
    if (isNativeElement && templateSetupContext && !t.isJSXEmptyExpression(expr)) {
      const setupStatements = collectTemplateSetupStatements(expr, templateSetupContext)
      const dependencies = collectExpressionDependencies(expr, stateRefs, setupStatements)
      const stateDeps = dependencies.filter((d) => d.storeVar || (d.pathParts.length > 0 && d.pathParts[0] !== 'props'))
      if (stateDeps.length > 0) {
        const selector = generateSelector(elementPath)
        propBindings.push({
          propName: '__state__',
          selector,
          type: attrType,
          attributeName: attrType === 'class' ? undefined : name,
          elementPath: [...elementPath],
          expression: t.cloneNode(expr, true) as t.Expression,
          setupStatements: setupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
          stateOnly: true,
        })
        return
      }
    }

    if (derived.length > 0) return

    if (name === 'value' || name === 'checked') {
      const result = resolveExpr(expr, stateRefs)
      if (!result?.parts?.length) return
      const binding: ReactiveBinding = {
        pathParts: result.parts,
        type: name as 'value' | 'checked',
        selector: generateSelector(elementPath),
        attributeName: name,
        elementPath: [...elementPath],
      }
      applyImportedState(binding, result, stateProps)
      bindings.push(binding)
    }
  })
}

function collectTextChildren(
  node: t.JSXElement,
  stateRefs: Map<string, StateRefMeta>,
  stateProps: Map<string, PathParts>,
) {
  const textChildren: Array<{ type: 'text' | 'expression'; value?: string; expression?: t.Expression }> = []
  let hasExpr = false

  node.children.forEach((child) => {
    if (t.isJSXText(child)) {
      textChildren.push({ type: 'text', value: child.value })
    } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      const expr = child.expression
      const isMap =
        t.isCallExpression(expr) &&
        t.isMemberExpression(expr.callee) &&
        t.isIdentifier(expr.callee.property) &&
        expr.callee.property.name === 'map'
      if (!isMap) {
        // Expand TemplateLiterals into separate text + expression entries
        // so that shouldBuildTextTemplate becomes true and the observer
        // generates the full formatted template expression instead of
        // using just the raw value parameter.
        if (t.isTemplateLiteral(expr)) {
          for (let i = 0; i < expr.quasis.length; i++) {
            const quasi = expr.quasis[i]
            if (quasi.value.raw) {
              textChildren.push({ type: 'text', value: quasi.value.raw })
            }
            if (i < expr.expressions.length) {
              const innerExpr = expr.expressions[i]
              if (t.isExpression(innerExpr)) {
                textChildren.push({ type: 'expression', expression: innerExpr })
                hasExpr = true
              }
            }
          }
        } else {
          textChildren.push({ type: 'expression', expression: expr })
          hasExpr = true
        }
      }
    }
  })

  const exprCount = textChildren.filter((c) => c.type === 'expression').length
  const allTextIsWhitespace = textChildren
    .filter((c) => c.type === 'text')
    .every((c) => !c.value || c.value.trim() === '')
  const shouldBuildTextTemplate =
    hasExpr && (exprCount > 1 || (textChildren.some((c) => c.type === 'text') && !allTextIsWhitespace))

  let textTemplate: string | undefined
  const textExpressions: TextExpression[] = []

  if (shouldBuildTextTemplate) {
    const parts: string[] = []
    let idx = 0
    textChildren.forEach((c) => {
      if (c.type === 'text' && c.value) {
        parts.push(c.value)
        return
      }
      if (c.type !== 'expression' || !c.expression) return
      parts.push(`\${${idx}}`)
      const result = resolveExpr(c.expression, stateRefs)
      textExpressions.push({
        pathParts: result?.parts || [],
        isImportedState: result?.isImportedState || false,
        storeVar: result?.storeVar,
        expression: c.expression,
      })
      if (result?.isImportedState && result.parts) {
        stateProps.set(buildObserveKey(result.parts, result.storeVar), [...result.parts])
      }
      idx++
    })
    textTemplate = parts.join('')
  }

  return { textTemplate, textExpressions, shouldBuildTextTemplate }
}

function parentHasElementChildren(node: t.JSXElement): boolean {
  return node.children.some((c) => t.isJSXElement(c))
}

function getDOMTextNodeIndex(children: t.JSXElement['children'], childIndex: number): number {
  let domIndex = 0
  let inTextRun = false

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    if (t.isJSXText(child)) {
      if (child.value.trim() === '') continue
      if (!inTextRun) {
        inTextRun = true
        domIndex++
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (!inTextRun) {
        inTextRun = true
        domIndex++
      }
      if (i === childIndex) return domIndex - 1
    } else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      inTextRun = false
      domIndex++
    }
  }

  return 0
}

function analyzeChildren(
  node: t.JSXElement,
  tagName: string,
  elementPath: string[],
  bindings: ReactiveBinding[],
  propBindings: PropBinding[],
  arrayMaps: ArrayMapBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  textTemplate: string | undefined,
  textExpressions: TextExpression[],
  shouldBuildTextTemplate: boolean,
  walk: (n: t.JSXElement | t.JSXFragment, ep: string[]) => void,
  onUnresolvedMap: (info: UnresolvedMapInfo) => void,
  classBody?: t.ClassBody,
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  rerenderPropNames?: Set<string>,
  rerenderConditions?: Array<{ expression: t.Expression; setupStatements: t.Statement[] }>,
  conditionalSlots?: import('./ir').ConditionalSlot[],
  templateRoot?: t.JSXElement | null,
  conditionalSlotNodeMap?: Map<t.Node, string>,
) {
  getDirectChildElements(node.children).forEach((child) => {
    walk(child.node, [...elementPath, child.selectorSegment])
  })

  node.children.forEach((child, index) => {
    if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      const expr = child.expression
      if (isMapCall(expr)) {
        handleArrayMap(
          expr as t.CallExpression,
          tagName,
          node,
          elementPath,
          index,
          arrayMaps,
          stateProps,
          stateRefs,
          onUnresolvedMap,
          classBody,
          templateSetupContext,
        )
      } else {
        // Collect nested maps first, then handle text binding (which may create a
        // conditional slot), then process the maps with the slot ID prefix so
        // their container element paths don't collide with main-template paths.
        const nestedMapCalls = collectNestedMapCalls(expr)
        const hasNestedMapCall = nestedMapCalls.length > 0
        const jsxInTextSiblingGroup = shouldBuildTextTemplate && textSiblingGroupContainsJSX(textExpressions)
        const mixedTextNodeIndex =
          parentHasElementChildren(node) || jsxInTextSiblingGroup
            ? getDOMTextNodeIndex(node.children, index)
            : undefined
        // Call handleTextBinding first — it may push a conditional slot
        const slotCountBefore = conditionalSlots?.length ?? 0
        handleTextBinding(
          expr,
          node,
          tagName,
          elementPath,
          bindings,
          propBindings,
          stateProps,
          stateRefs,
          textTemplate,
          textExpressions,
          shouldBuildTextTemplate,
          propsParamName,
          destructuredPropNames,
          templateSetupContext,
          rerenderPropNames,
          rerenderConditions,
          conditionalSlots,
          hasNestedMapCall,
          classBody,
          conditionalSlotNodeMap,
          mixedTextNodeIndex,
          jsxInTextSiblingGroup,
        )
        // Determine if a conditional slot was created for this expression
        const slotCountAfter = conditionalSlots?.length ?? 0
        const slotId = slotCountAfter > slotCountBefore ? conditionalSlots![slotCountAfter - 1].slotId : undefined
        nestedMapCalls.forEach(({ mapExpr, parentElement, containerPath }) => {
          let mapNode = node
          let mapElementPath = elementPath
          let mapTagName = tagName
          if (parentElement) {
            mapNode = parentElement
            mapTagName = getJSXTagName(parentElement.openingElement.name) || tagName
          }
          if (containerPath) {
            // Prefix with the conditional slot ID to avoid path collisions
            // with elements in the main template
            const prefix = slotId ? `__cs_${slotId}` : undefined
            mapElementPath = prefix ? [prefix, ...containerPath] : containerPath
          }
          handleArrayMap(
            mapExpr,
            mapTagName,
            mapNode,
            mapElementPath,
            index,
            arrayMaps,
            stateProps,
            stateRefs,
            onUnresolvedMap,
            classBody,
            templateSetupContext,
          )
        })
      }
    }
  })
}

function isMapCall(expr: t.Expression | t.JSXEmptyExpression): boolean {
  return (
    t.isCallExpression(expr) &&
    t.isMemberExpression(expr.callee) &&
    t.isIdentifier(expr.callee.property) &&
    expr.callee.property.name === 'map'
  )
}

interface NestedMapInfo {
  mapExpr: t.CallExpression
  parentElement?: t.JSXElement
  /** Element path from the conditional branch root to the map's container element */
  containerPath?: string[]
}

function collectNestedMapCalls(expr: t.Expression | t.JSXEmptyExpression): NestedMapInfo[] {
  if (t.isJSXEmptyExpression(expr)) return []
  const maps: NestedMapInfo[] = []
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true) as t.Expression)])
  traverse(program, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (isMapCall(path.node)) {
        let parentElement: t.JSXElement | undefined
        let parentPath: NodePath | undefined
        let current = path.parentPath
        while (current) {
          if (current.isJSXElement()) {
            parentElement = current.node
            parentPath = current
            break
          }
          current = current.parentPath
        }

        // Compute element path from the conditional branch root to the parent JSX element
        let containerPath: string[] | undefined
        if (parentPath) {
          const segments: string[] = []
          let cur: NodePath = parentPath
          while (cur.parentPath) {
            const par = cur.parentPath
            if (par.isJSXElement() || par.isJSXFragment()) {
              const children = getDirectChildElements(par.node.children)
              const match = children.find((dc) => dc.node === cur.node)
              if (match) segments.unshift(match.selectorSegment)
              if (par.isJSXElement()) {
                cur = par
                continue
              }
            }
            // Reached a non-JSX parent (expression, conditional, etc.) — stop
            break
          }
          if (segments.length > 0) containerPath = segments
        }

        maps.push({ mapExpr: path.node, parentElement, containerPath })
      }
    },
  })
  return maps
}

function collectImportedStoreGetterDependencies(
  expr: t.Expression,
  setupStatements: t.Statement[],
  stateRefs: Map<string, StateRefMeta>,
): import('./ir').ObserveDependency[] {
  if (!t.isIdentifier(expr)) return []
  const deps = new Map<string, import('./ir').ObserveDependency>()
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

function handleArrayMap(
  expr: t.CallExpression,
  tagName: string,
  node: t.JSXElement,
  elementPath: string[],
  index: number,
  arrayMaps: ArrayMapBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  onUnresolvedMap: (info: UnresolvedMapInfo) => void,
  classBody?: t.ClassBody,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
) {
  const arrayExpr = (expr.callee as t.MemberExpression).object
  const normalizedArrayExpr = resolveHelperCallExpression(arrayExpr as t.Expression, classBody) || arrayExpr

  if (t.isArrowFunctionExpression(expr.arguments?.[0])) {
    const tpl = extractItemTemplate(expr.arguments[0] as t.ArrowFunctionExpression)
    if (tpl && !hasExplicitItemKey(tpl)) {
      const loc = tpl.loc?.start
      const locStr = loc ? ` (line ${loc.line}, col ${loc.column})` : ''
      const err = new Error(
        `[gea] Array .map() items must have a \`key\` prop on the root element${locStr}. ` +
          `Add key={item.id} (or another unique identifier) to the outermost JSX element returned by the .map() callback.`,
      )
      ;(err as any).__geaCompileError = true
      throw err
    }
  }

  const result = resolvePath(normalizedArrayExpr as t.MemberExpression | t.Identifier, stateRefs)
  const isDestructuredNonReactive =
    result?.parts?.length === 1 &&
    result.isImportedState &&
    t.isIdentifier(normalizedArrayExpr) &&
    (() => {
      const ref = stateRefs.get(normalizedArrayExpr.name)
      if (!ref || ref.kind !== 'imported-destructured' || !ref.storeVar || !ref.propName) return false
      const storeRef = stateRefs.get(ref.storeVar)
      return !storeRef?.reactiveFields?.has(ref.propName)
    })()
  if (!result?.parts?.length || isDestructuredNonReactive || !t.isArrowFunctionExpression(expr.arguments[0])) {
    if (t.isArrowFunctionExpression(expr.arguments?.[0])) {
      const arrowFn = expr.arguments[0] as t.ArrowFunctionExpression
      normalizeDestructuredMapCallback(arrowFn)
      const itemVar = t.isIdentifier(arrowFn.params[0]) ? arrowFn.params[0].name : 'item'
      const indexVar = t.isIdentifier(arrowFn.params[1]) ? arrowFn.params[1].name : undefined
      const itemTemplate = extractItemTemplate(arrowFn)
      const itemIdProp = detectItemIdProperty(itemTemplate, itemVar)
      const computationSetupStatements = templateSetupContext
        ? collectTemplateSetupStatements(normalizedArrayExpr as t.Expression, templateSetupContext)
        : []
      const dependencies = collectUnresolvedComputationDependencies(
        normalizedArrayExpr as t.Expression,
        stateRefs,
        computationSetupStatements,
        classBody,
      )
      collectItemTemplateStoreDependencies(itemTemplate, itemVar, stateRefs, dependencies)
      const relationalClassBindings = detectUnresolvedRelationalClassBindings(
        itemTemplate,
        itemVar,
        stateRefs,
        dependencies,
      )
      const cbBodyStmts = extractCallbackBodyStatements(arrowFn)
      onUnresolvedMap({
        containerSelector: detectContainerSelector(node, tagName),
        itemTemplate,
        itemVariable: itemVar,
        ...(indexVar ? { indexVariable: indexVar } : {}),
        itemIdProperty: itemIdProp,
        rootHasUserId: hasRootUserIdAttribute(itemTemplate),
        computationExpr: t.cloneNode(normalizedArrayExpr, true),
        computationSetupStatements: computationSetupStatements.map((stmt) => t.cloneNode(stmt, true) as t.Statement),
        dependencies,
        containerElementPath: [...elementPath],
        ...(cbBodyStmts.length > 0 ? { callbackBodyStatements: cbBodyStmts } : {}),
        ...(relationalClassBindings.length > 0 ? { relationalClassBindings } : {}),
      })
    }
    return
  }

  if (result.isImportedState) {
    stateProps.set(buildObserveKey(result.parts, result.storeVar), [...result.parts])
  }

  const finalPath = result.parts
  const arrowFn = expr.arguments[0] as t.ArrowFunctionExpression
  normalizeDestructuredMapCallback(arrowFn)
  const itemVar = t.isIdentifier(arrowFn.params[0]) ? arrowFn.params[0].name : 'item'
  const indexVar = t.isIdentifier(arrowFn.params[1]) ? arrowFn.params[1].name : undefined
  const itemTemplate = extractItemTemplate(arrowFn)
  const cbBodyStmts = extractCallbackBodyStatements(arrowFn)
  const itemIdProperty = detectItemIdProperty(itemTemplate, itemVar)
  const relationalIdProperty = itemIdProperty || 'id'
  const isKeyed = hasExplicitItemKey(itemTemplate)
  const containerSelector = detectContainerSelector(node, tagName)
  const itemBindings: ReactiveBinding[] = []
  const relationalBindings: RelationalMapBinding[] = []
  const conditionalBindings: ConditionalMapBinding[] = []

  const storeVar = result.isImportedState ? result.storeVar : undefined
  const walkBody = (body: t.Expression | t.Statement) => {
    let target: t.JSXElement | t.JSXFragment | t.Expression | undefined = body as t.Expression
    if (t.isBlockStatement(body)) {
      const returnStmt = body.body.find((s) => t.isReturnStatement(s)) as t.ReturnStatement | undefined
      target = returnStmt?.argument as t.Expression | undefined
    }
    if (!target) return
    if (t.isConditionalExpression(target))
      target = t.isJSXElement(target.consequent) ? target.consequent : target.alternate
    if (t.isParenthesizedExpression(target)) target = target.expression
    if (t.isJSXElement(target))
      analyzeJSXInMap(
        target,
        finalPath,
        itemVar,
        itemBindings,
        relationalBindings,
        conditionalBindings,
        [],
        result.isImportedState || false,
        relationalIdProperty,
        stateRefs,
        [],
        storeVar,
      )
    else if (t.isJSXFragment(target))
      target.children.forEach((fc) => {
        if (t.isJSXElement(fc))
          analyzeJSXInMap(
            fc,
            finalPath,
            itemVar,
            itemBindings,
            relationalBindings,
            conditionalBindings,
            [],
            result.isImportedState || false,
            relationalIdProperty,
            stateRefs,
            [],
            storeVar,
          )
      })
    else if (t.isParenthesizedExpression(target) && t.isJSXElement(target.expression))
      analyzeJSXInMap(
        target.expression,
        finalPath,
        itemVar,
        itemBindings,
        relationalBindings,
        conditionalBindings,
        [],
        result.isImportedState || false,
        relationalIdProperty,
        stateRefs,
        [],
        storeVar,
      )
  }
  walkBody(arrowFn.body as t.Expression)

  let classToggleName: string | undefined
  itemBindings.forEach((b) => {
    if (b.type === 'class' && b.classToggleName && !classToggleName) classToggleName = b.classToggleName
  })
  relationalBindings.forEach((binding) => {
    stateProps.set(buildObserveKey(binding.observePathParts, binding.storeVar), [...binding.observePathParts])
    if (binding.classToggleName && !classToggleName) classToggleName = binding.classToggleName
  })
  conditionalBindings.forEach((binding) => {
    stateProps.set(binding.observe.observeKey, [...binding.observe.pathParts])
  })

  arrayMaps.push({
    arrayPathParts: finalPath,
    storeVar: result.storeVar,
    itemVariable: itemVar,
    ...(indexVar ? { indexVariable: indexVar } : {}),
    itemBindings,
    relationalBindings,
    containerSelector,
    containerElementPath: [...elementPath],
    itemTemplate,
    isImportedState: result.isImportedState || false,
    isKeyed,
    itemIdProperty: itemIdProperty || (isKeyed ? undefined : 'id'),
    classToggleName,
    conditionalBindings,
    ...(cbBodyStmts.length > 0 ? { callbackBodyStatements: cbBodyStmts } : {}),
  })
}

function handleTextBinding(
  expr: t.Expression | t.JSXEmptyExpression,
  node: t.JSXElement,
  tagName: string,
  elementPath: string[],
  bindings: ReactiveBinding[],
  propBindings: PropBinding[],
  stateProps: Map<string, PathParts>,
  stateRefs: Map<string, StateRefMeta>,
  textTemplate: string | undefined,
  textExpressions: TextExpression[],
  shouldBuildTextTemplate: boolean,
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  rerenderPropNames?: Set<string>,
  rerenderConditions?: Array<{ expression: t.Expression; setupStatements: t.Statement[] }>,
  conditionalSlots?: import('./ir').ConditionalSlot[],
  _hasNestedMapCall: boolean = false,
  classBody?: t.ClassBody,
  conditionalSlotNodeMap?: Map<t.Node, string>,
  textNodeIndex?: number,
  jsxInTextSiblingGroup = false,
) {
  const propName = resolvePropRef(expr, propsParamName, destructuredPropNames)
  if (propName) {
    if (
      shouldBuildTextTemplate &&
      textTemplate &&
      textExpressions.length > 0 &&
      templateSetupContext &&
      !jsxInTextSiblingGroup
    ) {
      const derivedTemplateExpr = buildTextTemplateExpressionFromParts(textTemplate, textExpressions)
      const setupStatements = collectTemplateSetupStatements(derivedTemplateExpr, templateSetupContext)
      const dependentProps = collectDependentPropNames(
        derivedTemplateExpr,
        setupStatements,
        propsParamName,
        destructuredPropNames,
        classBody,
      )
      const selector = generateSelector(elementPath)

      if (dependentProps.length > 0) {
        propBindings.push(
          ...dependentProps.map((prop) => ({
            propName: prop,
            selector,
            type: 'text' as const,
            elementPath: [...elementPath],
            expression: t.cloneNode(derivedTemplateExpr, true) as t.Expression,
            setupStatements: setupStatements.map((statement) => t.cloneNode(statement, true) as t.Statement),
            ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
          })),
        )
        return
      }
    }

    const selector = generateSelector(elementPath)
    propBindings.push({
      propName,
      selector,
      type: 'text',
      elementPath: [...elementPath],
      ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
    })
    return
  }
  if (!expressionMayProduceJSX(expr)) {
    if (
      shouldBuildTextTemplate &&
      textTemplate &&
      textExpressions.length > 0 &&
      templateSetupContext &&
      !jsxInTextSiblingGroup
    ) {
      const derivedTemplateExpr = buildTextTemplateExpressionFromParts(textTemplate, textExpressions)
      const setupStatements = collectTemplateSetupStatements(derivedTemplateExpr, templateSetupContext)
      const dependentProps = collectDependentPropNames(
        derivedTemplateExpr,
        setupStatements,
        propsParamName,
        destructuredPropNames,
        classBody,
      )
      if (dependentProps.length > 0) {
        const selector = generateSelector(elementPath)
        propBindings.push(
          ...dependentProps.map((prop) => ({
            propName: prop,
            selector,
            type: 'text' as const,
            elementPath: [...elementPath],
            expression: t.cloneNode(derivedTemplateExpr, true) as t.Expression,
            setupStatements: setupStatements.map((statement) => t.cloneNode(statement, true) as t.Statement),
            ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
          })),
        )
        return
      }
    }
    const derived = buildDerivedPropBindings(
      expr,
      'text',
      undefined,
      elementPath,
      propsParamName,
      destructuredPropNames,
      templateSetupContext,
      classBody,
    )
    if (derived.length > 0) {
      if (textNodeIndex !== undefined) {
        for (const d of derived) d.textNodeIndex = textNodeIndex
      }
      propBindings.push(...derived)
      return
    }
  }
  if (templateSetupContext && expressionMayProduceJSX(expr) && rerenderPropNames) {
    if (t.isJSXEmptyExpression(expr)) return
    const conditionExpr = extractConditionalControlExpression(expr)
    if (conditionExpr) {
      const condSetupStatements = collectTemplateSetupStatements(conditionExpr, templateSetupContext)
      const fullSetupStatements = collectTemplateSetupStatements(expr, templateSetupContext)
      const allDeps = collectExpressionDependencies(conditionExpr, stateRefs, condSetupStatements)
      // Keep all dependencies (including store) for conditional slots.
      // Store-dependent conditionals like `store.open && <Modal/>` need reactive
      // tracking to insert/remove DOM sections when the condition changes.
      const dependencies = allDeps
      const conditionDependentProps = collectDependentPropNames(
        conditionExpr,
        condSetupStatements,
        propsParamName,
        destructuredPropNames,
        classBody,
      )
      const allDependentProps = collectDependentPropNames(
        expr,
        fullSetupStatements,
        propsParamName,
        destructuredPropNames,
        classBody,
      )
      const dependentProps = [...new Set([...conditionDependentProps, ...allDependentProps])]
      dependentProps.forEach((propName) => rerenderPropNames.add(propName))
      if (dependentProps.length > 0 || dependencies.length > 0) {
        rerenderConditions?.push({
          expression: t.cloneNode(conditionExpr, true),
          setupStatements: condSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
        })
        if (conditionalSlots) {
          const slotId = `c${conditionalSlots.length}`
          conditionalSlots.push({
            slotId,
            conditionExpr: t.cloneNode(conditionExpr, true),
            setupStatements: condSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
            htmlSetupStatements: fullSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
            dependentPropNames: [...dependentProps],
            dependencies: dependencies.map((dep) => ({
              observeKey: dep.observeKey,
              pathParts: [...dep.pathParts],
              ...(dep.storeVar ? { storeVar: dep.storeVar } : {}),
            })),
            originalExpr: t.cloneNode(expr, true) as t.Expression,
          })
          conditionalSlotNodeMap?.set(expr, slotId)
        }
      }
    }
  }
  const result = resolveExpr(expr, stateRefs)
  if (!result?.parts?.length) {
    if (templateSetupContext && !t.isJSXEmptyExpression(expr) && !expressionMayProduceJSX(expr)) {
      const exprToUse =
        shouldBuildTextTemplate && textTemplate && !jsxInTextSiblingGroup
          ? buildTextTemplateExpressionFromParts(textTemplate, textExpressions)
          : expr
      const setupStatements = collectTemplateSetupStatements(exprToUse, templateSetupContext)
      const dependencies = collectExpressionDependencies(exprToUse, stateRefs, setupStatements)
      const stateDeps = dependencies.filter((d) => d.storeVar || (d.pathParts.length > 0 && d.pathParts[0] !== 'props'))
      if (stateDeps.length > 0) {
        const selector = generateSelector(elementPath)
        propBindings.push({
          propName: '__state__',
          selector,
          type: 'text',
          elementPath: [...elementPath],
          expression: t.cloneNode(exprToUse, true) as t.Expression,
          setupStatements: setupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
          stateOnly: true,
          ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
        })
      }
    }
    return
  }
  const selector = generateSelector(elementPath)

  if (shouldBuildTextTemplate && textTemplate && textExpressions.length > 0 && !jsxInTextSiblingGroup) {
    if (isComputedArrayProp(result.parts, textExpressions, stateRefs)) {
      addArrayTextBindings(
        selector,
        tagName,
        elementPath,
        bindings,
        stateProps,
        stateRefs,
        textTemplate,
        textExpressions,
        result,
      )
      return
    }
  }

  const binding: ReactiveBinding = {
    pathParts: result.parts,
    type: 'text',
    selector: generateSelector(elementPath),
    elementPath: [...elementPath],
    ...(textNodeIndex !== undefined ? { textNodeIndex } : {}),
  }
  applyImportedState(binding, result, stateProps)
  if (shouldBuildTextTemplate && textTemplate && !jsxInTextSiblingGroup) {
    binding.textTemplate = textTemplate
    binding.textExpressionIndex = textExpressions.findIndex(
      (te) => pathPartsToString(te.pathParts) === pathPartsToString(result.parts),
    )
    binding.textExpressions = textExpressions
  }
  bindings.push(binding)
}

function textSiblingGroupContainsJSX(textExpressions: TextExpression[]): boolean {
  return textExpressions.some((te) => te.expression && expressionMayProduceJSX(te.expression))
}

function expressionMayProduceJSX(expr: t.Expression | t.JSXEmptyExpression): boolean {
  if (t.isJSXEmptyExpression(expr)) return false
  if (t.isJSXElement(expr) || t.isJSXFragment(expr)) return true
  if (t.isLogicalExpression(expr)) {
    return expressionMayProduceJSX(expr.left as t.Expression) || expressionMayProduceJSX(expr.right as t.Expression)
  }
  if (t.isConditionalExpression(expr)) {
    return expressionMayProduceJSX(expr.consequent) || expressionMayProduceJSX(expr.alternate)
  }
  if (t.isParenthesizedExpression(expr)) {
    return expressionMayProduceJSX(expr.expression as t.Expression)
  }
  if (t.isCallExpression(expr)) {
    const callee = expr.callee
    if (t.isArrowFunctionExpression(callee) || t.isFunctionExpression(callee)) {
      if (t.isBlockStatement(callee.body)) {
        return callee.body.body.some(
          (s) => t.isReturnStatement(s) && !!s.argument && expressionMayProduceJSX(s.argument),
        )
      }
      return expressionMayProduceJSX(callee.body as t.Expression)
    }
  }
  return false
}

/**
 * Extract only the condition-controlling sub-expression from a JSX-producing
 * expression.  For `cond && <JSX/>` returns `cond`; for `cond ? <A/> : <B/>`
 * returns `cond`.  Props referenced only inside the JSX bodies are irrelevant
 * to whether the structure changes and must NOT trigger a full re-render.
 */
function extractConditionalControlExpression(expr: t.Expression): t.Expression | null {
  if (t.isParenthesizedExpression(expr)) {
    return extractConditionalControlExpression(expr.expression as t.Expression)
  }
  if (t.isLogicalExpression(expr) && expr.operator === '&&') {
    if (expressionMayProduceJSX(expr.right as t.Expression)) return expr.left as t.Expression
    if (expressionMayProduceJSX(expr.left as t.Expression)) return expr.right as t.Expression
    return null
  }
  if (t.isLogicalExpression(expr) && expr.operator === '||') {
    return expr.left as t.Expression
  }
  if (t.isConditionalExpression(expr)) {
    return expr.test
  }
  return null
}

function buildDerivedPropBindings(
  expr: t.Expression | t.JSXEmptyExpression,
  type: 'text' | 'class' | 'attribute' | 'value' | 'checked',
  attributeName: string | undefined,
  elementPath: string[],
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
  classBody?: t.ClassBody,
): PropBinding[] {
  if (t.isJSXEmptyExpression(expr) || !templateSetupContext) return []
  const setupStatements = collectTemplateSetupStatements(expr, templateSetupContext)
  const dependentProps = collectDependentPropNames(
    expr,
    setupStatements,
    propsParamName,
    destructuredPropNames,
    classBody,
  )
  if (dependentProps.length === 0) return []
  const selector = generateSelector(elementPath)
  return dependentProps.map((propName) => ({
    propName,
    selector,
    type,
    attributeName,
    elementPath: [...elementPath],
    expression: t.cloneNode(expr, true) as t.Expression,
    setupStatements: setupStatements.map((statement) => t.cloneNode(statement, true) as t.Statement),
  }))
}

function collectDependentPropNames(
  expr: t.Expression | t.JSXEmptyExpression,
  setupStatements: t.Statement[],
  propsParamName?: string,
  destructuredPropNames?: Set<string>,
  classBody?: t.ClassBody,
): string[] {
  const names = new Set<string>()
  const program = t.program([
    ...setupStatements.map((statement) => t.cloneNode(statement, true) as t.Statement),
    t.expressionStatement(t.cloneNode(expr, true) as t.Expression),
  ])
  const getterNamesToExpand = new Set<string>()
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      if (destructuredPropNames?.has(path.node.name)) names.add(path.node.name)
    },
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const propName = resolvePropRef(path.node, propsParamName, destructuredPropNames)
      if (propName) names.add(propName)
      if (classBody && t.isThisExpression(path.node.object) && t.isIdentifier(path.node.property)) {
        getterNamesToExpand.add(path.node.property.name)
      }
    },
  })
  if (classBody && getterNamesToExpand.size > 0) {
    for (const member of classBody.body) {
      if (
        !t.isClassMethod(member) ||
        member.kind !== 'get' ||
        !t.isIdentifier(member.key) ||
        !getterNamesToExpand.has(member.key.name)
      )
        continue
      const getterProgram = t.program(member.body.body.map((s) => t.cloneNode(s, true) as t.Statement))
      traverse(getterProgram, {
        noScope: true,
        Identifier(path: NodePath<t.Identifier>) {
          if (!path.isReferencedIdentifier()) return
          if (destructuredPropNames?.has(path.node.name)) names.add(path.node.name)
        },
        MemberExpression(path: NodePath<t.MemberExpression>) {
          if (t.isThisExpression(path.node.object) && t.isIdentifier(path.node.property)) {
            if (path.node.property.name === 'props' && t.isMemberExpression(path.parentPath?.node)) {
              const parent = path.parentPath.node as t.MemberExpression
              if (t.isIdentifier(parent.property)) names.add(parent.property.name)
            }
          }
          const propName = resolvePropRef(path.node, propsParamName, destructuredPropNames)
          if (propName) names.add(propName)
        },
      })
    }
  }
  return Array.from(names)
}

function collectAllStateAccesses(
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

  function isInsideRefAttribute(path: NodePath): boolean {
    let current: NodePath | null = path
    while (current) {
      if (t.isJSXAttribute(current.node) && t.isJSXIdentifier(current.node.name) && current.node.name.name === 'ref')
        return true
      current = current.parentPath
    }
    return false
  }

  traverse(prog, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!stateRefs.has(path.node.name)) return
      if (isInsideRefAttribute(path)) return
      const ref = stateRefs.get(path.node.name)!
      // Skip identifiers that are objects of property access — the MemberExpression
      // handler will register the deeper path (e.g. currentCategory.name → ["currentCategory", "name"]).
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
          // Register the getter path itself — delegate resolution in apply-reactivity
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

      // optionsStore yields parts: [] — handle destructuring: const { luggage, seat } = optionsStore
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

function collectItemTemplateStoreDependencies(
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

function detectUnresolvedRelationalClassBindings(
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
