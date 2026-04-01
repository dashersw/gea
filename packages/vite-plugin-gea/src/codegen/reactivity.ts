/**
 * reactivity.ts — Orchestrator
 *
 * Entry point for all Gea component reactivity wiring.
 * Delegates to focused sub-modules:
 *   - reactivity-bindings.ts  — prop binding patches, guard keys, getter deps
 *   - reactivity-arrays.ts    — unresolved/resolved array map processing
 *   - reactivity-wiring.ts    — final observer collection, createdHooks, dedup
 *   - reactivity-types.ts     — shared ReactivityContext type
 */

import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsExpr, jsMethod } from 'eszter'
import type { ClassMethod } from '@babel/types'

// ── IR types (old IR — still used by analysis result + codegen) ────────────
import type {
  ArrayMapBinding,
  ChildComponent,
  ConditionalSlot,
  EventHandler,
  PathParts,
  PropBinding,
  ReactiveBinding,
  UnresolvedMapInfo,
  UnresolvedRelationalClassBinding,
} from '../ir/types.ts'

// ── Analyze layer ──────────────────────────────────────────────────────────
import { analyzeTemplate } from '../analyze/analyzer.ts'
import type { AnalysisResult } from '../analyze/analyzer.ts'
import { collectExpressionDependencies } from '../analyze/binding-resolver.ts'

// ── Parse layer ────────────────────────────────────────────────────────────
import type { StateRefMeta } from '../parse/state-refs.ts'

// ── Sibling codegen files ──────────────────────────────────────────────────
import { mergeObserveHandlers } from './gen-observe-helpers.ts'
import { getTemplatePropNames, getTemplateParamIdentifier, getTemplatePropVarName } from './template-params.ts'
import {
  generateArrayConditionalPatchObserver,
  generateArrayConditionalRerenderObserver,
  generateArrayRelationalObserver,
} from './array-compiler.ts'
import { childHasNoProps } from './gen-children.ts'
import { appendCompiledEventMethods } from './gen-events.ts'

// ── Split-out codegen modules ─────────────────────────────────────────────
import {
  generateStoreInlinePatchObserver,
  generateRerenderObserver,
  generateConditionalSlotObserveMethod,
  generateStateChildSwapObserver,
} from './gen-observer-wiring.ts'
import { ensureOnPropChangeMethod } from './gen-prop-change.ts'
import {
  generateConditionalPatchMethods,
  generateStateChildSwapMethod,
} from './gen-conditional-observers.ts'
import {
  injectMapItemAttrsIntoTemplate,
  addJoinToUnresolvedMapCalls,
} from './gen-map-helpers.ts'

// ── AST helpers ────────────────────────────────────────────────────────────
import {
  buildObserveKey,
  getObserveMethodName,
  parseObserveKey,
  pathPartsToString,
  resolvePath,
} from './member-chain.ts'

// ── Constants (URL_ATTRS moved to reactivity-bindings.ts) ─────────────────

// ── Extracted reactivity sub-modules ─────────────────────────────────────
import type { ReactivityContext } from './reactivity-types.ts'
import { mergeObserveMethod, wireObservers, injectPrivateFields, injectModuleLevelUnwrapHelper } from './reactivity-wiring.ts'
import {
  processUnresolvedMaps,
  processUnresolvedMapDeps,
  processMapRegistrations,
  processResolvedArrayMaps,
} from './reactivity-arrays.ts'
import {
  buildPropBindingPatches,
  collectGuardStateKeys,
  collectComponentGetterStoreDeps,
} from './reactivity-bindings.ts'

// ═══════════════════════════════════════════════════════════════════════════
// Helper utilities (private to this module)
// ═══════════════════════════════════════════════════════════════════════════

/** No-op: templates access stores directly. */
function rewriteTemplateBodyForImportedState(
  _templateMethod: t.ClassMethod,
  _stateRefs: Map<string, StateRefMeta>,
  _storeImports: Map<string, string>,
): void {}

// Template param helpers — shared with reactivity-arrays.ts
// (imported from codegen/template-params.ts)

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

