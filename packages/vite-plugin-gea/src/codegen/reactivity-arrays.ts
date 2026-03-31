/**
 * reactivity-arrays.ts
 *
 * Array map processing for both unresolved (inline) maps and resolved
 * (component/HTML) array maps. Handles map registrations, sync observers,
 * component array lifecycle, and HTML array handler generation.
 *
 * Extracted from gen-reactivity.ts applyStaticReactivity().
 */

import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsExpr, jsMethod } from 'eszter'

import type {
  ArrayMapBinding,
  ChildComponent,
  EventHandler,
  PathParts,
  UnresolvedMapInfo,
} from '../ir/types.ts'
import type { AnalysisResult } from '../analyze/analyzer.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'
import { collectExpressionDependencies } from '../analyze/binding-resolver.ts'

import {
  generateRenderItemMethod,
  buildPopulateItemHandlersMethod,
} from './gen-array-render.ts'
import { generateCreateItemMethod, generatePatchItemMethod } from './gen-array-patch.ts'
import {
  generateComponentArrayResult,
  getComponentArrayItemsName,
  getComponentArrayRefreshMethodName,
  isUnresolvedMapWithComponentChild,
} from './gen-array-slot-sync.ts'
import { getHoistableRootEventsForImport } from './event-helpers.ts'
import { appendCompiledEventMethods } from './gen-events.ts'
import {
  generateArrayHandlers,
  generateEnsureArrayConfigsMethod,
} from './gen-array.ts'
import { generateUnresolvedRelationalObserver } from './gen-observer-wiring.ts'
import {
  getArrayPropNameFromExpr,
  getMapIndex,
  generateMapRegistration,
  collectUnresolvedDependencies,
  replaceMapWithComponentArrayItems,
  replaceMapWithComponentArrayItemsInConditionalSlots,
  inlineIntoConstructor,
  ensureDisposeCalls,
  injectMapItemAttrsIntoTemplate,
  addJoinToUnresolvedMapCalls,
  replaceInlineMapWithRenderCall,
  stripHtmlArrayMapJoinInTemplateMethod,
  replaceMapInConditionalSlots,
  collectPropNamesFromItemTemplate,
} from './gen-map-helpers.ts'
import {
  buildMemberChainFromParts,
  buildObserveKey,
  getObserveMethodName,
  pathPartsToString,
  resolvePath,
} from './member-chain.ts'
import { getTemplatePropNames, getTemplateParamIdentifier, getTemplatePropVarName } from './template-params.ts'

import type { ReactivityContext } from './reactivity-types.ts'
import { mergeObserveMethod } from './reactivity-wiring.ts'

// ═══════════════════════════════════════════════════════════════════════════
// Helper utilities
// ═══════════════════════════════════════════════════════════════════════════

// Template param helpers — shared with reactivity.ts
// (imported from codegen/template-params.ts)

// ═══════════════════════════════════════════════════════════════════════════
// Unresolved map result type
// ═══════════════════════════════════════════════════════════════════════════

export interface UnresolvedMapsResult {
  unresolvedEventHandlers: EventHandler[]
  unresolvedBindings: Array<{ info: UnresolvedMapInfo; binding: any }>
  componentArrayRefreshDeps: Array<{ methodName: string; propNames: string[] }>
  componentArrayDisposeTargets: string[]
  storeComponentArrayObservers: Array<{
    storeVar: string
    refreshMethodName: string
    pathParts: PathParts
  }>
  observeListConfigs: Array<{
    storeVar: string
    pathParts: PathParts
    arrayPropName: string
    componentTag: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
    itemIdProperty?: string
  }>
  staticArrayRefreshOnMount: string[]
  initialHtmlArrayRefreshOnMount: t.Statement[]
  mapItemAttrInfos: Array<{
    itemVariable: string
    itemIdProperty?: string
    containerBindingId?: string
    eventToken?: string
  }>
  needsModuleLevelUnwrapHelper: boolean
  needsClassLevelRawStoreField: boolean
  classLevelPrivateFields: Set<string>
}

// ═══════════════════════════════════════════════════════════════════════════
// processUnresolvedMaps
// ═══════════════════════════════════════════════════════════════════════════

