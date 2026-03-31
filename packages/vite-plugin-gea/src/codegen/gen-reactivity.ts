/**
 * gen-reactivity.ts
 *
 * Orchestrator for all Gea component reactivity wiring: store observers,
 * prop change handlers, array map handling, conditional slot observers,
 * event delegation, early-return guard re-render triggers, and component
 * getter store deps.
 *
 * The heavy-lifting codegen helpers have been split into focused modules:
 *   - gen-observer-wiring.ts  — createdHooks, observer method generators
 *   - gen-prop-change.ts      — __onPropChange generation
 *   - gen-conditional-observers.ts — conditional patch & state child swap
 *   - gen-map-helpers.ts      — map registration & template map helpers
 */

import { traverse, t, generate } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsBlockBody, jsExpr, jsMethod } from 'eszter'
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
import { ITEM_IS_KEY } from '../analyze/helpers.ts'
import { getTemplateParamBinding } from '../analyze/template-param-utils.ts'
import { collectExpressionDependencies } from '../analyze/binding-resolver.ts'

// ── Parse layer ────────────────────────────────────────────────────────────
import type { StateRefMeta } from '../parse/state-refs.ts'

// ── Sibling codegen files ──────────────────────────────────────────────────
import { mergeObserveHandlers } from './gen-observe.ts'
import {
  generateArrayHandlers,
  generateArrayConditionalPatchObserver,
  generateArrayConditionalRerenderObserver,
  generateArrayRelationalObserver,
  generateEnsureArrayConfigsMethod,
} from './gen-array.ts'
import {
  generateRenderItemMethod,
  buildPopulateItemHandlersMethod,
  buildValueUnwrapHelper,
} from './gen-array-render.ts'
import { generateCreateItemMethod, generatePatchItemMethod } from './gen-array-patch.ts'
import {
  generateComponentArrayResult,
  getComponentArrayItemsName,
  getComponentArrayRefreshMethodName,
  isUnresolvedMapWithComponentChild,
} from './gen-array-slot-sync.ts'
import { childHasNoProps } from './gen-children.ts'
import { getHoistableRootEventsForImport } from './event-helpers.ts'
import { appendCompiledEventMethods } from './gen-events.ts'

// ── Split-out codegen modules ─────────────────────────────────────────────
import {
  generateCreatedHooks,
  generateLocalStateObserverSetup,
  generateStoreInlinePatchObserver,
  generateRerenderObserver,
  generateConditionalSlotObserveMethod,
  generateStateChildSwapObserver,
  generateUnresolvedRelationalObserver,
  classMethodUsesParam,
} from './gen-observer-wiring.ts'
import { ensureOnPropChangeMethod } from './gen-prop-change.ts'
import {
  generateConditionalPatchMethods,
  generateStateChildSwapMethod,
} from './gen-conditional-observers.ts'
import {
  getArrayPropNameFromExpr,
  getMapIndex,
  pruneUnusedSetupStatements,
  generateMapRegistration,
  collectUnresolvedDependencies,
  replaceMapWithComponentArrayItems,
  replaceMapWithComponentArrayItemsInConditionalSlots,
  inlineIntoConstructor,
  ensureDisposeCalls,
  injectMapItemAttrsIntoTemplate,
  addJoinToUnresolvedMapCalls,
  replaceInlineMapWithRenderCall,
  stripHtmlArrayMapJoinChainsInAst,
  stripHtmlArrayMapJoinInTemplateMethod,
  replaceMapInConditionalSlots,
  collectPropNamesFromItemTemplate,
} from './gen-map-helpers.ts'

// ── AST helpers ────────────────────────────────────────────────────────────
import {
  buildMemberChainFromParts,
  buildOptionalMemberChain,
  buildObserveKey,
  getObserveMethodName,
  parseObserveKey,
  pathPartsToString,
  pruneDeadParamDestructuring,
  derivedExprGuardsValueWhenNullish,
  expressionAccessesValueProperties,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
  replaceThisPropsRootWithValueParam,
  resolvePath,
  pruneUnusedSetupDestructuring,
  earlyReturnFalsyBindingName,
  cacheThisIdInMethod,
  optionalizeBindingRootInStatements,
  optionalizeMemberChainsFromBindingRoot,
  buildTrimmedClassJoinedExpression,
  buildTrimmedClassValueExpression,
  isAlwaysStringExpression,
  isWhitespaceFree,
} from './ast-helpers.ts'

// ── Constants ──────────────────────────────────────────────────────────────
import { BOOLEAN_HTML_ATTRS } from '../ir/constants.ts'

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

// ═══════════════════════════════════════════════════════════════════════════
// Helper utilities (private to this module)
// ═══════════════════════════════════════════════════════════════════════════

/** No-op: templates access stores directly. */
function rewriteTemplateBodyForImportedState(
  _templateMethod: t.ClassMethod,
  _stateRefs: Map<string, StateRefMeta>,
  _storeImports: Map<string, string>,
): void {}

function canInlineDynamicObserverKey(expr: t.Expression): boolean {
  let safe = true
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      safe = false
      path.stop()
    },
  })
  return safe
}

function expressionReferencesIdentifier(expr: t.Expression, name: string): boolean {
  let found = false
  const program = t.program([t.expressionStatement(t.cloneNode(expr, true))])
  traverse(program, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (!path.isReferencedIdentifier()) return
      if (path.node.name !== name) return
      found = true
      path.stop()
    },
  })
  return found
}

/** Merge `if (__el) if (cond) ...` into `if (__el && cond) ...` when there is no else. */
function wrapPatchWithElGuard(updateStmt: t.Statement): t.Statement {
  if (t.isIfStatement(updateStmt) && !updateStmt.alternate) {
    return t.ifStatement(t.logicalExpression('&&', t.identifier('__el'), updateStmt.test), updateStmt.consequent)
  }
  return t.ifStatement(t.identifier('__el'), updateStmt)
}

function getTemplatePropNames(classBody: t.ClassBody): Set<string> {
  const names = new Set<string>()
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  const binding = templateMethod ? getTemplateParamBinding(templateMethod.params[0]) : undefined
  if (binding && t.isObjectPattern(binding)) {
    binding.properties.forEach((p) => {
      if (t.isObjectProperty(p) && t.isIdentifier(p.key)) names.add(p.key.name)
    })
  }
  return names
}

function getTemplateParamIdentifier(classBody: t.ClassBody): string | undefined {
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  const binding = templateMethod ? getTemplateParamBinding(templateMethod.params[0]) : undefined
  return t.isIdentifier(binding) ? binding.name : undefined
}

