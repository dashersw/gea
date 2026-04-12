import * as t from '@babel/types'
import type { ClassMethod } from '@babel/types'
import type {
  ObserveDependency,
  PathParts,
  PropBinding,
  ReactiveBinding,
  ArrayMapBinding,
  UnresolvedMapInfo,
} from '../ir/types.ts'
import { buildObserveKey } from '../codegen/member-chain.ts'
import { getDirectChildElements } from '../codegen/jsx-utils.ts'
import { getTemplateParamBinding } from './template-param-utils.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'
import { analyzeAttributes, collectTextChildren, analyzeChildren } from './template-walker.ts'
import {
  collectUnresolvedComputationDependencies,
  buildDerivedUnresolvedMapDescriptor,
  getHelperMethodObserveKey,
  collectAllStateAccesses,
  computeConditionalSlotScopedStoreKeys,
} from './dependency-collector.ts'

export interface AnalysisResult {
  bindings: ReactiveBinding[]
  propBindings: PropBinding[]
  arrayMaps: ArrayMapBinding[]
  stateProps: Map<string, PathParts>
  unresolvedMaps: UnresolvedMapInfo[]
  rerenderPropNames: string[]
  /** Condition expressions (with setup statements) that control conditional JSX rendering */
  rerenderConditions: Array<{ expression: t.Expression; setupStatements: t.Statement[] }>
  conditionalSlots: import('../ir').ConditionalSlot[]
  stateChildSlots: import('../codegen/gen-template').StateChildSlot[]
  /** elementPath.join(' > ') -> bindingId for template transform to inject id attributes */
  elementPathToBindingId: Map<string, string>
  /** elementPath.join(' > ') -> user-provided id expression (static string or dynamic expr) */
  elementPathToUserIdExpr: Map<string, t.Expression>
  /** Store observe keys that appear exclusively inside conditional slot branch content */
  conditionalSlotScopedStoreKeys: Set<string>
  /** Original AST expression node -> slotId, used by transform-jsx for direct lookup instead of cursor */
  conditionalSlotNodeMap: Map<t.Node, string>
  /** Guard condition from early return pattern (if (guard) return A; return B;) that requires full re-render */
  earlyReturnGuard?: t.Expression
  /**
   * Index into templateSetupContext.statements (statements before the final return) of the
   * early-return if. Setup after this index must not run unless that if has been evaluated first.
   */
  earlyReturnBarrierIndex?: number
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
  const conditionalSlots: import('../ir').ConditionalSlot[] = []
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

  // if (guard) return A; ...setup...; return B -- guard must run before main-branch setup
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
      ;(um as any).derived = derived
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