export function processUnresolvedMaps(
  ctx: ReactivityContext,
  analysis: AnalysisResult,
  stateRefs: Map<string, StateRefMeta>,
  imports: Map<string, string>,
  sourceFile: string,
  stateProps: Map<string, PathParts>,
  templateMethod: t.ClassMethod | undefined,
  tmplSetupCtx:
    | { params: (t.Identifier | t.Pattern | t.RestElement)[]; statements: t.Statement[] }
    | undefined,
  eventIdCounter: { value: number },
  templatePropNames: Set<string>,
  templateWholeParam: string | undefined,
): UnresolvedMapsResult {
  const unresolvedEventHandlers: EventHandler[] = []
  const unresolvedBindings: Array<{ info: UnresolvedMapInfo; binding: any }> = []
  const componentArrayRefreshDeps: Array<{ methodName: string; propNames: string[] }> = []
  const componentArrayDisposeTargets: string[] = []
  const storeComponentArrayObservers: Array<{
    storeVar: string
    refreshMethodName: string
    pathParts: PathParts
  }> = []
  const observeListConfigs: Array<{
    storeVar: string
    pathParts: PathParts
    arrayPropName: string
    componentTag: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
    itemIdProperty?: string
  }> = []
  const staticArrayRefreshOnMount: string[] = []
  const initialHtmlArrayRefreshOnMount: t.Statement[] = []
  const mapItemAttrInfos: Array<{
    itemVariable: string
    itemIdProperty?: string
    containerBindingId?: string
    eventToken?: string
  }> = []
  let needsModuleLevelUnwrapHelper = false
  let needsClassLevelRawStoreField = false
  const classLevelPrivateFields = new Set<string>()

  const classPath = ctx.classPath
  const tmplBody = templateMethod?.body.body ?? []
  let tmplReturnIdx = -1
  for (let ri = tmplBody.length - 1; ri >= 0; ri--) {
    if (t.isReturnStatement(tmplBody[ri])) {
      tmplReturnIdx = ri
      break
    }
  }

  analysis.unresolvedMaps.forEach((um, idx) => {
    const isComponentSlot = isUnresolvedMapWithComponentChild(um, imports)
    const arrayPropName = um.computationExpr ? getArrayPropNameFromExpr(um.computationExpr) : null

    if (isComponentSlot && arrayPropName) {
      let storeArrayAccess: { storeVar: string; propName: string } | undefined
      if (um.computationExpr && t.isIdentifier(um.computationExpr) && stateRefs.has(um.computationExpr.name)) {
        const ref = stateRefs.get(um.computationExpr.name)!
        if (ref.kind === 'imported-destructured' && ref.storeVar && ref.propName) {
          const storeRef = stateRefs.get(ref.storeVar)
          if (storeRef?.reactiveFields?.has(ref.propName)) {
            storeArrayAccess = { storeVar: ref.storeVar, propName: ref.propName }
          }
        }
      }

      const propNames = getTemplatePropNames(classPath.node.body)
      const arrayResult = generateComponentArrayResult(
        um,
        arrayPropName,
        imports,
        propNames,
        classPath.node.body,
        storeArrayAccess,
        getTemplateParamIdentifier(classPath.node.body),
        tmplSetupCtx,
      )
      if (arrayResult && templateMethod) {
        classPath.node.body.body.push(arrayResult.itemPropsMethod)
        const importSource = imports.get(arrayResult.componentTag)
        if (importSource) {
          const delegatedEvents = getHoistableRootEventsForImport(sourceFile, importSource).map((meta) => ({
            eventType: meta.eventType,
            selector: meta.selector,
            methodName: `__event_${arrayPropName}_${meta.propName}`,
            delegatedPropName: meta.propName,
            usesTargetComponent: true,
          })) as EventHandler[]
          if (delegatedEvents.length > 0) {
            appendCompiledEventMethods(classPath.node.body, delegatedEvents)
          }
        }
        inlineIntoConstructor(classPath.node.body, [
          ...arrayResult.arrSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
          arrayResult.constructorInit,
        ])
        if (storeArrayAccess) {
          observeListConfigs.push({
            storeVar: storeArrayAccess.storeVar,
            pathParts: [storeArrayAccess.propName],
            arrayPropName,
            componentTag: arrayResult.componentTag,
            containerBindingId: arrayResult.containerBindingId,
            containerUserIdExpr: arrayResult.containerUserIdExpr,
            itemIdProperty: arrayResult.itemIdProperty,
          })
        } else {
          const computedDeps = (
            um.dependencies || collectUnresolvedDependencies([um], stateRefs, classPath.node.body)
          ).filter((dep) => dep.storeVar || dep.pathParts[0] !== 'props')
          const refreshMethodName = getComponentArrayRefreshMethodName(arrayPropName)
          const itemsName = getComponentArrayItemsName(arrayPropName)
          const itemPropsMethodNameRef = `__itemProps_${arrayPropName}`
          const containerSuffix = arrayResult.containerBindingId
          const containerExpr = arrayResult.containerUserIdExpr
            ? (jsExpr`document.getElementById(${t.cloneNode(arrayResult.containerUserIdExpr, true) as t.Expression})` as t.Expression)
            : containerSuffix
              ? (jsExpr`this.__el(${containerSuffix})` as t.Expression)
              : (jsExpr`this.$(":scope")` as t.Expression)

          const itemIdProp = arrayResult.itemIdProperty
          const keyFn =
            itemIdProp && itemIdProp !== ITEM_IS_KEY
              ? (jsExpr`(opt) => opt.${id(itemIdProp)}` as t.Expression)
              : itemIdProp === ITEM_IS_KEY
                ? (jsExpr`(opt) => opt` as t.Expression)
                : (jsExpr`(opt, __k) => ${'__idx_'} + __k` as t.Expression)

          const refreshMethod = appendToBody(
            jsMethod`${id(refreshMethodName)}() {}`,
            ...arrayResult.arrSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
            js`const __arr = ${t.cloneNode(arrayResult.arrAccessExpr, true)} ?? [];`,
            js`const __new = this.__reconcileList(this.${id(itemsName)}, __arr, ${t.cloneNode(containerExpr, true)}, ${id(arrayResult.componentTag)}, (opt) => this.${id(itemPropsMethodNameRef)}(opt), ${t.cloneNode(keyFn, true)});`,
            js`this.${id(itemsName)}.length = 0;`,
            js`this.${id(itemsName)}.push(...__new);`,
          )
          classPath.node.body.body.push(refreshMethod)

          if (computedDeps.length > 0) {
            computedDeps.forEach((dep) => {
              mergeObserveMethod(
                ctx,
                dep.observeKey,
                jsMethod`${id(getObserveMethodName(dep.pathParts, dep.storeVar))}(value, change) { this.${id(refreshMethodName)}(); }`,
              )
              if (dep.storeVar) {
                storeComponentArrayObservers.push({
                  storeVar: dep.storeVar,
                  refreshMethodName,
                  pathParts: dep.pathParts,
                })
              }
            })
          }
          const itemPropsMethod = arrayResult.itemPropsMethod
          if (itemPropsMethod && t.isBlockStatement(itemPropsMethod.body)) {
            const returnStmt = itemPropsMethod.body.body.find((s) => t.isReturnStatement(s)) as
              | t.ReturnStatement
              | undefined
            if (returnStmt?.argument && t.isObjectExpression(returnStmt.argument)) {
              const setupStmts = itemPropsMethod.body.body.filter(
                (s) => !t.isReturnStatement(s),
              ) as t.Statement[]
              const itemPropsDeps = collectExpressionDependencies(
                returnStmt.argument,
                stateRefs,
                setupStmts,
              ).filter((dep) => dep.storeVar)
              const computedDepKeys = new Set(
                computedDeps.map((cd) => `${cd.storeVar}:${pathPartsToString(cd.pathParts)}`),
              )
              for (const dep of itemPropsDeps) {
                const key = `${dep.storeVar}:${pathPartsToString(dep.pathParts)}`
                if (computedDepKeys.has(key)) continue
                computedDepKeys.add(key)
                storeComponentArrayObservers.push({
                  storeVar: dep.storeVar!,
                  refreshMethodName,
                  pathParts: dep.pathParts,
                })
              }
            }
          }
          const itemTemplateProps = collectPropNamesFromItemTemplate(um.itemTemplate, propNames)
          const allStoreManaged = computedDeps.length > 0 && computedDeps.every((dep) => dep.storeVar)
          componentArrayRefreshDeps.push({
            methodName: refreshMethodName,
            propNames: allStoreManaged ? [...itemTemplateProps] : [arrayPropName, ...itemTemplateProps],
          })
        }
        componentArrayDisposeTargets.push(getComponentArrayItemsName(arrayPropName))
        const wasReplacedInTemplate = replaceMapWithComponentArrayItems(
          templateMethod,
          um.computationExpr,
          getComponentArrayItemsName(arrayPropName),
        )
        if (!wasReplacedInTemplate && !storeArrayAccess) {
          staticArrayRefreshOnMount.push(getComponentArrayRefreshMethodName(arrayPropName))
        }
        ctx.applied = true
      }
      return
    }

    // Non-component unresolved map: synthetic binding
    const syntheticBinding = {
      arrayPathParts: [`__unresolved_${idx}`],
      itemVariable: um.itemVariable,
      ...(um.indexVariable ? { indexVariable: um.indexVariable } : {}),
      itemBindings: [],
      containerSelector: um.containerSelector,
      containerBindingId: um.containerBindingId,
      itemTemplate: um.itemTemplate,
      isImportedState: false,
      itemIdProperty: um.itemIdProperty,
      ...(um.callbackBodyStatements?.length ? { callbackBodyStatements: um.callbackBodyStatements } : {}),
    }
    unresolvedBindings.push({ info: um, binding: syntheticBinding })
    const prevEventLen = unresolvedEventHandlers.length
    const { method, handlerPropsInMap, needsUnwrapHelper, needsRawStoreCache } = generateRenderItemMethod(
      syntheticBinding,
      imports,
      unresolvedEventHandlers,
      eventIdCounter,
      classPath.node.body,
      tmplSetupCtx,
    )
    if (needsUnwrapHelper) needsModuleLevelUnwrapHelper = true
    if (needsRawStoreCache) needsClassLevelRawStoreField = true
    const newHandlers = unresolvedEventHandlers.slice(prevEventLen)
    const tokenMatch = newHandlers[0]?.selector?.match(/data-gea-event="([^"]+)"/)
    mapItemAttrInfos.push({
      itemVariable: um.itemVariable,
      itemIdProperty: um.itemIdProperty,
      containerBindingId: um.containerBindingId,
      eventToken: tokenMatch ? tokenMatch[1] : undefined,
    })
    if (method && templateMethod) {
      classPath.node.body.body.push(method)
      ctx.applied = true
    }
    const createResult = generateCreateItemMethod(
      syntheticBinding,
      getTemplatePropNames(classPath.node.body),
      getTemplateParamIdentifier(classPath.node.body),
      tmplSetupCtx,
    )
    if (createResult.method) classPath.node.body.body.push(createResult.method)
    if (createResult.needsRawStoreCache) needsClassLevelRawStoreField = true
    for (const f of createResult.privateFields) classLevelPrivateFields.add(f)
    const patchResult = generatePatchItemMethod(
      syntheticBinding,
      getTemplatePropNames(classPath.node.body),
      getTemplateParamIdentifier(classPath.node.body),
      tmplSetupCtx,
    )
    if (patchResult.method) classPath.node.body.body.push(patchResult.method)
    for (const f of patchResult.privateFields) classLevelPrivateFields.add(f)
    if (handlerPropsInMap.length > 0 && um.computationExpr) {
      if (arrayPropName) {
        const propNames = getTemplatePropNames(classPath.node.body)
        const populateMethod = buildPopulateItemHandlersMethod(
          arrayPropName,
          handlerPropsInMap,
          propNames,
          getTemplateParamIdentifier(classPath.node.body),
        )
        if (populateMethod && templateMethod && t.isBlockStatement(templateMethod.body)) {
          const arrayVarName = getTemplatePropVarName(templateMethod, arrayPropName)
          classPath.node.body.body.push(populateMethod)
          ctx.applied = true
          templateMethod.body.body.unshift(
            t.expressionStatement(
              t.logicalExpression(
                '&&',
                t.identifier(arrayVarName),
                t.callExpression(
                  t.memberExpression(
                    t.thisExpression(),
                    t.identifier(`__populateItemHandlersFor_${arrayPropName}`),
                  ),
                  [t.identifier(arrayVarName)],
                ),
              ),
            ),
          )
        }
      }
    }
  })

  if (componentArrayDisposeTargets.length > 0) {
    ensureDisposeCalls(classPath.node.body, componentArrayDisposeTargets)
  }

  return {
    unresolvedEventHandlers,
    unresolvedBindings,
    componentArrayRefreshDeps,
    componentArrayDisposeTargets,
    storeComponentArrayObservers,
    observeListConfigs,
    staticArrayRefreshOnMount,
    initialHtmlArrayRefreshOnMount,
    mapItemAttrInfos,
    needsModuleLevelUnwrapHelper,
    needsClassLevelRawStoreField,
    classLevelPrivateFields,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// processUnresolvedMapDeps — refresh deps + onPropChange
// ═══════════════════════════════════════════════════════════════════════════

export function processUnresolvedMapDeps(
  ctx: ReactivityContext,
  unresolvedBindings: Array<{ info: UnresolvedMapInfo; binding: any }>,
  stateRefs: Map<string, StateRefMeta>,
  stateProps: Map<string, PathParts>,
  templatePropNames: Set<string>,
  templateWholeParam: string | undefined,
): Array<{ mapIdx: number; propNames: string[] }> {
  const unresolvedMapPropRefreshDeps: Array<{ mapIdx: number; propNames: string[] }> = []
  unresolvedBindings.forEach(({ info, binding }) => {
    const deps = info.dependencies || collectUnresolvedDependencies([info], stateRefs, ctx.classPath.node.body)
    if (!info.dependencies) info.dependencies = deps

    const localStateDeps = deps.filter((dep) => !dep.storeVar && dep.pathParts[0] !== 'props')
    const mapIdx = getMapIndex(binding.arrayPathParts)
    for (const dep of localStateDeps) {
      mergeObserveMethod(
        ctx,
        dep.observeKey,
        jsMethod`${id(getObserveMethodName(dep.pathParts, dep.storeVar))}(value, change) { this.__geaSyncMap(${mapIdx}); }`,
      )
      if (!stateProps.has(dep.observeKey)) stateProps.set(dep.observeKey, dep.pathParts)
    }

    const propDeps = deps.filter((dep) => !dep.storeVar && dep.pathParts[0] === 'props')
    if (propDeps.length === 0) return

    const usedPropNames = new Set<string>()
    const scanNodes: t.Statement[] = [
      ...(info.computationSetupStatements || []).map((s) => t.cloneNode(s, true) as t.Statement),
    ]
    if (info.computationExpr) {
      scanNodes.push(t.expressionStatement(t.cloneNode(info.computationExpr, true) as t.Expression))
    }
    if (scanNodes.length > 0) {
      const prog = t.program(scanNodes)
      traverse(prog, {
        noScope: true,
        Identifier(path: NodePath<t.Identifier>) {
          if (templatePropNames.has(path.node.name)) usedPropNames.add(path.node.name)
        },
        MemberExpression(path: NodePath<t.MemberExpression>) {
          if (
            templateWholeParam &&
            t.isIdentifier(path.node.object, { name: templateWholeParam }) &&
            t.isIdentifier(path.node.property) &&
            !path.node.computed
          ) {
            usedPropNames.add(path.node.property.name)
          }
        },
      })
    }

    unresolvedMapPropRefreshDeps.push({
      mapIdx: getMapIndex(binding.arrayPathParts),
      propNames: Array.from(usedPropNames),
    })
  })
  return unresolvedMapPropRefreshDeps
}

// ═══════════════════════════════════════════════════════════════════════════
// processMapRegistrations — map registration & sync observer wiring
// ═══════════════════════════════════════════════════════════════════════════

export function processMapRegistrations(
  ctx: ReactivityContext,
  unresolvedBindings: Array<{ info: UnresolvedMapInfo; binding: any }>,
  stateRefs: Map<string, StateRefMeta>,
  classLevelPrivateFields: Set<string>,
): {
  mapRegistrations: t.ExpressionStatement[]
  mapSyncObservers: Array<{ storeVar: string; pathParts: PathParts; delegateName: string }>
} {
  const classPath = ctx.classPath
  const mapRegistrations: t.ExpressionStatement[] = []
  const mapSyncObservers: Array<{ storeVar: string; pathParts: PathParts; delegateName: string }> = []
  let applied = ctx.applied
  unresolvedBindings.forEach(({ info, binding }) => {
    const deps = info.dependencies || collectUnresolvedDependencies([info], stateRefs, classPath.node.body)
    const mapIdx = getMapIndex(binding.arrayPathParts)
    const delegateName = `__geaSyncMapDelegate_${mapIdx}`
    const hasNonRelationalDeps = deps.some(
      (dep) => !(info.relationalClassBindings || []).find((rb) => rb.observeKey === dep.observeKey),
    )
    mapRegistrations.push(
      generateMapRegistration(
        binding,
        info,
        getTemplatePropNames(classPath.node.body),
        getTemplateParamIdentifier(classPath.node.body),
      ),
    )
    if (hasNonRelationalDeps) applied = true
    let delegateEmitted = false
    deps.forEach((dep) => {
      const relBinding = (info.relationalClassBindings || []).find((rb) => rb.observeKey === dep.observeKey)
      if (relBinding) {
        const unresolvedRelResult = generateUnresolvedRelationalObserver(
          binding,
          info,
          relBinding,
          getObserveMethodName(dep.pathParts, dep.storeVar),
          getTemplatePropNames(classPath.node.body),
          getTemplateParamIdentifier(classPath.node.body),
        )
        mergeObserveMethod(ctx, dep.observeKey, unresolvedRelResult.method)
        for (const f of unresolvedRelResult.privateFields) classLevelPrivateFields.add(f)
      } else if (dep.storeVar) {
        if (!delegateEmitted) {
          classPath.node.body.body.push(
            appendToBody(
              jsMethod`${id(delegateName)}() {}`,
              js`this.__geaSyncMap(${mapIdx});`,
            ),
          )
          delegateEmitted = true
        }
        mapSyncObservers.push({
          storeVar: dep.storeVar,
          pathParts: dep.pathParts,
          delegateName,
        })
      } else {
        mergeObserveMethod(
          ctx,
          dep.observeKey,
          jsMethod`${id(getObserveMethodName(dep.pathParts))}(__v, __c) { this.__geaSyncMap(${mapIdx}); }`,
        )
      }
    })
  })
  ctx.applied = applied
  return { mapRegistrations, mapSyncObservers }
}

// ═══════════════════════════════════════════════════════════════════════════
// processResolvedArrayMaps — component + HTML array map processing
// ═══════════════════════════════════════════════════════════════════════════

export interface ResolvedArrayMapsResult {
  htmlArrayMaps: ArrayMapBinding[]
  componentArrayMaps: ArrayMapBinding[]
  needsModuleLevelUnwrapHelper: boolean
  needsClassLevelRawStoreField: boolean
  classLevelPrivateFields: Set<string>
  renderEventHandlers: EventHandler[]
}

export function processResolvedArrayMaps(
  ctx: ReactivityContext,
  analysis: AnalysisResult,
  stateRefs: Map<string, StateRefMeta>,
  imports: Map<string, string>,
  sourceFile: string,
  stateProps: Map<string, PathParts>,
  templateMethod: t.ClassMethod | undefined,
  tmplSetupCtx:
    | { params: (t.Identifier | t.Pattern | t.RestElement)[]; statements: t.Statement[] }
    | undefined,
  eventIdCounter: { value: number },
  observeListConfigs: Array<{
    storeVar: string
    pathParts: PathParts
    arrayPropName: string
    componentTag: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
    itemIdProperty?: string
  }>,
  componentArrayDisposeTargets: string[],
  staticArrayRefreshOnMount: string[],
  initialHtmlArrayRefreshOnMount: t.Statement[],
  childrenWithResolvedMap: Set<string>,
  storeComponentArrayObservers: Array<{
    storeVar: string
    refreshMethodName: string
    pathParts: PathParts
  }>,
): ResolvedArrayMapsResult {
  const classPath = ctx.classPath
  let needsModuleLevelUnwrapHelper = false
  let needsClassLevelRawStoreField = false
  const classLevelPrivateFields = new Set<string>()

  // ── Component array maps vs HTML array maps ───────────────────
  const componentArrayMaps: ArrayMapBinding[] = []
  const componentArrayItemPropsMethods = new Map<ArrayMapBinding, t.ClassMethod>()
  const htmlArrayMaps: ArrayMapBinding[] = []
  for (const arrayMap of analysis.arrayMaps) {
    const compChild = isUnresolvedMapWithComponentChild(
      {
        itemTemplate: arrayMap.itemTemplate,
        itemVariable: arrayMap.itemVariable,
        containerSelector: arrayMap.containerSelector,
      } as any,
      imports,
    )
    if (compChild) {
      componentArrayMaps.push(arrayMap)
    } else {
      htmlArrayMaps.push(arrayMap)
    }
  }

  // Process component-child array maps
  for (const arrayMap of componentArrayMaps) {
    const arrayPropName = arrayMap.arrayPathParts[arrayMap.arrayPathParts.length - 1]
    const isSinglePart = arrayMap.storeVar && arrayMap.arrayPathParts.length === 1
    const storeArrayAccess = isSinglePart
      ? { storeVar: arrayMap.storeVar!, propName: arrayMap.arrayPathParts[0] }
      : undefined
    let computationExpr: t.Expression | undefined
    let computationExprSafe: t.Expression | undefined
    if (arrayMap.storeVar && !isSinglePart) {
      let expr: t.Expression = t.identifier(arrayMap.storeVar)
      for (const part of arrayMap.arrayPathParts) {
        expr = t.memberExpression(expr, t.identifier(part))
      }
      computationExpr = expr
      let safeExpr: t.Expression = t.identifier(arrayMap.storeVar)
      for (let __pi = 0; __pi < arrayMap.arrayPathParts.length; __pi++) {
        const part = arrayMap.arrayPathParts[__pi]
        safeExpr = t.optionalMemberExpression(safeExpr, t.identifier(part), false, __pi > 0)
      }
      computationExprSafe = safeExpr
    }
    const um: UnresolvedMapInfo = {
      containerSelector: arrayMap.containerSelector,
      itemTemplate: arrayMap.itemTemplate,
      itemVariable: arrayMap.itemVariable,
      ...(arrayMap.indexVariable ? { indexVariable: arrayMap.indexVariable } : {}),
      itemIdProperty: arrayMap.itemIdProperty,
      containerElementPath: arrayMap.containerElementPath,
      containerBindingId: arrayMap.containerBindingId,
      computationExpr: computationExprSafe ?? computationExpr,
    }
    const propNames = getTemplatePropNames(classPath.node.body)
    const arrayResult = generateComponentArrayResult(
      um,
      arrayPropName,
      imports,
      propNames,
      classPath.node.body,
      storeArrayAccess,
      getTemplateParamIdentifier(classPath.node.body),
      tmplSetupCtx,
    )
    if (arrayResult && templateMethod) {
      classPath.node.body.body.push(arrayResult.itemPropsMethod)
      componentArrayItemPropsMethods.set(arrayMap, arrayResult.itemPropsMethod)
      const importSource = imports.get(arrayResult.componentTag)
      if (importSource) {
        const delegatedEvents = getHoistableRootEventsForImport(sourceFile, importSource).map((meta) => ({
          eventType: meta.eventType,
          selector: meta.selector,
          methodName: `__event_${arrayPropName}_${meta.propName}`,
          delegatedPropName: meta.propName,
          usesTargetComponent: true,
        })) as EventHandler[]
        if (delegatedEvents.length > 0) {
          appendCompiledEventMethods(classPath.node.body, delegatedEvents)
        }
      }
      inlineIntoConstructor(classPath.node.body, [
        ...arrayResult.arrSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
        arrayResult.constructorInit,
      ])
      if (arrayMap.storeVar) {
        observeListConfigs.push({
          storeVar: arrayMap.storeVar,
          pathParts: arrayMap.arrayPathParts,
          arrayPropName,
          componentTag: arrayResult.componentTag,
          containerBindingId: arrayResult.containerBindingId,
          containerUserIdExpr: arrayResult.containerUserIdExpr,
          itemIdProperty: arrayResult.itemIdProperty,
        })
      }
      componentArrayDisposeTargets.push(getComponentArrayItemsName(arrayPropName))
      const mapReplaceExpr = storeArrayAccess
        ? (jsExpr`${id(storeArrayAccess.storeVar)}.${id(storeArrayAccess.propName)}` as t.Expression)
        : computationExpr
      const itemsArrName = getComponentArrayItemsName(arrayPropName)
      const wasReplaced = replaceMapWithComponentArrayItems(templateMethod, mapReplaceExpr, itemsArrName)
      replaceMapWithComponentArrayItemsInConditionalSlots(
        analysis.conditionalSlots || [],
        mapReplaceExpr,
        itemsArrName,
      )
      if (!wasReplaced && !arrayMap.storeVar) {
        staticArrayRefreshOnMount.push(getComponentArrayRefreshMethodName(arrayPropName))
      }
      ctx.applied = true
    }
  }

  // Getter-backed component array map delegates
  for (const arrayMap of componentArrayMaps) {
    if (!arrayMap.storeVar) continue
    const storeRef = stateRefs.get(arrayMap.storeVar)
    const getterDepPaths = storeRef?.getterDeps?.get(arrayMap.arrayPathParts[0])
    if (!getterDepPaths || getterDepPaths.length === 0) continue

    const pathKey = arrayMap.arrayPathParts.join('.')
    for (const depPath of getterDepPaths) {
      const depObserveKey = buildObserveKey(depPath, arrayMap.storeVar)
      const depMethodName = getObserveMethodName(depPath, arrayMap.storeVar)
      const refreshStmt = js`this.__refreshList(${pathKey});`
      const existing = ctx.addedMethods.get(depObserveKey)
      if (existing && t.isBlockStatement(existing.body)) {
        const renderedGuardIdx = existing.body.body.findIndex(
          (s) =>
            t.isIfStatement(s) &&
            t.isMemberExpression(s.test) &&
            t.isIdentifier(s.test.property) &&
            s.test.property.name === 'rendered_',
        )
        if (renderedGuardIdx >= 0) {
          existing.body.body.splice(renderedGuardIdx, 0, refreshStmt)
        } else {
          existing.body.body.push(refreshStmt)
        }
      } else {
        mergeObserveMethod(ctx, depObserveKey, jsMethod`${id(depMethodName)}(__v, __c) { this.__refreshList(${pathKey}); }`)
      }
    }
  }

  // Component array maps: external state refs in itemProps
  for (const arrayMap of componentArrayMaps) {
    if (!arrayMap.storeVar) continue
    const itemPropsMethod = componentArrayItemPropsMethods.get(arrayMap)
    if (!itemPropsMethod) continue

    const pathKey = arrayMap.arrayPathParts.join('.')
    const storeRef = stateRefs.get(arrayMap.storeVar)
    const getterDepPaths = storeRef?.getterDeps?.get(arrayMap.arrayPathParts[0])
    const getterDepKeys = new Set((getterDepPaths || []).map((dp) => buildObserveKey(dp, arrayMap.storeVar)))

    const externalDeps = new Map<string, { parts: PathParts; storeVar?: string }>()
    const clonedBody = t.cloneNode(itemPropsMethod.body, true)
    traverse(t.program([t.expressionStatement(t.arrowFunctionExpression([], clonedBody))]), {
      noScope: true,
      Identifier(idPath: NodePath<t.Identifier>) {
        if (
          idPath.parentPath &&
          t.isMemberExpression(idPath.parentPath.node) &&
          idPath.parentPath.node.property === idPath.node &&
          !idPath.parentPath.node.computed
        )
          return
        const ref = stateRefs.get(idPath.node.name)
        if (!ref) return
        if (itemPropsMethod.params.some((p) => t.isIdentifier(p) && p.name === idPath.node.name)) return
        if (ref.kind === 'imported-destructured' && ref.storeVar && ref.propName) {
          const depKey = buildObserveKey([ref.propName], ref.storeVar)
          if (!getterDepKeys.has(depKey) && !externalDeps.has(depKey)) {
            externalDeps.set(depKey, { parts: [ref.propName], storeVar: ref.storeVar })
          }
        }
      },
      MemberExpression(mePath: NodePath<t.MemberExpression>) {
        const resolved = resolvePath(mePath.node, stateRefs)
        if (!resolved?.parts?.length || !resolved.isImportedState) return
        if (resolved.parts.some((p) => p === '__raw')) return
        const depKey = buildObserveKey(resolved.parts, resolved.storeVar)
        if (!getterDepKeys.has(depKey) && !externalDeps.has(depKey)) {
          externalDeps.set(depKey, { parts: [...resolved.parts], storeVar: resolved.storeVar })
        }
      },
    })

    for (const [depKey, dep] of externalDeps) {
      const depMethodName = getObserveMethodName(dep.parts, dep.storeVar)
      if (!stateProps.has(depKey)) stateProps.set(depKey, dep.parts)
      mergeObserveMethod(ctx, depKey, jsMethod`${id(depMethodName)}(__v, __c) { this.__refreshList(${pathKey}); }`)
    }
  }

  // ── HTML array maps ───────────────────────────────────────────
  const renderEventHandlers: EventHandler[] = []
  htmlArrayMaps.forEach((arrayMap) => {
    const observeKey = buildObserveKey(arrayMap.arrayPathParts, arrayMap.storeVar)
    const arrayHandlerMethodName = getObserveMethodName(arrayMap.arrayPathParts, arrayMap.storeVar)
    const { method, needsUnwrapHelper, needsRawStoreCache } = generateRenderItemMethod(
      arrayMap,
      imports,
      renderEventHandlers,
      eventIdCounter,
      classPath.node.body,
      tmplSetupCtx,
    )
    if (needsUnwrapHelper) needsModuleLevelUnwrapHelper = true
    if (needsRawStoreCache) needsClassLevelRawStoreField = true
    if (method) {
      classPath.node.body.body.push(method)
      ctx.applied = true
      const renderMethodName = (method.key as t.Identifier).name
      replaceInlineMapWithRenderCall(classPath, arrayMap, renderMethodName)
      const strippedInSlots = replaceMapInConditionalSlots(analysis.conditionalSlots || [], arrayMap)
      const strippedInTemplate =
        templateMethod && (analysis.conditionalSlots || []).length > 0
          ? stripHtmlArrayMapJoinInTemplateMethod(templateMethod, arrayMap)
          : false
      if (strippedInSlots || strippedInTemplate) {
        const currentValueExpr = arrayMap.storeVar
          ? buildMemberChainFromParts(t.identifier(arrayMap.storeVar), arrayMap.arrayPathParts)
          : buildMemberChainFromParts(t.thisExpression(), arrayMap.arrayPathParts)
        const initialArrayName = `__geaInitial_${arrayHandlerMethodName}`
        initialHtmlArrayRefreshOnMount.push(
          js`const ${id(initialArrayName)} = ${currentValueExpr};`,
          js`if ((${id(initialArrayName)}?.length || 0) > 0) this.${id(arrayHandlerMethodName)}(${id(initialArrayName)}, []);`,
        )
      }
    }

    const createResult = generateCreateItemMethod(
      arrayMap,
      getTemplatePropNames(classPath.node.body),
      getTemplateParamIdentifier(classPath.node.body),
      tmplSetupCtx,
    )
    if (createResult.method) {
      classPath.node.body.body.push(createResult.method)
    }
    if (createResult.needsRawStoreCache) needsClassLevelRawStoreField = true
    for (const f of createResult.privateFields) classLevelPrivateFields.add(f)
    const patchResult = generatePatchItemMethod(
      arrayMap,
      getTemplatePropNames(classPath.node.body),
      getTemplateParamIdentifier(classPath.node.body),
      tmplSetupCtx,
    )
    if (patchResult.method) {
      classPath.node.body.body.push(patchResult.method)
    }
    for (const f of patchResult.privateFields) classLevelPrivateFields.add(f)
    const handlersResult = generateArrayHandlers(arrayMap, arrayHandlerMethodName)
    handlersResult.methods.forEach((h) => {
      mergeObserveMethod(ctx, observeKey, h)
    })
    for (const f of handlersResult.privateFields) classLevelPrivateFields.add(f)
  })

  // Ensure array configs
  if (htmlArrayMaps.length > 0) {
    const ensureArrayConfigsMethod = generateEnsureArrayConfigsMethod(htmlArrayMaps)
    if (ensureArrayConfigsMethod) {
      classPath.node.body.body.push(ensureArrayConfigsMethod)
    }
  }

  // After-render for resolved array maps inside children props
  if (childrenWithResolvedMap.size > 0 && htmlArrayMaps.length > 0) {
    const afterRenderCalls: t.Statement[] = []
    htmlArrayMaps.forEach((arrayMap) => {
      const methodName = getObserveMethodName(arrayMap.arrayPathParts, arrayMap.storeVar)
      const valueExpr = arrayMap.storeVar
        ? (jsExpr`${id(arrayMap.storeVar)}.${id(arrayMap.arrayPathParts[0])}` as t.Expression)
        : (jsExpr`this.${id(arrayMap.arrayPathParts[0])}` as t.Expression)
      afterRenderCalls.push(js`this.${id(methodName)}(${valueExpr}, []);`)
    })
    if (afterRenderCalls.length > 0) {
      const afterRenderMethod = appendToBody(
        jsMethod`onAfterRender() { super.onAfterRender(); }`,
        ...afterRenderCalls,
      )
      classPath.node.body.body.push(afterRenderMethod)
    }
  }

  return {
    htmlArrayMaps,
    componentArrayMaps,
    needsModuleLevelUnwrapHelper,
    needsClassLevelRawStoreField,
    classLevelPrivateFields,
    renderEventHandlers,
  }
}