/** Get the variable name in scope for a prop (handles { options } vs { options: n }) */
function getTemplatePropVarName(templateMethod: t.ClassMethod, propName: string): string {
  const pattern = getTemplateParamBinding(templateMethod.params[0])
  if (!pattern || !t.isObjectPattern(pattern)) return propName
  for (const p of pattern.properties) {
    if (!t.isObjectProperty(p)) continue
    const key = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : null
    if (key !== propName) continue
    const value = p.value
    if (t.isIdentifier(value)) return value.name
    return propName
  }
  return propName
}

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
          const getMethodName = (method: t.ClassMethod): string | null =>
            t.isIdentifier(method.key) ? method.key.name : t.isStringLiteral(method.key) ? method.key.value : null

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

          const mergeObserveMethod = (observeKey: string, method: t.ClassMethod) => {
            const methodName = getMethodName(method)
            const existing =
              addedMethods.get(observeKey) || (methodName ? addedMethodsByName.get(methodName) : undefined)
            if (existing && t.isBlockStatement(existing.body) && t.isBlockStatement(method.body)) {
              if (method.params.length > existing.params.length) {
                existing.params = method.params.map((param) => t.cloneNode(param, true) as typeof param)
              }
              existing.body.body.push(
                ...alignMethodBodyParams(method, existing.params as (t.Identifier | t.Pattern | t.RestElement)[]),
              )
              return
            }
            classPath.node.body.body.push(method)
            addedMethods.set(observeKey, method)
            if (methodName) addedMethodsByName.set(methodName, method)
            applied = true
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
          const patchStatementsByBinding = new Map<PropBinding, t.Statement[]>()
          for (const pb of analysis.propBindings) {
            const elExpr = pb.userIdExpr
              ? buildCachedGetElementById(t.cloneNode(pb.userIdExpr, true) as t.Expression)
              : pb.bindingId !== undefined
                ? buildCachedGetElementById(
                    t.binaryExpression(
                      '+',
                      t.memberExpression(t.thisExpression(), t.identifier('id')),
                      t.stringLiteral('-' + pb.bindingId),
                    ),
                  )
                : pb.selector === ':scope'
                  ? t.memberExpression(t.thisExpression(), t.identifier('element_'))
                  : t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('$')), [
                      t.stringLiteral(pb.selector),
                    ])
            const valueExpr = pb.expression && pb.setupStatements ? t.identifier('__boundValue') : t.identifier('value')
            let updateStmt: t.Statement
            if (pb.type === 'text' && (pb as any).textNodeIndex !== undefined) {
              const tnIdx = t.numericLiteral((pb as any).textNodeIndex)
              const tnAccess = t.memberExpression(
                t.memberExpression(t.identifier('__el'), t.identifier('childNodes')),
                t.cloneNode(tnIdx, true),
                true,
              )
              const notTextNode = t.logicalExpression(
                '||',
                t.unaryExpression('!', t.identifier('__tn')),
                t.binaryExpression(
                  '!==',
                  t.memberExpression(t.identifier('__tn'), t.identifier('nodeType')),
                  t.numericLiteral(3),
                ),
              )
              const insertNewTextNode = t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.identifier('__tn'),
                    t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createTextNode')), [
                      t.cloneNode(valueExpr, true),
                    ]),
                  ),
                ),
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('insertBefore')), [
                    t.identifier('__tn'),
                    t.logicalExpression(
                      '||',
                      t.memberExpression(
                        t.memberExpression(t.identifier('__el'), t.identifier('childNodes')),
                        t.cloneNode(tnIdx, true),
                        true,
                      ),
                      t.nullLiteral(),
                    ),
                  ]),
                ),
              ])
              const updateExisting = t.ifStatement(
                t.binaryExpression(
                  '!==',
                  t.memberExpression(t.identifier('__tn'), t.identifier('nodeValue')),
                  t.cloneNode(valueExpr, true),
                ),
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(t.identifier('__tn'), t.identifier('nodeValue')),
                    t.cloneNode(valueExpr, true),
                  ),
                ),
              )
              updateStmt = t.blockStatement([
                t.variableDeclaration('let', [t.variableDeclarator(t.identifier('__tn'), tnAccess)]),
                t.ifStatement(notTextNode, insertNewTextNode, updateExisting),
              ])
            } else if (pb.type === 'text') {
              const targetProp = pb.propName === 'children' ? 'innerHTML' : 'textContent'
              const assignStmt = t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(t.identifier('__el'), t.identifier(targetProp)),
                  t.cloneNode(valueExpr, true),
                ),
              )
              const consequent =
                pb.propName === 'children'
                  ? t.blockStatement([
                      assignStmt,
                      t.expressionStatement(
                        t.callExpression(
                          t.memberExpression(t.thisExpression(), t.identifier('instantiateChildComponents_')),
                          [],
                        ),
                      ),
                      t.ifStatement(
                        t.memberExpression(t.thisExpression(), t.identifier('parentComponent')),
                        t.expressionStatement(
                          t.callExpression(
                            t.memberExpression(
                              t.memberExpression(t.thisExpression(), t.identifier('parentComponent')),
                              t.identifier('mountCompiledChildComponents_'),
                            ),
                            [],
                          ),
                        ),
                      ),
                    ])
                  : assignStmt
              updateStmt = t.ifStatement(
                t.binaryExpression(
                  '!==',
                  t.memberExpression(t.identifier('__el'), t.identifier(targetProp)),
                  valueExpr,
                ),
                consequent,
              )
            } else if (pb.type === 'class') {
              const isObjectClass = pb.expression && t.isObjectExpression(pb.expression)
              const objectJoinExpr = t.callExpression(
                t.memberExpression(
                  t.callExpression(
                    t.memberExpression(
                      t.callExpression(
                        t.memberExpression(
                          t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                            t.cloneNode(valueExpr, true),
                          ]),
                          t.identifier('filter'),
                        ),
                        [
                          t.arrowFunctionExpression(
                            [t.arrayPattern([t.identifier('__k'), t.identifier('__v')])],
                            t.identifier('__v'),
                          ),
                        ],
                      ),
                      t.identifier('map'),
                    ),
                    [t.arrowFunctionExpression([t.arrayPattern([t.identifier('__k')])], t.identifier('__k'))],
                  ),
                  t.identifier('join'),
                ),
                [t.stringLiteral(' ')],
              )
              const originalClassExpr = pb.expression && t.isExpression(pb.expression) ? pb.expression : valueExpr
              const canSkipClassCoercion =
                !isObjectClass &&
                isAlwaysStringExpression(originalClassExpr as t.Expression) &&
                isWhitespaceFree(originalClassExpr as t.Expression)
              const classValueExpr = isObjectClass
                ? buildTrimmedClassJoinedExpression(objectJoinExpr)
                : canSkipClassCoercion
                  ? valueExpr
                  : buildTrimmedClassValueExpression(valueExpr)
              updateStmt = canSkipClassCoercion
                ? t.blockStatement([
                    t.variableDeclaration('const', [
                      t.variableDeclarator(t.identifier('__newClass'), t.cloneNode(valueExpr, true)),
                    ]),
                    t.ifStatement(
                      t.binaryExpression(
                        '!==',
                        t.memberExpression(t.identifier('__el'), t.identifier('className')),
                        t.identifier('__newClass'),
                      ),
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(t.identifier('__el'), t.identifier('className')),
                          t.identifier('__newClass'),
                        ),
                      ),
                    ),
                  ])
                : t.blockStatement([
                    t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__newClass'), classValueExpr)]),
                    t.ifStatement(
                      t.binaryExpression(
                        '!==',
                        t.memberExpression(t.identifier('__el'), t.identifier('className')),
                        t.identifier('__newClass'),
                      ),
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(t.identifier('__el'), t.identifier('className')),
                          t.identifier('__newClass'),
                        ),
                      ),
                    ),
                  ])
            } else if ((pb.type === 'value' || pb.type === 'checked') && pb.attributeName) {
              const propName = pb.attributeName
              updateStmt = t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(t.identifier('__el'), t.identifier(propName)),
                  pb.type === 'checked'
                    ? t.unaryExpression('!', t.unaryExpression('!', valueExpr))
                    : t.conditionalExpression(
                        t.logicalExpression(
                          '||',
                          t.binaryExpression('===', t.cloneNode(valueExpr, true), t.nullLiteral()),
                          t.binaryExpression('===', t.cloneNode(valueExpr, true), t.identifier('undefined')),
                        ),
                        t.stringLiteral(''),
                        t.callExpression(t.identifier('String'), [valueExpr]),
                      ),
                ),
              )
            } else if (pb.type === 'attribute' && pb.attributeName) {
              const attrName = pb.attributeName
              if (attrName === 'style') {
                const cssTextExpr = t.conditionalExpression(
                  t.binaryExpression('===', t.unaryExpression('typeof', valueExpr), t.stringLiteral('object')),
                  t.callExpression(
                    t.memberExpression(
                      t.callExpression(
                        t.memberExpression(
                          t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
                            valueExpr,
                          ]),
                          t.identifier('map'),
                        ),
                        [
                          t.arrowFunctionExpression(
                            [t.arrayPattern([t.identifier('k'), t.identifier('v')])],
                            t.binaryExpression(
                              '+',
                              t.binaryExpression(
                                '+',
                                t.callExpression(t.memberExpression(t.identifier('k'), t.identifier('replace')), [
                                  t.regExpLiteral('[A-Z]', 'g'),
                                  t.stringLiteral('-$&'),
                                ]),
                                t.stringLiteral(': '),
                              ),
                              t.identifier('v'),
                            ),
                          ),
                        ],
                      ),
                      t.identifier('join'),
                    ),
                    [t.stringLiteral('; ')],
                  ),
                  t.callExpression(t.identifier('String'), [valueExpr]),
                )
                updateStmt = t.ifStatement(
                  t.logicalExpression(
                    '||',
                    t.binaryExpression('===', valueExpr, t.nullLiteral()),
                    t.binaryExpression('===', valueExpr, t.identifier('undefined')),
                  ),
                  t.expressionStatement(
                    t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('removeAttribute')), [
                      t.stringLiteral('style'),
                    ]),
                  ),
                  t.blockStatement([
                    t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__newCss'), cssTextExpr)]),
                    t.ifStatement(
                      t.binaryExpression(
                        '!==',
                        t.memberExpression(
                          t.memberExpression(t.identifier('__el'), t.identifier('style')),
                          t.identifier('cssText'),
                        ),
                        t.identifier('__newCss'),
                      ),
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(
                            t.memberExpression(t.identifier('__el'), t.identifier('style')),
                            t.identifier('cssText'),
                          ),
                          t.identifier('__newCss'),
                        ),
                      ),
                    ),
                  ]),
                )
              } else if (attrName === 'dangerouslySetInnerHTML') {
                updateStmt = t.blockStatement([
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      t.identifier('__newHtml'),
                      t.callExpression(t.identifier('String'), [valueExpr]),
                    ),
                  ]),
                  t.ifStatement(
                    t.binaryExpression(
                      '!==',
                      t.memberExpression(t.identifier('__el'), t.identifier('innerHTML')),
                      t.identifier('__newHtml'),
                    ),
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.memberExpression(t.identifier('__el'), t.identifier('innerHTML')),
                        t.identifier('__newHtml'),
                      ),
                    ),
                  ),
                ])
              } else {
                const isBooleanAttr = BOOLEAN_HTML_ATTRS.has(attrName)
                const removeCondition = isBooleanAttr
                  ? t.unaryExpression('!', valueExpr)
                  : t.logicalExpression(
                      '||',
                      t.binaryExpression('===', valueExpr, t.nullLiteral()),
                      t.binaryExpression('===', valueExpr, t.identifier('undefined')),
                    )
                const newAttrValueExpr = isBooleanAttr
                  ? t.stringLiteral('')
                  : URL_ATTRS.has(attrName)
                    ? t.callExpression(t.identifier('__sanitizeAttr'), [
                        t.stringLiteral(attrName),
                        t.callExpression(t.identifier('String'), [valueExpr]),
                      ])
                    : t.callExpression(t.identifier('String'), [valueExpr])
                updateStmt = t.ifStatement(
                  removeCondition,
                  t.expressionStatement(
                    t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('removeAttribute')), [
                      t.stringLiteral(attrName),
                    ]),
                  ),
                  t.blockStatement([
                    t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__newAttr'), newAttrValueExpr)]),
                    t.ifStatement(
                      t.binaryExpression(
                        '!==',
                        t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('getAttribute')), [
                          t.stringLiteral(attrName),
                        ]),
                        t.identifier('__newAttr'),
                      ),
                      t.expressionStatement(
                        t.callExpression(t.memberExpression(t.identifier('__el'), t.identifier('setAttribute')), [
                          t.stringLiteral(attrName),
                          t.identifier('__newAttr'),
                        ]),
                      ),
                    ),
                  ]),
                )
              }
            } else {
              continue
            }
            const useDerivedPropExpr = Boolean(pb.expression && pb.setupStatements)
            const elDecl = t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__el'), elExpr)])
            const corePatch: t.Statement[] = [elDecl]
            let derivedRewrittenExpr: t.Expression | undefined
            let derivedPrunedSetup: t.Statement[] = []
            if (useDerivedPropExpr) {
              const rewrittenSetup = replacePropRefsInStatements(
                pb.setupStatements!,
                templatePropNames,
                templateWholeParam,
              )
              let rewrittenExpr = replacePropRefsInExpression(pb.expression!, templatePropNames, templateWholeParam)
              rewrittenExpr = replaceThisPropsRootWithValueParam(rewrittenExpr, pb.propName)
              derivedRewrittenExpr = rewrittenExpr
              derivedPrunedSetup = pruneDeadParamDestructuring(rewrittenSetup, [rewrittenExpr])
              corePatch.push(...derivedPrunedSetup)
              corePatch.push(
                t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__boundValue'), rewrittenExpr)]),
              )
            }
            corePatch.push(wrapPatchWithElGuard(updateStmt))

            const nullishValue = t.logicalExpression(
              '||',
              t.binaryExpression('===', t.identifier('value'), t.nullLiteral()),
              t.binaryExpression('===', t.identifier('value'), t.identifier('undefined')),
            )
            const guardsNullishInExpr =
              Boolean(derivedRewrittenExpr) && derivedExprGuardsValueWhenNullish(derivedRewrittenExpr!)

            const needsValueNullishGuard =
              useDerivedPropExpr &&
              !guardsNullishInExpr &&
              expressionAccessesValueProperties(derivedRewrittenExpr!, derivedPrunedSetup)

            const blockStatements: t.Statement[] = needsValueNullishGuard
              ? [t.ifStatement(t.unaryExpression('!', nullishValue), t.blockStatement(corePatch))]
              : corePatch

            patchStatementsByBinding.set(pb, blockStatements)
            applied = true
          }

          // Group prop bindings by prop name
          const propBindingsByProp = new Map<string, typeof analysis.propBindings>()
          for (const pb of analysis.propBindings) {
            if (pb.stateOnly) continue
            const list = propBindingsByProp.get(pb.propName) ?? []
            list.push(pb)
            propBindingsByProp.set(pb.propName, list)
          }

          const inlinePatchBodies = new Map<string, t.Statement[]>()
          propBindingsByProp.forEach((bindings, propName) => {
            const statements: t.Statement[] = []
            for (const pb of bindings) {
              const blockStatements = patchStatementsByBinding.get(pb)
              if (blockStatements) {
                if (bindings.length === 1) {
                  statements.push(...blockStatements.map((s) => t.cloneNode(s, true) as t.Statement))
                } else {
                  statements.push(t.blockStatement(blockStatements.map((s) => t.cloneNode(s, true) as t.Statement)))
                }
              }
            }
            if (statements.length > 0) {
              inlinePatchBodies.set(propName, statements)
            }
          })

          // Collect store observe keys from prop binding expressions
          const storeKeyToBindings = new Map<string, Set<PropBinding>>()
          for (const pb of analysis.propBindings) {
            if (!pb.setupStatements?.length && !pb.expression) continue
            const nodesToScan: t.Statement[] = [
              ...(pb.setupStatements || []).map((s) => t.cloneNode(s, true) as t.Statement),
            ]
            if (pb.expression) {
              nodesToScan.push(t.expressionStatement(t.cloneNode(pb.expression, true) as t.Expression))
            }
            const scanProg = t.program(nodesToScan)
            const addToStoreKey = (observeKey: string) => {
              let bindings = storeKeyToBindings.get(observeKey)
              if (!bindings) {
                bindings = new Set()
                storeKeyToBindings.set(observeKey, bindings)
              }
              bindings.add(pb)
            }
            traverse(scanProg, {
              noScope: true,
              Identifier(path: NodePath<t.Identifier>) {
                if (
                  path.parentPath &&
                  t.isMemberExpression(path.parentPath.node) &&
                  path.parentPath.node.object === path.node
                )
                  return
                const ref = stateRefs.get(path.node.name)
                if (!ref || ref.kind !== 'local-destructured' || !ref.propName) return
                addToStoreKey(buildObserveKey([ref.propName]))
              },
              MemberExpression(path: NodePath<t.MemberExpression>) {
                const resolved = resolvePath(path.node, stateRefs)
                if (!resolved?.parts?.length) return
                if (!resolved.isImportedState && !resolved.storeVar && resolved.parts[0] === 'props') return
                const storeVar = resolved.isImportedState ? resolved.storeVar : undefined
                if (storeVar && resolved.parts.length === 1) {
                  const storeRef = stateRefs.get(storeVar)
                  const getterDepPaths = storeRef?.getterDeps?.get(resolved.parts[0])
                  if (getterDepPaths && getterDepPaths.length > 0) {
                    for (const depPath of getterDepPaths) {
                      addToStoreKey(buildObserveKey(depPath, storeVar))
                    }
                    return
                  }
                }
                const observeKey = buildObserveKey(resolved.parts, storeVar)
                addToStoreKey(observeKey)
              },
            })
          }

          // Deduplicate: when a store key has both stateOnly and non-stateOnly
          // bindings for the same element, keep only the stateOnly ones.
          for (const [, bindings] of storeKeyToBindings) {
            const hasStateOnly = [...bindings].some((b) => b.stateOnly)
            if (!hasStateOnly) continue
            for (const pb of bindings) {
              if (pb.stateOnly) continue
              const dup = [...bindings].some((b) => b.stateOnly && b.selector === pb.selector && b.type === pb.type)
              if (dup) bindings.delete(pb)
            }
          }

          handlers.forEach((method, observeKey) => {
            mergeObserveMethod(observeKey, method)
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
              mergeObserveMethod(entry.observeKey, rerenderMethod)
              if (!stateProps.has(entry.observeKey)) {
                stateProps.set(entry.observeKey, entry.pathParts)
              }
            }
          }

          // ── Unresolved maps processing ────────────────────────────────
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
                    ? t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('getElementById')), [
                        t.cloneNode(arrayResult.containerUserIdExpr, true) as t.Expression,
                      ])
                    : containerSuffix
                      ? t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__el')), [
                          t.stringLiteral(containerSuffix),
                        ])
                      : (jsExpr`this.$(":scope")` as t.Expression)

                  const itemIdProp = arrayResult.itemIdProperty
                  const keyFn =
                    itemIdProp && itemIdProp !== ITEM_IS_KEY
                      ? t.arrowFunctionExpression(
                          [t.identifier('opt')],
                          t.memberExpression(t.identifier('opt'), t.identifier(itemIdProp)),
                        )
                      : itemIdProp === ITEM_IS_KEY
                        ? t.arrowFunctionExpression([t.identifier('opt')], t.identifier('opt'))
                        : t.arrowFunctionExpression(
                            [t.identifier('opt'), t.identifier('__k')],
                            t.binaryExpression('+', t.stringLiteral('__idx_'), t.identifier('__k')),
                          )

                  const refreshMethod = t.classMethod(
                    'method',
                    t.identifier(refreshMethodName),
                    [],
                    t.blockStatement([
                      ...arrayResult.arrSetupStatements.map((s) => t.cloneNode(s, true) as t.Statement),
                      t.variableDeclaration('const', [
                        t.variableDeclarator(
                          t.identifier('__arr'),
                          t.logicalExpression(
                            '??',
                            t.cloneNode(arrayResult.arrAccessExpr, true),
                            t.arrayExpression([]),
                          ),
                        ),
                      ]),
                      t.variableDeclaration('const', [
                        t.variableDeclarator(
                          t.identifier('__new'),
                          t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__reconcileList')), [
                            t.memberExpression(t.thisExpression(), t.identifier(itemsName)),
                            t.identifier('__arr'),
                            t.cloneNode(containerExpr, true),
                            t.identifier(arrayResult.componentTag),
                            t.arrowFunctionExpression(
                              [t.identifier('opt')],
                              t.callExpression(
                                t.memberExpression(t.thisExpression(), t.identifier(itemPropsMethodNameRef)),
                                [t.identifier('opt')],
                              ),
                            ),
                            t.cloneNode(keyFn, true),
                          ]),
                        ),
                      ]),
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(
                            t.memberExpression(t.thisExpression(), t.identifier(itemsName)),
                            t.identifier('length'),
                          ),
                          t.numericLiteral(0),
                        ),
                      ),
                      t.expressionStatement(
                        t.callExpression(
                          t.memberExpression(
                            t.memberExpression(t.thisExpression(), t.identifier(itemsName)),
                            t.identifier('push'),
                          ),
                          [t.spreadElement(t.identifier('__new'))],
                        ),
                      ),
                    ]),
                  )
                  classPath.node.body.body.push(refreshMethod)

                  if (computedDeps.length > 0) {
                    computedDeps.forEach((dep) => {
                      mergeObserveMethod(
                        dep.observeKey,
                        t.classMethod(
                          'method',
                          t.identifier(getObserveMethodName(dep.pathParts, dep.storeVar)),
                          [t.identifier('value'), t.identifier('change')],
                          t.blockStatement([
                            t.expressionStatement(
                              t.callExpression(
                                t.memberExpression(t.thisExpression(), t.identifier(refreshMethodName)),
                                [],
                              ),
                            ),
                          ]),
                        ),
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
                applied = true
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
              applied = true
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
                  applied = true
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

          // ── Unresolved map prop refresh deps ──────────────────────────
          const unresolvedMapPropRefreshDeps: Array<{ mapIdx: number; propNames: string[] }> = []
          unresolvedBindings.forEach(({ info, binding }) => {
            const deps = info.dependencies || collectUnresolvedDependencies([info], stateRefs, classPath.node.body)
            if (!info.dependencies) info.dependencies = deps

            const localStateDeps = deps.filter((dep) => !dep.storeVar && dep.pathParts[0] !== 'props')
            const mapIdx = getMapIndex(binding.arrayPathParts)
            for (const dep of localStateDeps) {
              mergeObserveMethod(
                dep.observeKey,
                t.classMethod(
                  'method',
                  t.identifier(getObserveMethodName(dep.pathParts, dep.storeVar)),
                  [t.identifier('value'), t.identifier('change')],
                  t.blockStatement([
                    t.expressionStatement(
                      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSyncMap')), [
                        t.numericLiteral(mapIdx),
                      ]),
                    ),
                  ]),
                ),
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
                t.classMethod(
                  'method',
                  t.identifier('__resetEls'),
                  [],
                  t.blockStatement(
                    elRefFieldNames.map((name) =>
                      t.expressionStatement(
                        t.assignmentExpression(
                          '=',
                          t.memberExpression(t.thisExpression(), t.identifier(name)),
                          t.nullLiteral(),
                        ),
                      ),
                    ),
                  ),
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
          const componentGetterStoreDeps = new Map<
            string,
            Array<{ storeVar: string; pathParts: PathParts; dynamicKeyExpr?: t.Expression }>
          >()
          const getterLocalRefs = new Map<string, Set<string>>()
          const getterNames = new Set<string>()
          for (const member of classPath.node.body.body) {
            if (t.isClassMethod(member) && member.kind === 'get' && t.isIdentifier(member.key))
              getterNames.add(member.key.name)
          }
          for (const member of classPath.node.body.body) {
            if (!t.isClassMethod(member) || member.kind !== 'get' || !t.isIdentifier(member.key)) continue
            const getterName = member.key.name
            const depMap = new Map<string, { storeVar: string; pathParts: PathParts; dynamicKeyExpr?: t.Expression }>()
            const localRefs = new Set<string>()
            const program = t.program(member.body.body.map((s) => t.cloneNode(s, true) as t.Statement))
            traverse(program, {
              noScope: true,
              OptionalMemberExpression(mePath: NodePath<t.OptionalMemberExpression>) {
                const objectNode = mePath.node.object
                if (!t.isMemberExpression(objectNode)) return
                if (!t.isIdentifier(objectNode.object) || !t.isIdentifier(objectNode.property)) return
                const objName = objectNode.object.name
                const ref = stateRefs.get(objName)
                if (!ref || ref.kind !== 'imported') return
                if (!mePath.node.computed || !t.isExpression(mePath.node.property)) return
                if (!canInlineDynamicObserverKey(mePath.node.property)) return
                depMap.set(`${objName}.${objectNode.property.name}`, {
                  storeVar: objName,
                  pathParts: [objectNode.property.name],
                  dynamicKeyExpr: t.cloneNode(mePath.node.property, true),
                })
              },
              MemberExpression(mePath: NodePath<t.MemberExpression>) {
                if (t.isThisExpression(mePath.node.object) && t.isIdentifier(mePath.node.property)) {
                  const propName = mePath.node.property.name
                  if (getterNames.has(propName) && propName !== getterName) localRefs.add(propName)
                  return
                }
                if (
                  t.isMemberExpression(mePath.node.object) &&
                  t.isIdentifier(mePath.node.object.object) &&
                  t.isIdentifier(mePath.node.object.property) &&
                  mePath.node.computed &&
                  t.isExpression(mePath.node.property)
                ) {
                  const objName = mePath.node.object.object.name
                  const ref = stateRefs.get(objName)
                  if (ref && ref.kind === 'imported' && canInlineDynamicObserverKey(mePath.node.property)) {
                    depMap.set(`${objName}.${mePath.node.object.property.name}`, {
                      storeVar: objName,
                      pathParts: [mePath.node.object.property.name],
                      dynamicKeyExpr: t.cloneNode(mePath.node.property, true),
                    })
                    return
                  }
                }
                if (!t.isIdentifier(mePath.node.object)) return
                const objName = mePath.node.object.name
                const ref = stateRefs.get(objName)
                if (!ref || ref.kind !== 'imported') return
                if (!t.isIdentifier(mePath.node.property)) return
                if (!depMap.has(`${objName}.${mePath.node.property.name}`)) {
                  depMap.set(`${objName}.${mePath.node.property.name}`, {
                    storeVar: objName,
                    pathParts: [mePath.node.property.name],
                  })
                }
              },
            })
            const deps = Array.from(depMap.values())
            if (deps.length > 0) componentGetterStoreDeps.set(member.key.name, deps)
            if (localRefs.size > 0) getterLocalRefs.set(member.key.name, localRefs)
          }
          // Propagate transitive deps
          let changed = true
          while (changed) {
            changed = false
            for (const [getterName, refs] of getterLocalRefs) {
              for (const refName of refs) {
                const refDeps = componentGetterStoreDeps.get(refName)
                if (!refDeps) continue
                const existing = componentGetterStoreDeps.get(getterName) || []
                for (const dep of refDeps) {
                  const key = `${dep.storeVar}.${dep.pathParts.join('.')}:${dep.dynamicKeyExpr ? 'dyn' : 'plain'}`
                  if (
                    !existing.some(
                      (e) => `${e.storeVar}.${e.pathParts.join('.')}:${e.dynamicKeyExpr ? 'dyn' : 'plain'}` === key,
                    )
                  ) {
                    existing.push(dep)
                    changed = true
                  }
                }
                if (!componentGetterStoreDeps.has(getterName)) componentGetterStoreDeps.set(getterName, existing)
              }
            }
          }

          // ── Guard state keys ──────────────────────────────────────────
          const guardStateKeys = new Set<string>()
          if (templateMethod && t.isBlockStatement(templateMethod.body)) {
            const tmplBody = templateMethod.body.body
            const returnIdx = tmplBody.findIndex((s) => t.isReturnStatement(s))
            if (returnIdx > 0) {
              for (let gi = 0; gi < returnIdx; gi++) {
                const stmt = tmplBody[gi]
                if (
                  !t.isIfStatement(stmt) ||
                  !(
                    t.isReturnStatement(stmt.consequent) ||
                    (t.isBlockStatement(stmt.consequent) && stmt.consequent.body.some((b) => t.isReturnStatement(b)))
                  )
                )
                  continue
                const guardAliasInits = new Map<string, t.Expression>()
                for (let si = 0; si < gi; si++) {
                  const setupStmt = tmplBody[si]
                  if (!t.isVariableDeclaration(setupStmt)) continue
                  for (const decl of setupStmt.declarations) {
                    if (!t.isIdentifier(decl.id) || !decl.init || !t.isExpression(decl.init)) continue
                    guardAliasInits.set(decl.id.name, decl.init)
                  }
                }
                const addGuardObserveKey = (resolved: {
                  parts: PathParts | null
                  isImportedState?: boolean
                  storeVar?: string
                }) => {
                  if (!resolved?.parts?.length) return
                  if (!resolved.isImportedState) return
                  const observeKey = buildObserveKey(resolved.parts, resolved.storeVar)
                  guardStateKeys.add(observeKey)
                  if (!stateProps.has(observeKey)) stateProps.set(observeKey, [...resolved.parts])
                }
                for (const [aliasName, init] of guardAliasInits) {
                  if (!expressionReferencesIdentifier(stmt.test, aliasName)) continue
                  if (
                    !(
                      t.isIdentifier(init) ||
                      t.isMemberExpression(init) ||
                      t.isThisExpression(init) ||
                      t.isCallExpression(init)
                    )
                  )
                    continue
                  const resolvedAlias = resolvePath(init, stateRefs)
                  if (resolvedAlias) addGuardObserveKey(resolvedAlias)
                }
                const resolveGuardStateExpr = (
                  expr: t.Identifier | t.MemberExpression | t.ThisExpression | t.CallExpression,
                  seen = new Set<string>(),
                ) => {
                  const resolved = resolvePath(expr, stateRefs)
                  if (resolved?.parts?.length && resolved.isImportedState) return resolved
                  if (t.isIdentifier(expr) && !seen.has(expr.name)) {
                    const init = guardAliasInits.get(expr.name)
                    if (
                      init &&
                      (t.isIdentifier(init) ||
                        t.isMemberExpression(init) ||
                        t.isThisExpression(init) ||
                        t.isCallExpression(init))
                    ) {
                      seen.add(expr.name)
                      return resolveGuardStateExpr(init, seen)
                    }
                  }
                  return null
                }
                const guardProg = t.program([t.expressionStatement(t.cloneNode(stmt.test, true) as t.Expression)])
                traverse(guardProg, {
                  noScope: true,
                  Identifier(idPath: NodePath<t.Identifier>) {
                    if (
                      t.isMemberExpression(idPath.parent) &&
                      idPath.parent.property === idPath.node &&
                      !idPath.parent.computed
                    )
                      return
                    const resolved = resolveGuardStateExpr(idPath.node)
                    if (!resolved) return
                    addGuardObserveKey(resolved)
                  },
                })
              }
            }
          }

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
                mergeObserveMethod(
                  observeKey,
                  generateConditionalSlotObserveMethod(propPath, storeVar, conditionalSlotIndices, false),
                )
              } else if (guardStateKeys.has(observeKey)) {
                mergeObserveMethod(observeKey, generateRerenderObserver(propPath, storeVar, true))
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
                mergeObserveMethod(observeKey, relResult.method)
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
                mergeObserveMethod(observeKey, observer)
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
                  mergeObserveMethod(observeKey, generateStoreInlinePatchObserver(propPath, storeVar, patchStatements))
                  hasInlinePatches = true
                }
              }
            }

            if (conditionalSlotIndices.length > 0) {
              mergeObserveMethod(
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
              mergeObserveMethod(observeKey, generateStateChildSwapObserver(propPath, storeVar))
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
              mergeObserveMethod(
                observeKey,
                generateRerenderObserver(propPath, storeVar, guardStateKeys.has(observeKey)),
              )
            } else if (guardStateKeys.has(observeKey)) {
              mergeObserveMethod(observeKey, generateRerenderObserver(propPath, storeVar, true))
            }
          }

          for (const guardKey of guardStateKeys) {
            if (addedMethods.has(guardKey)) continue
            const { parts, storeVar } = parseObserveKey(guardKey)
            mergeObserveMethod(guardKey, generateRerenderObserver(parts, storeVar, true))
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
                  const updateExpr = t.expressionStatement(
                    t.callExpression(
                      t.memberExpression(
                        t.memberExpression(t.thisExpression(), t.identifier(child.instanceVar)),
                        t.identifier('__geaUpdateProps'),
                      ),
                      [
                        t.callExpression(
                          t.memberExpression(
                            t.thisExpression(),
                            t.identifier(`__buildProps_${child.instanceVar.replace(/^_/, '')}`),
                          ),
                          [],
                        ),
                      ],
                    ),
                  )
                  if (!child.lazy) return updateExpr
                  const backingField = `__lazy${child.instanceVar}`
                  return t.ifStatement(
                    t.memberExpression(t.thisExpression(), t.identifier(backingField)),
                    t.blockStatement([updateExpr]),
                  )
                })
              if (existing && t.isBlockStatement(existing.body)) {
                existing.body.body.unshift(...calls)
              } else {
                const method = t.classMethod(
                  'method',
                  t.identifier(methodName),
                  [t.identifier('value'), t.identifier('change')],
                  t.blockStatement(calls),
                )
                classPath.node.body.body.push(method)
                addedMethods.set(observeKey, method)
                applied = true
              }
            })
          }

          // ── Map registrations and sync observers ──────────────────────
          const mapRegistrations: t.ExpressionStatement[] = []
          const mapSyncObservers: Array<{ storeVar: string; pathParts: PathParts; delegateName: string }> = []
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
                mergeObserveMethod(dep.observeKey, unresolvedRelResult.method)
                for (const f of unresolvedRelResult.privateFields) classLevelPrivateFields.add(f)
              } else if (dep.storeVar) {
                if (!delegateEmitted) {
                  classPath.node.body.body.push(
                    appendToBody(
                      jsMethod`${id(delegateName)}() {}`,
                      t.expressionStatement(
                        t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSyncMap')), [
                          t.numericLiteral(mapIdx),
                        ]),
                      ),
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
                const syncBody = t.blockStatement([
                  t.expressionStatement(
                    t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__geaSyncMap')), [
                      t.numericLiteral(mapIdx),
                    ]),
                  ),
                ])
                mergeObserveMethod(
                  dep.observeKey,
                  t.classMethod(
                    'method',
                    t.identifier(getObserveMethodName(dep.pathParts)),
                    [t.identifier('__v'), t.identifier('__c')],
                    syncBody,
                  ),
                )
              }
            })
          })

          if (mapItemAttrInfos.length > 0 && templateMethod) {
            injectMapItemAttrsIntoTemplate(templateMethod, mapItemAttrInfos)
          }

          if (templateMethod && analysis.unresolvedMaps.length > 0) {
            addJoinToUnresolvedMapCalls(templateMethod, analysis.unresolvedMaps)
          }

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
                ? t.memberExpression(t.identifier(storeArrayAccess.storeVar), t.identifier(storeArrayAccess.propName))
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
              applied = true
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
              const refreshStmt = t.expressionStatement(
                t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__refreshList')), [
                  t.stringLiteral(pathKey),
                ]),
              )
              const existing = addedMethods.get(depObserveKey)
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
                const delegateMethod = t.classMethod(
                  'method',
                  t.identifier(depMethodName),
                  [t.identifier('__v'), t.identifier('__c')],
                  t.blockStatement([refreshStmt]),
                )
                mergeObserveMethod(depObserveKey, delegateMethod)
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
              const delegateBody = t.blockStatement([
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__refreshList')), [
                    t.stringLiteral(pathKey),
                  ]),
                ),
              ])
              const delegateMethod = t.classMethod(
                'method',
                t.identifier(depMethodName),
                [t.identifier('__v'), t.identifier('__c')],
                delegateBody,
              )
              mergeObserveMethod(depKey, delegateMethod)
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
              applied = true
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
                  t.variableDeclaration('const', [
                    t.variableDeclarator(t.identifier(initialArrayName), currentValueExpr),
                  ]),
                  t.ifStatement(
                    t.binaryExpression(
                      '>',
                      t.logicalExpression(
                        '||',
                        t.optionalMemberExpression(t.identifier(initialArrayName), t.identifier('length'), false, true),
                        t.numericLiteral(0),
                      ),
                      t.numericLiteral(0),
                    ),
                    t.expressionStatement(
                      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(arrayHandlerMethodName)), [
                        t.identifier(initialArrayName),
                        t.arrayExpression([]),
                      ]),
                    ),
                  ),
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
              mergeObserveMethod(observeKey, h)
            })
            for (const f of handlersResult.privateFields) classLevelPrivateFields.add(f)
          })

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
              let valueExpr: t.Expression
              if (arrayMap.storeVar) {
                valueExpr = t.memberExpression(
                  t.identifier(arrayMap.storeVar),
                  t.identifier(arrayMap.arrayPathParts[0]),
                )
              } else {
                valueExpr = t.memberExpression(t.thisExpression(), t.identifier(arrayMap.arrayPathParts[0]))
              }
              afterRenderCalls.push(
                t.expressionStatement(
                  t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(methodName)), [
                    valueExpr,
                    t.arrayExpression([]),
                  ]),
                ),
              )
            })
            if (afterRenderCalls.length > 0) {
              const afterRenderMethod = t.classMethod(
                'method',
                t.identifier('onAfterRender'),
                [],
                t.blockStatement([
                  t.expressionStatement(
                    t.callExpression(t.memberExpression(t.super(), t.identifier('onAfterRender')), []),
                  ),
                  ...afterRenderCalls,
                ]),
              )
              classPath.node.body.body.push(afterRenderMethod)
            }
          }

          if (renderEventHandlers.length > 0) {
            applied = appendCompiledEventMethods(classPath.node.body, renderEventHandlers) || applied
          }
          if (unresolvedEventHandlers.length > 0) {
            applied = appendCompiledEventMethods(classPath.node.body, unresolvedEventHandlers) || applied
          }

          // ── Final wiring: observer registration ───────────────────────
          if (applied) {
            type ObserverEntry = {
              pathParts: PathParts
              methodName: string
              isVia?: boolean
              rereadExpr?: t.Expression
              dynamicKeyExpr?: t.Expression
              passValue?: boolean
            }
            const importedStores = new Map<
              string,
              {
                captureExpression: t.Expression
                observeHandlers: Map<string, ObserverEntry>
              }
            >()
            const localObserveHandlers = new Map<string, { pathParts: PathParts; methodName: string }>()

            const ensureStoreGroup = (storeVar: string) => {
              if (!importedStores.has(storeVar)) {
                const captureExpression = t.memberExpression(t.identifier(storeVar), t.identifier('__store'))
                importedStores.set(storeVar, {
                  captureExpression,
                  observeHandlers: new Map<string, ObserverEntry>(),
                })
              }
              return importedStores.get(storeVar)!
            }

            addedMethods.forEach((_method, observeKey) => {
              const { parts, storeVar } = parseObserveKey(observeKey)
              if (!storeVar) {
                if (hasOnPropChange && parts[0] === 'props') return
                if (parts.length === 1 && ownClassMethodNames.has(parts[0])) {
                  const compGetterDeps = componentGetterStoreDeps.get(parts[0])
                  if (compGetterDeps && compGetterDeps.length > 0) {
                    const originalMethodName = getObserveMethodName(parts)
                    const originalMethod = addedMethodsByName.get(originalMethodName)
                    for (const dep of compGetterDeps) {
                      const depKey = buildObserveKey(dep.pathParts, dep.storeVar) + `__getter_${parts[0]}`
                      ensureStoreGroup(dep.storeVar).observeHandlers.set(depKey, {
                        pathParts: dep.pathParts,
                        methodName: originalMethodName,
                        isVia: true,
                        rereadExpr: t.memberExpression(t.thisExpression(), t.identifier(parts[0])),
                        passValue: originalMethod ? classMethodUsesParam(originalMethod, 0) : true,
                        ...(dep.dynamicKeyExpr ? { dynamicKeyExpr: dep.dynamicKeyExpr } : {}),
                      })
                    }
                  }
                  return
                }
                localObserveHandlers.set(observeKey, { pathParts: parts, methodName: getObserveMethodName(parts) })
                return
              }
              {
                const storeRef = stateRefs.get(storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(parts[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  const originalMethodName = getObserveMethodName(parts, storeVar)
                  const originalMethod = addedMethodsByName.get(originalMethodName)
                  let rereadExpr: t.Expression = t.memberExpression(t.identifier(storeVar), t.identifier(parts[0]))
                  for (let i = 1; i < parts.length; i++) {
                    rereadExpr = t.optionalMemberExpression(rereadExpr, t.identifier(parts[i]), false, true)
                  }
                  for (const depPath of getterDepPaths) {
                    const depKey = buildObserveKey(depPath, storeVar) + `__getter_${parts.join('_')}`
                    ensureStoreGroup(storeVar).observeHandlers.set(depKey, {
                      pathParts: depPath,
                      methodName: originalMethodName,
                      isVia: true,
                      rereadExpr,
                      passValue: originalMethod ? classMethodUsesParam(originalMethod, 0) : true,
                    })
                  }
                  return
                }
              }
              ensureStoreGroup(storeVar).observeHandlers.set(observeKey, {
                pathParts: parts,
                methodName: getObserveMethodName(parts, storeVar),
              })
            })

            // Map sync observers
            const consolidatedMapSync = new Map<string, (typeof mapSyncObservers)[0]>()
            for (const obs of mapSyncObservers) {
              let resolvedPaths: PathParts[] = [obs.pathParts]
              if (obs.pathParts.length === 1) {
                const storeRef = stateRefs.get(obs.storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(obs.pathParts[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  resolvedPaths = getterDepPaths
                }
              }
              for (const rp of resolvedPaths) {
                const groupKey = `${obs.storeVar}:${obs.delegateName}:${rp.join('_')}`
                consolidatedMapSync.set(groupKey, { ...obs, pathParts: rp })
              }
            }
            for (const obs of consolidatedMapSync.values()) {
              ensureStoreGroup(obs.storeVar).observeHandlers.set(
                `__mapSync_${obs.delegateName}_${obs.pathParts.join('_')}`,
                { pathParts: obs.pathParts, methodName: obs.delegateName },
              )
            }

            for (const obs of storeComponentArrayObservers) {
              const existingObserveKey = buildObserveKey(obs.pathParts, obs.storeVar)
              const existingMethod = addedMethods.get(existingObserveKey)
              if (existingMethod && t.isBlockStatement(existingMethod.body)) {
                const alreadyCalls = existingMethod.body.body.some((stmt) => {
                  if (!t.isExpressionStatement(stmt)) return false
                  const expr = stmt.expression
                  if (!t.isCallExpression(expr) || !t.isMemberExpression(expr.callee)) return false
                  return t.isIdentifier(expr.callee.property) && expr.callee.property.name === obs.refreshMethodName
                })
                if (alreadyCalls) continue
              }
              if (obs.pathParts.length === 1) {
                const storeRef = stateRefs.get(obs.storeVar)
                const getterDepPaths = storeRef?.getterDeps?.get(obs.pathParts[0])
                if (getterDepPaths && getterDepPaths.length > 0) {
                  for (const depPath of getterDepPaths) {
                    const depKey = `__storeCompArray_${obs.refreshMethodName}_dep_${depPath.join('_')}`
                    ensureStoreGroup(obs.storeVar).observeHandlers.set(depKey, {
                      pathParts: depPath,
                      methodName: obs.refreshMethodName,
                    })
                  }
                  continue
                }
              }
              ensureStoreGroup(obs.storeVar).observeHandlers.set(`__storeCompArray_${obs.refreshMethodName}`, {
                pathParts: obs.pathParts,
                methodName: obs.refreshMethodName,
              })
            }

            // Inject null guards for observer methods under early-return guards
            if (guardStateKeys.size > 0) {
              addedMethods.forEach((method, observeKey) => {
                const { parts, storeVar: sv } = parseObserveKey(observeKey)
                if (!sv) return

                if (parts.length >= 2) {
                  for (let prefixLen = 1; prefixLen < parts.length; prefixLen++) {
                    const prefixKey = buildObserveKey(parts.slice(0, prefixLen), sv)
                    if (guardStateKeys.has(prefixKey)) {
                      const guardCheck = t.ifStatement(
                        t.binaryExpression(
                          '==',
                          t.memberExpression(t.identifier(sv), t.identifier(parts[prefixLen - 1])),
                          t.nullLiteral(),
                        ),
                        t.returnStatement(),
                      )
                      if (t.isBlockStatement(method.body)) {
                        method.body.body.unshift(guardCheck)
                      }
                      break
                    }
                  }
                } else if (parts.length === 1) {
                  const storeRef = stateRefs.get(sv)
                  if (storeRef?.getterDeps) {
                    for (const [getterName, depPaths] of storeRef.getterDeps) {
                      const isDepOfGetter = depPaths.some((dp) => dp.length === 1 && dp[0] === parts[0])
                      if (!isDepOfGetter) continue
                      const guardKey = buildObserveKey([getterName], sv)
                      if (!guardStateKeys.has(guardKey)) continue
                      const guardCheck = t.ifStatement(
                        t.binaryExpression(
                          '==',
                          t.memberExpression(t.identifier(sv), t.identifier(getterName)),
                          t.nullLiteral(),
                        ),
                        t.returnStatement(),
                      )
                      if (t.isBlockStatement(method.body)) {
                        method.body.body.unshift(guardCheck)
                      }
                      break
                    }
                  }
                }
              })
            }

            // Deduplicate observer methods with identical bodies
            {
              const seen = new Set<t.ClassMethod>()
              const methodEntries: Array<{ observeKey: string; method: t.ClassMethod; name: string }> = []
              addedMethods.forEach((method, observeKey) => {
                if (seen.has(method)) return
                seen.add(method)
                const name = getMethodName(method)
                if (name) methodEntries.push({ observeKey, method, name })
              })

              const bodyGroups = new Map<string, typeof methodEntries>()
              for (const entry of methodEntries) {
                const { storeVar } = parseObserveKey(entry.observeKey)
                const bodyCode = (storeVar || '') + ':' + generate(t.blockStatement(entry.method.body.body)).code
                if (!bodyGroups.has(bodyCode)) bodyGroups.set(bodyCode, [])
                bodyGroups.get(bodyCode)!.push(entry)
              }

              const renameMap = new Map<string, string>()
              for (const [, group] of bodyGroups) {
                if (group.length < 2) continue
                const canonical = group[0]
                for (let i = 1; i < group.length; i++) {
                  const dup = group[i]
                  renameMap.set(dup.name, canonical.name)
                  const idx = classPath.node.body.body.indexOf(dup.method)
                  if (idx !== -1) classPath.node.body.body.splice(idx, 1)
                }
              }

              if (renameMap.size > 0) {
                for (const [, config] of importedStores) {
                  for (const [key, entry] of config.observeHandlers) {
                    if (renameMap.has(entry.methodName)) {
                      config.observeHandlers.set(key, { ...entry, methodName: renameMap.get(entry.methodName)! })
                    }
                  }
                }
                for (const [key, entry] of localObserveHandlers) {
                  if (renameMap.has(entry.methodName)) {
                    localObserveHandlers.set(key, { ...entry, methodName: renameMap.get(entry.methodName)! })
                  }
                }
              }
            }

            // ── Emit createdHooks, local observers, after-render hooks ──
            if (importedStores.size > 0 || localObserveHandlers.size > 0 || mapRegistrations.length > 0) {
              const storeConfigs = Array.from(importedStores.entries()).map(([storeVar, config]) => ({
                storeVar,
                captureExpression: config.captureExpression,
                observeHandlers: Array.from(config.observeHandlers.values()).map(
                  ({ pathParts, methodName, isVia, rereadExpr, dynamicKeyExpr, passValue }) => ({
                    pathParts,
                    methodName,
                    isVia,
                    rereadExpr,
                    dynamicKeyExpr,
                    passValue,
                  }),
                ),
              }))

              for (const olc of observeListConfigs) {
                ensureStoreGroup(olc.storeVar)
              }

              if (storeConfigs.length > 0 || mapRegistrations.length > 0 || observeListConfigs.length > 0) {
                const createdHooksMethod = generateCreatedHooks(
                  storeConfigs,
                  htmlArrayMaps.length > 0,
                  observeListConfigs,
                )
                if (mapRegistrations.length > 0) {
                  createdHooksMethod.body.body.push(...mapRegistrations)
                }
                const generatedCreatedHooksBody = createdHooksMethod.body.body
                const existingCreatedHooks = classPath.node.body.body.find(
                  (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'createdHooks',
                ) as t.ClassMethod | undefined
                if (existingCreatedHooks) {
                  existingCreatedHooks.body.body.unshift(...generatedCreatedHooksBody)
                } else {
                  classPath.node.body.body.push(createdHooksMethod)
                }
              }
              if (staticArrayRefreshOnMount.length > 0 || initialHtmlArrayRefreshOnMount.length > 0) {
                const refreshStmts = [
                  ...[...new Set(staticArrayRefreshOnMount)].map((name) =>
                    t.expressionStatement(
                      t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(name)), []),
                    ),
                  ),
                  ...initialHtmlArrayRefreshOnMount,
                ]
                const existingHook = classPath.node.body.body.find(
                  (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'onAfterRenderHooks',
                ) as t.ClassMethod | undefined
                if (existingHook) existingHook.body.body.push(...refreshStmts)
                else
                  classPath.node.body.body.push(
                    t.classMethod('method', t.identifier('onAfterRenderHooks'), [], t.blockStatement(refreshStmts)),
                  )
              }
              if (localObserveHandlers.size > 0) {
                classPath.node.body.body.push(
                  generateLocalStateObserverSetup(Array.from(localObserveHandlers.values()), htmlArrayMaps.length > 0),
                )
              }
            }
          }

          // ── Private fields ────────────────────────────────────────────
          if (needsClassLevelRawStoreField) classLevelPrivateFields.add('__rs')
          for (const fieldName of classLevelPrivateFields) {
            const alreadyHas = classPath.node.body.body.some(
              (n) => t.isClassPrivateProperty(n) && t.isIdentifier(n.key.id) && n.key.id.name === fieldName,
            )
            if (!alreadyHas) {
              classPath.node.body.body.unshift(t.classPrivateProperty(t.privateName(t.identifier(fieldName))))
            }
          }
        },
      })
    },
  })

  if (needsModuleLevelUnwrapHelper) {
    const alreadyHas = ast.program.body.some(
      (stmt) =>
        t.isVariableDeclaration(stmt) && stmt.declarations.some((d) => t.isIdentifier(d.id) && d.id.name === '__v'),
    )
    if (!alreadyHas) {
      ast.program.body.unshift(buildValueUnwrapHelper())
    }
  }

  return applied
}