export function applyStaticReactivity(
  ast: t.File,
  originalAST: t.File,
  className: string,
  sourceFile: string,
  imports: Map<string, string>,
  stateRefs: Map<string, StateRefMeta>,
  storeImports: Map<string, string>,
  compiledChildren: ChildComponent[] = [],
  eventIdCounter: { value: number } = { value: 0 },
  preTransformAnalysis?: Map<string, AnalysisResult>,
): boolean {
  let applied = false
  let needsModuleLevelUnwrapHelper = false
  let needsClassLevelRawStoreField = false
  const classLevelPrivateFields = new Set<string>()

  const astToTraverse = preTransformAnalysis?.has(className) ? ast : originalAST
  const getAnalysis = (clsName: string, origPath: NodePath<ClassMethod>): AnalysisResult | null => {
    const cached = preTransformAnalysis?.get(clsName)
    if (cached) return cached
    const classBody = t.isClassBody(origPath.parent) ? origPath.parent : undefined
    return analyzeTemplate(origPath.node, stateRefs, classBody)
  }

  traverse(astToTraverse, {
    ClassMethod(origPath: NodePath<ClassMethod>) {
      if (!t.isIdentifier(origPath.node.key) || origPath.node.key.name !== 'template') return
      const analysis = getAnalysis(className, origPath)
      if (!analysis) return
      const hasCompiledChildStoreDeps = compiledChildren.some((child) => child.dependencies.some((dep) => dep.storeVar))
      if (
        analysis.bindings.length === 0 &&
        analysis.propBindings.length === 0 &&
        analysis.arrayMaps.length === 0 &&
        analysis.stateProps.size === 0 &&
        analysis.unresolvedMaps.length === 0 &&
        !hasCompiledChildStoreDeps &&
        analysis.earlyReturnGuard === undefined
      )
        return

      traverse(ast, {
        ClassDeclaration(classPath: NodePath<t.ClassDeclaration>) {
          if (!t.isIdentifier(classPath.node.id) || classPath.node.id.name !== className) return

          const templateMethod = classPath.node.body.body.find(
            (n): n is t.ClassMethod => t.isClassMethod(n) && t.isIdentifier(n.key) && n.key.name === 'template',
          )
          if (templateMethod) {
            rewriteTemplateBodyForImportedState(templateMethod, stateRefs, storeImports)
          }

          const handlers = mergeObserveHandlers(analysis.bindings, stateRefs)
          const handledPaths = new Set(handlers.keys())
          const addedMethods = new Map<string, t.ClassMethod>()
          const addedMethodsByName = new Map<string, t.ClassMethod>()
          const stateProps = new Map(analysis.stateProps)

          compiledChildren.forEach((child) => {
            child.dependencies.forEach((dep) => {
              if (!stateProps.has(dep.observeKey)) stateProps.set(dep.observeKey, dep.pathParts)
            })
          })

          const alignMethodBodyParams = (
            source: t.ClassMethod,
            targetParams: (t.Identifier | t.Pattern | t.RestElement)[],
          ) => {
            const bodyStatements = source.body.body.map((stmt) => t.cloneNode(stmt, true) as t.Statement)
            if (source.params.length !== targetParams.length) return bodyStatements

            const renameMap = new Map<string, string>()
            for (let i = 0; i < source.params.length; i++) {
              const sourceParam = source.params[i]
              const targetParam = targetParams[i]
              if (!t.isIdentifier(sourceParam) || !t.isIdentifier(targetParam)) continue
              if (sourceParam.name !== targetParam.name) renameMap.set(sourceParam.name, targetParam.name)
            }
            if (renameMap.size === 0) return bodyStatements

            const tempProgram = t.program(bodyStatements)
            traverse(tempProgram, {
              noScope: true,
              Identifier(path: NodePath<t.Identifier>) {
                const nextName = renameMap.get(path.node.name)
                if (nextName) path.node.name = nextName
              },
            })
            return tempProgram.body as t.Statement[]
          }

          const ctx: ReactivityContext = {
            classPath,
            addedMethods,
            addedMethodsByName,
            applied,
            alignMethodBodyParams,
          }

          const _merge = (observeKey: string, method: t.ClassMethod) => {
            mergeObserveMethod(ctx, observeKey, method)
            applied = ctx.applied
          }

          const templatePropNames = getTemplatePropNames(classPath.node.body)
          const templateWholeParam = getTemplateParamIdentifier(classPath.node.body)

          // Cached getElementById refs
          const elRefFieldNames: string[] = []
          let elRefSlotNext = 0
          const allocElRefField = (): string => {
            const name = `__e${elRefSlotNext++}`
            elRefFieldNames.push(name)
            return name
          }
          const buildCachedGetElementById = (idArg: t.Expression): t.Expression => {
            const field = allocElRefField()
            const read = t.memberExpression(t.thisExpression(), t.identifier(field))
            const inner = t.callExpression(
              t.memberExpression(t.identifier('document'), t.identifier('getElementById')),
              [idArg],
            )
            return t.logicalExpression(
              '||',
              read,
              t.parenthesizedExpression(t.assignmentExpression('=', t.cloneNode(read, true), inner)),
            )
          }

          // ── Prop binding patch statements ───────────────────────────────
          const bindingResult = buildPropBindingPatches(
            analysis,
            stateRefs,
            templatePropNames,
            templateWholeParam,
            buildCachedGetElementById,
          )
          const { patchStatementsByBinding, inlinePatchBodies, storeKeyToBindings } = bindingResult
          applied = applied || bindingResult.applied

          handlers.forEach((method, observeKey) => {
            _merge(observeKey, method)
          })

          // ── Early return guard rerender ────────────────────────────────
          if (analysis.earlyReturnGuard) {
            const guardExpr = analysis.earlyReturnGuard
            const localToStoreExpr = new Map<string, t.MemberExpression>()
            const setupStmts =
              templateMethod?.body.body.filter((s): s is t.VariableDeclaration => t.isVariableDeclaration(s)) || []
            for (const decl of setupStmts) {
              for (const d of decl.declarations) {
                if (t.isIdentifier(d.id) && t.isMemberExpression(d.init)) {
                  localToStoreExpr.set(d.id.name, d.init)
                }
              }
            }

            const rerenderStoreKeys: Array<{ observeKey: string; pathParts: PathParts }> = []
            const addedKeys = new Set<string>()
            const addRerenderDep = (parts: PathParts, storeVarName?: string) => {
              const key = buildObserveKey(parts, storeVarName)
              if (!addedKeys.has(key)) {
                addedKeys.add(key)
                rerenderStoreKeys.push({ observeKey: key, pathParts: parts })
              }
            }
            const guardScanProg = t.program([t.expressionStatement(t.cloneNode(guardExpr, true) as t.Expression)])
            traverse(guardScanProg, {
              noScope: true,
              MemberExpression(path: NodePath<t.MemberExpression>) {
                const resolved = resolvePath(path.node, stateRefs)
                if (!resolved?.parts?.length) return
                if (resolved.isImportedState || resolved.storeVar) {
                  addRerenderDep(resolved.parts as PathParts, resolved.isImportedState ? resolved.storeVar : undefined)
                }
              },
              Identifier(path: NodePath<t.Identifier>) {
                if (
                  path.parentPath &&
                  t.isMemberExpression(path.parentPath.node) &&
                  path.parentPath.node.object === path.node
                )
                  return
                const name = path.node.name
                const storeExpr = localToStoreExpr.get(name)
                if (storeExpr) {
                  const resolved = resolvePath(storeExpr, stateRefs)
                  if (resolved?.parts?.length && (resolved.isImportedState || resolved.storeVar)) {
                    addRerenderDep(
                      resolved.parts as PathParts,
                      resolved.isImportedState ? resolved.storeVar : undefined,
                    )
                    return
                  }
                }
                const ref = stateRefs.get(name)
                if (!ref) return
                if (ref.kind === 'local-destructured' && ref.propName) {
                  addRerenderDep([ref.propName] as PathParts)
                }
              },
            })
            for (const entry of rerenderStoreKeys) {
              const propPath = entry.pathParts
              const parsed = JSON.parse(entry.observeKey)
              const storeVarName = parsed.storeVar || undefined
              const methodNameStr = getObserveMethodName(propPath, storeVarName)
              const prevProp = `__geaPrev_guard_${methodNameStr}`
              const rerenderMethod = jsMethod`${id(methodNameStr)}(__v, __c) { if (!__v === !this.${id(prevProp)}) return; this.${id(prevProp)} = __v; this.__geaRequestRender(); }`
              _merge(entry.observeKey, rerenderMethod)
              if (!stateProps.has(entry.observeKey)) {
                stateProps.set(entry.observeKey, entry.pathParts)
              }
            }
          }

          // ── Template setup context ──────────────────────────────────
          const tmplBody = templateMethod?.body.body ?? []
          let tmplReturnIdx = -1
          for (let ri = tmplBody.length - 1; ri >= 0; ri--) {
            if (t.isReturnStatement(tmplBody[ri])) {
              tmplReturnIdx = ri
              break
            }
          }
          const tmplSetupCtx = templateMethod
            ? {
                params: templateMethod.params,
                statements: tmplReturnIdx >= 0 ? tmplBody.slice(0, tmplReturnIdx) : [],
              }
            : undefined

          // ── Unresolved maps processing ────────────────────────────────
          const unresolvedResult = processUnresolvedMaps(
            ctx,
            analysis,
            stateRefs,
            imports,
            sourceFile,
            stateProps,
            templateMethod,
            tmplSetupCtx,
            eventIdCounter,
            templatePropNames,
            templateWholeParam,
          )
          applied = ctx.applied
          needsModuleLevelUnwrapHelper = needsModuleLevelUnwrapHelper || unresolvedResult.needsModuleLevelUnwrapHelper
          needsClassLevelRawStoreField = needsClassLevelRawStoreField || unresolvedResult.needsClassLevelRawStoreField
          for (const f of unresolvedResult.classLevelPrivateFields) classLevelPrivateFields.add(f)
          const {
            unresolvedEventHandlers,
            unresolvedBindings,
            componentArrayRefreshDeps,
            componentArrayDisposeTargets,
            storeComponentArrayObservers,
            observeListConfigs,
            staticArrayRefreshOnMount,
            initialHtmlArrayRefreshOnMount,
            mapItemAttrInfos,
          } = unresolvedResult

          // ── Unresolved map prop refresh deps ──────────────────────────
          const unresolvedMapPropRefreshDeps = processUnresolvedMapDeps(
            ctx,
            unresolvedBindings,
            stateRefs,
            stateProps,
            templatePropNames,
            templateWholeParam,
          )
          applied = ctx.applied

          ensureOnPropChangeMethod(
            classPath.node.body,
            inlinePatchBodies,
            compiledChildren,
            componentArrayRefreshDeps,
            analysis.conditionalSlots || [],
            unresolvedMapPropRefreshDeps,
          )

          // ── __resetEls method ─────────────────────────────────────────
          if (elRefFieldNames.length > 0) {
            const hasReset = classPath.node.body.body.some(
              (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === '__resetEls',
            )
            if (!hasReset) {
              classPath.node.body.body.push(
                appendToBody(
                  jsMethod`__resetEls() {}`,
                  ...elRefFieldNames.map((name) => js`this.${id(name)} = null;`),
                ),
              )
              applied = true
            }
          }

          // ── State child slots ─────────────────────────────────────────
          if (analysis.stateChildSlots && analysis.stateChildSlots.length > 0) {
            generateStateChildSwapMethod(classPath.node.body, analysis.stateChildSlots)
          }

          const stateChildObserveKeys = new Set(
            (analysis.stateChildSlots || []).flatMap((slot) => slot.dependencies || []).map((dep) => dep.observeKey),
          )
          for (const dep of (analysis.stateChildSlots || []).flatMap((slot) => slot.dependencies || [])) {
            if (!stateProps.has(dep.observeKey)) {
              stateProps.set(dep.observeKey, dep.pathParts)
            }
          }

          // ── Conditional slot observe indices ──────────────────────────
          const conditionalSlotObserveIndices = new Map<string, number[]>()
          const addCondSlotIndex = (observeKey: string, slotIndex: number) => {
            const indices = conditionalSlotObserveIndices.get(observeKey) || []
            if (!indices.includes(slotIndex)) indices.push(slotIndex)
            conditionalSlotObserveIndices.set(observeKey, indices)
          }
          ;(analysis.conditionalSlots || []).forEach((slot, slotIndex) => {
            ;(slot.dependencies || []).forEach((dep) => addCondSlotIndex(dep.observeKey, slotIndex))
            const condDeps = collectExpressionDependencies(slot.conditionExpr, stateRefs, slot.setupStatements)
            for (const dep of condDeps) {
              if (!dep.storeVar) continue
              addCondSlotIndex(dep.observeKey, slotIndex)
            }
            for (const htmlExpr of [slot.truthyHtmlExpr, slot.falsyHtmlExpr]) {
              if (!htmlExpr) continue
              const contentDeps = collectExpressionDependencies(htmlExpr, stateRefs, slot.setupStatements)
              for (const dep of contentDeps) {
                addCondSlotIndex(dep.observeKey, slotIndex)
              }
            }
          })

          for (const [observeKey] of conditionalSlotObserveIndices) {
            if (!stateProps.has(observeKey)) {
              const { parts } = parseObserveKey(observeKey)
              stateProps.set(observeKey, parts)
            }
          }

          const hasOnPropChange = classPath.node.body.body.some(
            (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === '__onPropChange',
          )

          // ── Child observe groups ──────────────────────────────────────
          const childObserveGroups = new Map<string, ChildComponent[]>()
          compiledChildren.forEach((child) => {
            if (childHasNoProps(child)) return
            child.dependencies.forEach((dep) => {
              const group = childObserveGroups.get(dep.observeKey) || []
              group.push(child)
              childObserveGroups.set(dep.observeKey, group)
            })
          })

          const unresolvedMapKeys = new Set<string>()
          unresolvedBindings.forEach(({ info }) => {
            const deps = info.dependencies || []
            deps.forEach((dep) => unresolvedMapKeys.add(dep.observeKey))
          })

          const resolvedArrayMapDelegateKeys = new Set<string>()
          analysis.arrayMaps.forEach((arrayMap) => {
            if (arrayMap.storeVar) {
              const storeRef = stateRefs.get(arrayMap.storeVar)
              const getterDepPaths = storeRef?.getterDeps?.get(arrayMap.arrayPathParts[0])
              if (getterDepPaths && getterDepPaths.length > 0) {
                for (const depPath of getterDepPaths) {
                  resolvedArrayMapDelegateKeys.add(buildObserveKey(depPath, arrayMap.storeVar))
                }
              }
              resolvedArrayMapDelegateKeys.add(buildObserveKey(arrayMap.arrayPathParts, arrayMap.storeVar))
            }
          })

          const ownClassMethodNames = new Set(
            classPath.node.body.body
              .filter((m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key))
              .map((m) => (m.key as t.Identifier).name),
          )

          // ── Component getter store deps ───────────────────────────────
          const { componentGetterStoreDeps } = collectComponentGetterStoreDeps(classPath.node.body, stateRefs)

          // ── Guard state keys ──────────────────────────────────────────
          const guardStateKeys = collectGuardStateKeys(templateMethod, stateRefs, stateProps)

          // ── Array container binding IDs ───────────────────────────────
          const arrayContainerBindingIds = new Set<string>()
          for (const am of analysis.arrayMaps) {
            if (am.containerBindingId) arrayContainerBindingIds.add(am.containerBindingId)
          }
          for (const um of analysis.unresolvedMaps) {
            if (um.containerBindingId) arrayContainerBindingIds.add(um.containerBindingId)
          }

          // ── Main state props loop ─────────────────────────────────────
          for (const [observeKey, propPath] of stateProps) {
            const { storeVar } = parseObserveKey(observeKey)
            if (hasOnPropChange && !storeVar && propPath[0] === 'props') continue
            if (
              !storeVar &&
              propPath.length === 1 &&
              ownClassMethodNames.has(propPath[0]) &&
              !componentGetterStoreDeps.has(propPath[0])
            )
              continue
            const alreadyHandled = handledPaths.has(observeKey)
            const conditionalSlotIndices = conditionalSlotObserveIndices.get(observeKey) || []
            const arrayHandled = analysis.arrayMaps.some(
              (am) =>
                pathPartsToString(am.arrayPathParts) === pathPartsToString(propPath) &&
                (am.storeVar || undefined) === storeVar,
            )

            if (alreadyHandled) {
              if (conditionalSlotIndices.length > 0) {
                _merge(
                  observeKey,
                  generateConditionalSlotObserveMethod(propPath, storeVar, conditionalSlotIndices, false),
                )
              } else if (guardStateKeys.has(observeKey)) {
                _merge(observeKey, generateRerenderObserver(propPath, storeVar, true))
              }
              continue
            }

            const isNestedArrayPath =
              propPath.length > 1 &&
              analysis.arrayMaps.some(
                (am) =>
                  pathPartsToString(am.arrayPathParts) === pathPartsToString([propPath[0]]) &&
                  (am.storeVar || undefined) === storeVar,
              )

            const relationalArrayMaps = analysis.arrayMaps
              .map((arrayMap) => ({
                arrayMap,
                bindings: (arrayMap.relationalBindings || []).filter(
                  (binding) =>
                    pathPartsToString(binding.observePathParts) === pathPartsToString(propPath) &&
                    (binding.storeVar || undefined) === storeVar,
                ),
              }))
              .filter((entry) => entry.bindings.length > 0)

            if (relationalArrayMaps.length > 0) {
              relationalArrayMaps.forEach(({ arrayMap, bindings }) => {
                const relResult = generateArrayRelationalObserver(
                  propPath,
                  arrayMap,
                  bindings,
                  getObserveMethodName(propPath, storeVar),
                )
                _merge(observeKey, relResult.method)
                for (const f of relResult.privateFields) classLevelPrivateFields.add(f)
              })
            }

            const fallbackArrayMaps = analysis.arrayMaps
              .map((arrayMap) => ({
                arrayMap,
                bindings: (arrayMap.conditionalBindings || []).filter(
                  (binding) =>
                    binding.observe.observeKey === observeKey &&
                    observeKey !== buildObserveKey(arrayMap.arrayPathParts, arrayMap.storeVar),
                ),
              }))
              .filter((entry) => entry.bindings.length > 0)
            if (fallbackArrayMaps.length > 0) {
              fallbackArrayMaps.forEach(({ arrayMap, bindings }) => {
                const observer = bindings.some((binding) => binding.requiresRerender)
                  ? generateArrayConditionalRerenderObserver(arrayMap, getObserveMethodName(propPath, storeVar))
                  : generateArrayConditionalPatchObserver(arrayMap, bindings, getObserveMethodName(propPath, storeVar))
                _merge(observeKey, observer)
              })
              continue
            }

            let hasInlinePatches = false
            if (!stateChildObserveKeys.has(observeKey)) {
              const coveredBindings = storeKeyToBindings.get(observeKey)
              if (coveredBindings) {
                const patchStatements: t.Statement[] = []
                for (const pb of coveredBindings) {
                  if (pb.type === 'text' && pb.bindingId && arrayContainerBindingIds.has(pb.bindingId)) continue
                  const body = patchStatementsByBinding.get(pb)
                  if (body) {
                    if (coveredBindings.size === 1)
                      patchStatements.push(...body.map((s) => t.cloneNode(s, true) as t.Statement))
                    else patchStatements.push(t.blockStatement(body.map((s) => t.cloneNode(s, true) as t.Statement)))
                  }
                }
                if (patchStatements.length > 0) {
                  _merge(observeKey, generateStoreInlinePatchObserver(propPath, storeVar, patchStatements))
                  hasInlinePatches = true
                }
              }
            }

            if (conditionalSlotIndices.length > 0) {
              _merge(
                observeKey,
                generateConditionalSlotObserveMethod(
                  propPath,
                  storeVar,
                  conditionalSlotIndices,
                  !hasInlinePatches && !arrayHandled,
                ),
              )
            }

            if (hasInlinePatches) continue
            if (arrayHandled) continue
            if (isNestedArrayPath) continue
            if (stateChildObserveKeys.has(observeKey)) {
              _merge(observeKey, generateStateChildSwapObserver(propPath, storeVar))
              continue
            }

            if (analysis.arrayMaps.length > 0 && !guardStateKeys.has(observeKey)) continue
            if (unresolvedMapKeys.has(observeKey)) continue

            const handledByComponentArray =
              storeComponentArrayObservers.some(
                (obs) => obs.storeVar === storeVar && pathPartsToString(obs.pathParts) === pathPartsToString(propPath),
              ) ||
              observeListConfigs.some(
                (olc) => olc.storeVar === storeVar && pathPartsToString(olc.pathParts) === pathPartsToString(propPath),
              )
            if (handledByComponentArray) continue

            if (!childObserveGroups.has(observeKey)) {
              if (conditionalSlotIndices.length > 0) continue
              if (analysis.conditionalSlotScopedStoreKeys?.has(observeKey)) continue
              if (storeVar && propPath.length >= 1) {
                const storeRef = stateRefs.get(storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(propPath[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  const allDepsCovered = getterDepPaths.every((depPath) =>
                    childObserveGroups.has(buildObserveKey(depPath, storeVar)),
                  )
                  if (allDepsCovered) continue
                }
              }
              _merge(
                observeKey,
                generateRerenderObserver(propPath, storeVar, guardStateKeys.has(observeKey)),
              )
            } else if (guardStateKeys.has(observeKey)) {
              _merge(observeKey, generateRerenderObserver(propPath, storeVar, true))
            }
          }

          for (const guardKey of guardStateKeys) {
            if (addedMethods.has(guardKey)) continue
            const { parts, storeVar } = parseObserveKey(guardKey)
            _merge(guardKey, generateRerenderObserver(parts, storeVar, true))
          }

          // ── Children with resolved map ────────────────────────────────
          const childrenWithResolvedMap = new Set<string>()
          compiledChildren.forEach((child) => {
            const childrenProp = child.propsExpression.properties.find(
              (p): p is t.ObjectProperty => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'children',
            )
            if (!childrenProp) return
            let hasMap = false
            const check = {
              CallExpression(cePath: NodePath<t.CallExpression>) {
                if (
                  t.isMemberExpression(cePath.node.callee) &&
                  t.isIdentifier(cePath.node.callee.property) &&
                  cePath.node.callee.property.name === 'map'
                ) {
                  hasMap = true
                  cePath.stop()
                }
              },
            }
            const wrapper = t.expressionStatement(t.cloneNode(childrenProp.value as t.Expression, true))
            traverse(t.program([wrapper]), { noScope: true, ...check })
            if (hasMap) childrenWithResolvedMap.add(child.instanceVar)
          })

          // Strip .map().join("") calls from children prop template literals
          if (childrenWithResolvedMap.size > 0 && analysis.arrayMaps.length > 0) {
            compiledChildren.forEach((child) => {
              if (!childrenWithResolvedMap.has(child.instanceVar)) return
              const childrenProp = child.propsExpression.properties.find(
                (p): p is t.ObjectProperty =>
                  t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'children',
              )
              if (!childrenProp || !t.isTemplateLiteral(childrenProp.value)) return
              const tpl = childrenProp.value
              for (let i = 0; i < tpl.expressions.length; i++) {
                const expr = tpl.expressions[i]
                let isMapJoin = false
                if (
                  t.isCallExpression(expr) &&
                  t.isMemberExpression(expr.callee) &&
                  t.isIdentifier(expr.callee.property, { name: 'join' }) &&
                  t.isCallExpression(expr.callee.object) &&
                  t.isMemberExpression(expr.callee.object.callee) &&
                  t.isIdentifier(expr.callee.object.callee.property, { name: 'map' })
                ) {
                  isMapJoin = true
                }
                if (
                  !isMapJoin &&
                  t.isCallExpression(expr) &&
                  t.isMemberExpression(expr.callee) &&
                  t.isIdentifier(expr.callee.property, { name: 'map' })
                ) {
                  isMapJoin = true
                }
                if (
                  !isMapJoin &&
                  t.isLogicalExpression(expr) &&
                  t.isCallExpression(expr.left) &&
                  t.isMemberExpression(expr.left.callee) &&
                  t.isIdentifier(expr.left.callee.property, { name: 'join' }) &&
                  t.isCallExpression(expr.left.callee.object) &&
                  t.isMemberExpression(expr.left.callee.object.callee) &&
                  t.isIdentifier(expr.left.callee.object.callee.property, { name: 'map' })
                ) {
                  isMapJoin = true
                }
                if (isMapJoin) {
                  tpl.expressions.splice(i, 1)
                  const leftQuasi = tpl.quasis[i]
                  const rightQuasi = tpl.quasis[i + 1]
                  if (leftQuasi && rightQuasi) {
                    const merged = (leftQuasi.value.raw || '') + (rightQuasi.value.raw || '')
                    leftQuasi.value = { raw: merged, cooked: merged }
                    tpl.quasis.splice(i + 1, 1)
                  }
                  i--
                }
              }
            })

            // Also strip map calls from __buildProps methods
            for (const member of classPath.node.body.body) {
              if (!t.isClassMethod(member) || !t.isIdentifier(member.key)) continue
              const methodName = member.key.name
              const isRelevant = childrenWithResolvedMap.size > 0 && methodName.startsWith('__buildProps_')
              if (!isRelevant) continue
              traverse(t.program([t.expressionStatement(t.functionExpression(null, [], member.body))]), {
                noScope: true,
                TemplateLiteral(tlPath: NodePath<t.TemplateLiteral>) {
                  const tl = tlPath.node
                  for (let i = 0; i < tl.expressions.length; i++) {
                    const expr = tl.expressions[i] as t.Expression
                    let isMap = false
                    if (
                      t.isCallExpression(expr) &&
                      t.isMemberExpression(expr.callee) &&
                      t.isIdentifier(expr.callee.property, { name: 'join' }) &&
                      expr.arguments.length === 1 &&
                      t.isStringLiteral(expr.arguments[0]) &&
                      expr.arguments[0].value === '' &&
                      t.isCallExpression(expr.callee.object) &&
                      t.isMemberExpression(expr.callee.object.callee) &&
                      t.isIdentifier(expr.callee.object.callee.property, { name: 'map' })
                    ) {
                      isMap = true
                    }
                    if (
                      !isMap &&
                      t.isCallExpression(expr) &&
                      t.isMemberExpression(expr.callee) &&
                      t.isIdentifier(expr.callee.property, { name: 'map' })
                    ) {
                      isMap = true
                    }
                    if (
                      !isMap &&
                      t.isLogicalExpression(expr) &&
                      t.isCallExpression(expr.left) &&
                      t.isMemberExpression(expr.left.callee) &&
                      t.isIdentifier(expr.left.callee.property, { name: 'join' }) &&
                      expr.left.arguments.length === 1 &&
                      t.isStringLiteral(expr.left.arguments[0]) &&
                      expr.left.arguments[0].value === '' &&
                      t.isCallExpression(expr.left.callee.object) &&
                      t.isMemberExpression(expr.left.callee.object.callee) &&
                      t.isIdentifier(expr.left.callee.object.callee.property, { name: 'map' })
                    ) {
                      isMap = true
                    }
                    if (isMap) {
                      tl.expressions.splice(i, 1)
                      const left = tl.quasis[i]
                      const right = tl.quasis[i + 1]
                      if (left && right) {
                        const m = (left.value.raw || '') + (right.value.raw || '')
                        left.value = { raw: m, cooked: m }
                        tl.quasis.splice(i + 1, 1)
                      }
                      i--
                    }
                  }
                },
              })
            }
          }

          // ── Child observe groups emit ─────────────────────────────────
          {
            childObserveGroups.forEach((children, observeKey) => {
              const { parts, storeVar } = parseObserveKey(observeKey)
              if (hasOnPropChange && !storeVar && parts[0] === 'props') return
              const methodName = getObserveMethodName(parts, storeVar)
              const existing = addedMethods.get(observeKey)
              const calls = children
                .filter((child) => {
                  if (resolvedArrayMapDelegateKeys.has(observeKey) && childrenWithResolvedMap.has(child.instanceVar)) {
                    return false
                  }
                  return true
                })
                .map((child) => {
                  const buildPropsName = `__buildProps_${child.instanceVar.replace(/^_/, '')}`
                  const updateExpr = js`this.${id(child.instanceVar)}.__geaUpdateProps(this.${id(buildPropsName)}());`
                  if (!child.lazy) return updateExpr
                  const backingField = `__lazy${child.instanceVar}`
                  return js`if (this.${id(backingField)}) { ${updateExpr} }`
                })
              if (existing && t.isBlockStatement(existing.body)) {
                existing.body.body.unshift(...calls)
              } else {
                const method = appendToBody(jsMethod`${id(methodName)}(value, change) {}`, ...calls)
                classPath.node.body.body.push(method)
                addedMethods.set(observeKey, method)
                applied = true
              }
            })
          }

          // ── Map registrations and sync observers ──────────────────────
          ctx.applied = applied
          const { mapRegistrations, mapSyncObservers } = processMapRegistrations(
            ctx,
            unresolvedBindings,
            stateRefs,
            classLevelPrivateFields,
          )
          applied = ctx.applied

          if (mapItemAttrInfos.length > 0 && templateMethod) {
            injectMapItemAttrsIntoTemplate(templateMethod, mapItemAttrInfos)
          }

          if (templateMethod && analysis.unresolvedMaps.length > 0) {
            addJoinToUnresolvedMapCalls(templateMethod, analysis.unresolvedMaps)
          }

          // ── Resolved array maps (component + HTML) ───────────────────
          ctx.applied = applied
          const resolvedResult = processResolvedArrayMaps(
            ctx,
            analysis,
            stateRefs,
            imports,
            sourceFile,
            stateProps,
            templateMethod,
            tmplSetupCtx,
            eventIdCounter,
            observeListConfigs,
            componentArrayDisposeTargets,
            staticArrayRefreshOnMount,
            initialHtmlArrayRefreshOnMount,
            childrenWithResolvedMap,
            storeComponentArrayObservers,
          )
          applied = ctx.applied
          needsModuleLevelUnwrapHelper = needsModuleLevelUnwrapHelper || resolvedResult.needsModuleLevelUnwrapHelper
          needsClassLevelRawStoreField = needsClassLevelRawStoreField || resolvedResult.needsClassLevelRawStoreField
          for (const f of resolvedResult.classLevelPrivateFields) classLevelPrivateFields.add(f)
          const { htmlArrayMaps, renderEventHandlers } = resolvedResult

          // ── Conditional patch methods ─────────────────────────────────
          if ((analysis.conditionalSlots || []).length > 0) {
            const templatePropNames = getTemplatePropNames(classPath.node.body)
            const htmlArrayMapLastSegments = analysis.arrayMaps.length > 0 ? analysis.arrayMaps : undefined
            generateConditionalPatchMethods(
              classPath.node.body,
              analysis.conditionalSlots!,
              templatePropNames,
              getTemplateParamIdentifier(classPath.node.body),
              analysis.earlyReturnGuard,
              htmlArrayMapLastSegments,
            )
          }

          if (renderEventHandlers.length > 0) {
            applied = appendCompiledEventMethods(classPath.node.body, renderEventHandlers) || applied
          }
          if (unresolvedEventHandlers.length > 0) {
            applied = appendCompiledEventMethods(classPath.node.body, unresolvedEventHandlers) || applied
          }

          // ── Final wiring: observer registration ───────────────────────
          ctx.applied = applied
          wireObservers(
            ctx,
            stateRefs,
            htmlArrayMaps,
            mapRegistrations,
            mapSyncObservers,
            storeComponentArrayObservers,
            observeListConfigs,
            staticArrayRefreshOnMount,
            initialHtmlArrayRefreshOnMount,
            guardStateKeys,
            componentGetterStoreDeps,
            ownClassMethodNames,
            hasOnPropChange,
            unresolvedBindings,
          )
          applied = ctx.applied

          // ── Private fields ────────────────────────────────────────────
          injectPrivateFields(ctx, classLevelPrivateFields, needsClassLevelRawStoreField)
        },
      })
    },
  })

  injectModuleLevelUnwrapHelper(ast, needsModuleLevelUnwrapHelper)

  return applied
}
